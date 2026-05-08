"""Pre-lodgement building-plan analyser (Phase 5+).

User uploads their proposed plan set; Claude vision reads each page and
returns structured flags for items that would likely trigger an RFI from
the target BCA.

Output schema is grounded in the live taxonomy (1.1 categories) so flags
slot directly into the same UI surfaces the RFI workflow uses.
"""

from __future__ import annotations

import base64
import io
import json
import re
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import anthropic
import pdfplumber

from app.config import get_settings
from app.extractors.metrics import Metrics
from app.taxonomy import get_taxonomy

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
ACTIVE_PROMPT = "plan_analyser_v1.md"
ANALYSER_VERSION = "1.0.0"

_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_plan_analysis",
    "description": "Record the structured analysis of a building plan.",
    "input_schema": {
        "type": "object",
        "required": ["flags", "summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 20},
            "flags": {
                "type": "array",
                "maxItems": 25,
                "items": {
                    "type": "object",
                    "required": [
                        "page",
                        "area",
                        "category",
                        "severity",
                        "reason",
                        "recommended_action",
                    ],
                    "properties": {
                        "page": {"type": "integer", "minimum": 1},
                        "area": {"type": "string", "minLength": 4},
                        "category": {"type": "string"},
                        "severity": {"enum": ["must_resolve", "nice_to_have"]},
                        "reason": {"type": "string", "minLength": 12},
                        "recommended_action": {"type": "string", "minLength": 8},
                    },
                },
            },
        },
    },
}


@lru_cache
def _load_prompt() -> tuple[str, str]:
    raw = (PROMPTS_DIR / ACTIVE_PROMPT).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError("plan analyser prompt missing frontmatter")
    body = fm.group(2)
    version = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    if not version:
        raise ValueError("plan analyser prompt missing version")
    return body, version.group(1)


def _taxonomy_block() -> str:
    """Render the categories list as a JSON snippet for the prompt."""
    tx = get_taxonomy()
    rows = [
        {"id": c["id"], "label": c["label"], "weight": c.get("weight")}
        for c in tx["categories"]
    ]
    return json.dumps(rows, indent=2)


def _pdf_to_images(pdf_bytes: bytes, max_pages: int = 20) -> list[bytes]:
    images: list[bytes] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:max_pages]:
            im = page.to_image(resolution=150).original
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            images.append(buf.getvalue())
    return images


def _image_block(png_bytes: bytes) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.b64encode(png_bytes).decode("ascii"),
        },
    }


def _fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out


def analyse_plan(
    *,
    file_bytes: bytes,
    media_type: str,
    bca: str,
    project_type: str,
    project_description: str,
) -> tuple[dict[str, Any], str, Metrics]:
    """Returns (analysis_json, prompt_version, metrics).

    analysis_json is the tool-use payload {flags: [...], summary: str,
    taxonomy_version: str}.
    """
    template, version = _load_prompt()
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    if media_type == "application/pdf":
        images = _pdf_to_images(file_bytes)
    else:
        images = [file_bytes]

    tx = get_taxonomy()
    bca_meta = next((b for b in tx["bcas"] if b["id"] == bca), {"name": bca})

    prompt = _fill(
        template,
        bca=bca,
        bca_long=bca_meta.get("name", bca),
        project_type=project_type,
        project_description=project_description or "(none provided)",
        taxonomy=_taxonomy_block(),
    )

    content: list[dict[str, Any]] = [_image_block(img) for img in images]
    content.append({"type": "text", "text": prompt})

    t0 = time.monotonic()
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=4000,
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "record_plan_analysis"},
        messages=[{"role": "user", "content": content}],
    )
    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("plan analyser did not return tool use")
    payload: dict[str, Any] = dict(tool_use.input)  # type: ignore[arg-type]
    payload["taxonomy_version"] = tx.get("schema_version", "1.0")
    payload["pages_analysed"] = len(images)

    metrics = Metrics(
        processing_ms=int((time.monotonic() - t0) * 1000),
        input_tokens=int(getattr(response.usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(response.usage, "output_tokens", 0) or 0),
    )
    return payload, version, metrics
