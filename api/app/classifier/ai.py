"""Claude AI classifier (FR-2.11 — FR-2.14).

- Loads versioned prompt template from /api/prompts/classifier_v1.md
- Uses tool-use for structured JSON output
- Caches by content hash (item raw_text + project context + prompt version)
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import anthropic

from app.config import get_settings
from app.extractors.markdown import render_item
from app.models import AiPrediction, RfiItem

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"
ACTIVE_PROMPT = "classifier_v1.md"

_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_classification",
    "description": "Record the classification of an RFI line item.",
    "input_schema": {
        "type": "object",
        "required": ["primary_category", "severity", "confidence", "reasoning"],
        "properties": {
            "primary_category": {"type": "string"},
            "secondary_category": {"type": ["string", "null"]},
            "severity": {"enum": ["must_resolve", "nice_to_have"]},
            "confidence": {"enum": ["low", "medium", "high"]},
            "reasoning": {"type": "string", "minLength": 10},
        },
    },
}


@lru_cache
def _load_prompt(name: str) -> tuple[str, str, str]:
    """Returns (template_body, version, content_hash)."""
    raw = (PROMPTS_DIR / name).read_text(encoding="utf-8")
    fm_match = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm_match:
        raise ValueError(f"Prompt {name} missing frontmatter")
    fm = fm_match.group(1)
    body = fm_match.group(2)
    version_match = re.search(r'version:\s*"?([\d.]+)"?', fm)
    if not version_match:
        raise ValueError(f"Prompt {name} missing version in frontmatter")
    return body, version_match.group(1), hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out


def _cache_key(item: RfiItem, bca: str, project_type: str, prompt_version: str) -> str:
    h = hashlib.sha256()
    h.update(item.raw_text.encode("utf-8"))
    h.update(b"|")
    h.update(item.extracted.model_dump_json().encode("utf-8"))
    h.update(b"|")
    h.update(f"{bca}|{project_type}|{prompt_version}".encode("utf-8"))
    return h.hexdigest()


# In-memory cache (process-local). Real cache lives in DB / redis in prod.
_AI_CACHE: dict[str, AiPrediction] = {}


def classify(
    item: RfiItem,
    *,
    bca: str,
    project_type: str,
    project_description: str,
) -> AiPrediction:
    template, version, _hash = _load_prompt(ACTIVE_PROMPT)
    key = _cache_key(item, bca, project_type, version)
    if key in _AI_CACHE:
        return _AI_CACHE[key]

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = _fill(
        template,
        bca=bca,
        project_type=project_type,
        project_description=project_description or "(none provided)",
        item_markdown=render_item(item),
    )

    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "record_classification"},
        messages=[{"role": "user", "content": prompt}],
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("AI classifier did not return tool use")
    payload: dict[str, Any] = tool_use.input  # type: ignore[assignment]

    pred = AiPrediction(
        primary_category=payload["primary_category"],
        secondary_category=payload.get("secondary_category"),
        severity=payload["severity"],
        confidence=payload["confidence"],
        reasoning=payload["reasoning"],
        prompt_version=version,
    )
    _AI_CACHE[key] = pred
    return pred
