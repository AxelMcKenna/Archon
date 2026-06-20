"""AI classifier (FR-2.11 — FR-2.14).

- Loads versioned prompt template from /api/prompts/classifier_v1.md
- Uses tool-use for structured JSON output via the configured provider
  (gemini or openrouter)
- Caches by content hash (item raw_text + project context + prompt version)
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.extractors.markdown import render_item
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool
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


def _cache_key(
    item: RfiItem,
    bca: str,
    project_type: str,
    risk_group: str,
    importance_level: str,
    prompt_version: str,
) -> str:
    h = hashlib.sha256()
    h.update(item.raw_text.encode("utf-8"))
    h.update(b"|")
    h.update(item.extracted.model_dump_json().encode("utf-8"))
    h.update(b"|")
    h.update(
        f"{bca}|{project_type}|{risk_group}|{importance_level}|{prompt_version}".encode()
    )
    return h.hexdigest()


# In-memory cache (process-local). Real cache lives in DB / redis in prod. TODO: set redis up
_AI_CACHE: dict[str, AiPrediction] = {}


def classify(
    item: RfiItem,
    *,
    bca: str,
    project_type: str,
    project_description: str,
    risk_group: str = "",
    importance_level: str = "",
) -> AiPrediction:
    template, version, _hash = _load_prompt(ACTIVE_PROMPT)
    key = _cache_key(item, bca, project_type, risk_group, importance_level, version)
    if key in _AI_CACHE:
        return _AI_CACHE[key]

    settings = get_settings()

    prompt = _fill(
        template,
        bca=bca,
        project_type=project_type,
        risk_group=risk_group or "(not specified)",
        importance_level=importance_level or "(not specified)",
        project_description=project_description or "(none provided)",
        item_markdown=render_item(item),
    )

    if settings.classifier_provider == "openrouter":
        result = call_openrouter_tool(
            images=[],
            prompt=prompt,
            tool_name=_TOOL_SCHEMA["name"],
            tool_description=_TOOL_SCHEMA["description"],
            tool_parameters=_TOOL_SCHEMA["input_schema"],
            max_output_tokens=1024,
            model=settings.openrouter_model,
        )
    else:
        result = call_gemini_tool(
            images=[],
            prompt=prompt,
            tool_name=_TOOL_SCHEMA["name"],
            tool_description=_TOOL_SCHEMA["description"],
            tool_parameters=_TOOL_SCHEMA["input_schema"],
            max_output_tokens=1024,
            model=settings.gemini_model,
        )
    payload: dict[str, Any] = result.payload

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


async def classify_async(
    item: RfiItem,
    *,
    bca: str,
    project_type: str,
    project_description: str,
    risk_group: str = "",
    importance_level: str = "",
) -> AiPrediction:
    """Awaitable variant — runs the sync classify on a worker thread.

    Lets handlers ``asyncio.gather`` many per-item classifications in
    parallel without blocking the FastAPI event loop on each LLM call.
    The cache is shared with the sync ``classify``, so a cache hit
    returns immediately without entering the threadpool.
    """
    template, version, _hash = _load_prompt(ACTIVE_PROMPT)
    key = _cache_key(item, bca, project_type, risk_group, importance_level, version)
    if key in _AI_CACHE:
        return _AI_CACHE[key]
    return await asyncio.to_thread(
        classify,
        item,
        bca=bca,
        project_type=project_type,
        project_description=project_description,
        risk_group=risk_group,
        importance_level=importance_level,
    )
