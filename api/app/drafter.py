"""Per-item response drafter (FR-3.1, FR-3.2).

Versioned prompt; Claude tool-use for structured output. Caches by item +
category + prompt version.
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import anthropic

from app.config import get_settings
from app.extractors.metrics import Metrics

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
ACTIVE_PROMPT = "drafter_v1.md"

_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_draft",
    "description": "Record the drafted RFI response.",
    "input_schema": {
        "type": "object",
        "required": ["draft_text"],
        "properties": {
            "draft_text": {
                "type": "string",
                "minLength": 60,
                "description": "Markdown body. May contain [ATTACH: …] placeholders.",
            },
        },
    },
}


@lru_cache
def _load_prompt(name: str) -> tuple[str, str]:
    raw = (PROMPTS_DIR / name).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError(f"Prompt {name} missing frontmatter")
    body = fm.group(2)
    version_match = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    if not version_match:
        raise ValueError(f"Prompt {name} missing version")
    return body, version_match.group(1)


def _fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out


_DRAFT_CACHE: dict[str, tuple[str, str]] = {}


def draft_response(
    *,
    bca: str,
    project_type: str,
    project_description: str,
    application_ref: str | None,
    rfi_number: int | None,
    item_text: str,
    category: str,
    severity: str,
    reasoning: str,
    acceptable_solution: str | None,
) -> tuple[str, str, Metrics]:
    """Returns (draft_text, prompt_version, metrics)."""
    template, version = _load_prompt(ACTIVE_PROMPT)
    cache_key = hashlib.sha256(
        f"{item_text}|{category}|{bca}|{project_type}|{version}".encode()
    ).hexdigest()
    if cache_key in _DRAFT_CACHE:
        cached, ver = _DRAFT_CACHE[cache_key]
        return cached, ver, Metrics()

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = _fill(
        template,
        bca=bca,
        project_type=project_type,
        project_description=project_description or "(none provided)",
        application_ref=application_ref or "(not yet lodged)",
        rfi_number=str(rfi_number or "?"),
        item_text=item_text,
        category=category,
        severity=severity,
        reasoning=reasoning or "(none)",
        acceptable_solution=acceptable_solution or "(none for this category)",
    )

    import time

    t0 = time.monotonic()
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2000,
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "record_draft"},
        messages=[{"role": "user", "content": prompt}],
    )
    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("Drafter did not return tool use")
    payload: dict[str, Any] = tool_use.input  # type: ignore[assignment]
    draft = payload["draft_text"]
    _DRAFT_CACHE[cache_key] = (draft, version)
    metrics = Metrics(
        processing_ms=int((time.monotonic() - t0) * 1000),
        input_tokens=int(getattr(response.usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(response.usage, "output_tokens", 0) or 0),
    )
    return draft, version, metrics
