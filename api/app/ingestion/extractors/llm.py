"""LLM cleanup pass shared by the MBIE and council extractors.

Each extractor narrows a document to small candidate passages via
deterministic rules; this module turns one passage into zero or more
``KBCandidate`` rows via a cheap LLM call.

Why factor it out: both text-based extractors run the same shape of
prompt + tool schema, only the source-context fields differ. Keeping
the LLM call here avoids two near-identical implementations.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool

log = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "ve_extractor_v1.md"

SUBSTITUTION_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_substitution_candidates",
    "description": (
        "Record cost-reduction substitution opportunities found in a "
        "single passage from an NZ residential-construction source "
        "document (MBIE Acceptable Solution, council guidance, "
        "manufacturer datasheet). Return an empty list when the passage "
        "describes no opportunity."
    ),
    "input_schema": {
        "type": "object",
        "required": ["candidates"],
        "properties": {
            "candidates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "category",
                        "current_spec_patterns",
                        "proposed_alternative",
                        "cost_impact",
                        "confidence",
                        "rationale",
                        "extracted_clause",
                    ],
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": [
                                "material_substitution",
                                "structural_oversize",
                                "treatment_downgrade",
                                "product_alternative",
                                "detail_simplification",
                                "finish_downgrade",
                            ],
                        },
                        "subcategory": {"type": "string", "maxLength": 80},
                        "current_spec_patterns": {
                            "type": "array",
                            "items": {"type": "string", "minLength": 2, "maxLength": 80},
                            "minItems": 1,
                            "maxItems": 8,
                        },
                        "proposed_alternative": {
                            "type": "string",
                            "minLength": 8,
                            "maxLength": 400,
                        },
                        "cost_impact": {"enum": ["low", "medium", "high"]},
                        "confidence": {"enum": ["low", "medium", "high"]},
                        "rationale": {
                            "type": "string",
                            "minLength": 12,
                            "maxLength": 500,
                        },
                        "applicability_conditions": {
                            "type": "object",
                            "description": (
                                "Structured conditions for when the "
                                "substitution applies (e.g. {wind_zone: "
                                "[\"low\",\"medium\"], exposure_zone: "
                                "[\"B\",\"C\"]}). Omit when unconditional."
                            ),
                        },
                        "extracted_clause": {
                            "type": "string",
                            "minLength": 8,
                            "maxLength": 300,
                        },
                    },
                },
            }
        },
    },
}


@lru_cache
def _load_prompt_template() -> tuple[str, str]:
    raw = PROMPT_PATH.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not m:
        raise ValueError("ve_extractor prompt missing frontmatter")
    body = m.group(2)
    ver_match = re.search(r'version:\s*"?([\d.]+)"?', m.group(1))
    if not ver_match:
        raise ValueError("ve_extractor prompt missing version")
    return body, ver_match.group(1)


def prompt_version() -> str:
    return _load_prompt_template()[1]


def _fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out


def call_cleanup(
    *,
    passage: str,
    source_kind: str,
    source_label: str,
    clause_reference: str,
) -> list[dict[str, Any]]:
    """One LLM call against one passage; returns raw candidate dicts.

    Returns an empty list on any LLM error or empty output — the caller
    treats those as 'no candidate found'.
    """
    template, _ = _load_prompt_template()
    prompt = _fill(
        template,
        source_kind=source_kind,
        source_label=source_label,
        clause_reference=clause_reference,
    )
    full_prompt = f"{prompt}\n\n## Passage\n\n```\n{passage}\n```\n"

    settings = get_settings()
    try:
        if settings.plan_analyser_provider == "openrouter":
            result = call_openrouter_tool(
                images=[],
                image_captions=[],
                prompt=full_prompt,
                tool_name=SUBSTITUTION_TOOL_SCHEMA["name"],
                tool_description=SUBSTITUTION_TOOL_SCHEMA["description"],
                tool_parameters=SUBSTITUTION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
                model=settings.openrouter_verifier_model,
            )
            payload = result.payload
        else:
            result = call_gemini_tool(
                images=[],
                image_captions=[],
                prompt=full_prompt,
                tool_name=SUBSTITUTION_TOOL_SCHEMA["name"],
                tool_description=SUBSTITUTION_TOOL_SCHEMA["description"],
                tool_parameters=SUBSTITUTION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
                model=settings.gemini_verifier_model,
            )
            payload = result.payload
    except Exception as e:  # noqa: BLE001
        log.warning("ve cleanup LLM call failed: %s", e)
        return []

    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return []
    return [c for c in candidates if isinstance(c, dict)]
