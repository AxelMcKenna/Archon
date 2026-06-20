"""Tier 2 — LLM semantic reconciliation of spec ↔ drawing (gated).

Tier 1 (``coordination.rules``) catches gaps by entity matching. Tier 2 reads
the actual spec prose + drawing schedule/register text and asks an LLM for the
fuzzy cross-document clashes keyword matching can't see — a schedule value that
contradicts a spec clause, a system described differently on each side.

Text-only tool call (mirrors ``app.classifier.ai``: ``images=[]`` + a tool
schema). Every emitted flag cites exactly one spec and one drawing document, so
it inherits Tier 1's "never single-source noise" property. Gated behind
``settings.spec_coordination_enabled`` by the caller; fail-open (returns ``[]``
on any provider/parse error so a bad LLM call never breaks a run).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.coordination.rules import CATEGORY
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"
ACTIVE_PROMPT = "spec_coordination_v1.md"

_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_coordination",
    "description": "Record cross-document spec↔drawing discrepancies.",
    "input_schema": {
        "type": "object",
        "required": ["discrepancies"],
        "properties": {
            "discrepancies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "area",
                        "severity",
                        "confidence",
                        "reason",
                        "recommended_action",
                        "spec_ref",
                        "spec_quote",
                        "drawing_ref",
                        "drawing_quote",
                    ],
                    "properties": {
                        "area": {"type": "string"},
                        "severity": {"enum": ["must_resolve", "nice_to_have"]},
                        "confidence": {"enum": ["low", "medium", "high"]},
                        "reason": {"type": "string", "minLength": 10},
                        "recommended_action": {"type": "string", "minLength": 5},
                        "spec_ref": {"type": "string"},
                        "spec_quote": {"type": "string"},
                        "drawing_ref": {"type": "string"},
                        "drawing_quote": {"type": "string"},
                    },
                },
            }
        },
    },
}


@lru_cache
def _load_prompt(name: str) -> tuple[str, str]:
    raw = (PROMPTS_DIR / name).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError(f"Prompt {name} missing frontmatter")
    version = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    return fm.group(2), (version.group(1) if version else "0")


def _fill(template: str, **kw: str) -> str:
    out = template
    for k, v in kw.items():
        out = out.replace("{{" + k + "}}", v)
    return out


def _blocks(docs: list[tuple[dict[str, Any], dict[str, Any]]]) -> list[dict[str, Any]]:
    """``[(row, extraction_block)]`` -> compact JSON-able records with a stable
    ``ref`` the model echoes back so we can map a citation to its document."""
    out = []
    for row, block in docs:
        out.append(
            {
                "ref": str(row.get("id")),
                "filename": row.get("filename"),
                "extraction": block,
            }
        )
    return out


def reconcile_documents_llm(
    *,
    specs: list[tuple[dict[str, Any], dict[str, Any]]],
    drawings: list[tuple[dict[str, Any], dict[str, Any]]],
    settings: Any,
) -> list[dict[str, Any]]:
    """One text tool call reconciling the project's specs against its drawings.

    ``specs``/``drawings`` are ``[(row, extraction_block)]`` — the same rows and
    extraction blocks Tier 1 builds claims from. Returns coordination flags
    (``tier='llm'``) or ``[]`` on no findings / any failure."""
    if not specs or not drawings:
        return []

    spec_by_ref = {str(r.get("id")): r for r, _ in specs}
    draw_by_ref = {str(r.get("id")): r for r, _ in drawings}

    template, _version = _load_prompt(ACTIVE_PROMPT)
    prompt = _fill(
        template,
        spec_blocks=json.dumps(_blocks(specs), indent=2)[:60000],
        drawing_blocks=json.dumps(_blocks(drawings), indent=2)[:60000],
    )

    try:
        if settings.classifier_provider == "openrouter":
            result = call_openrouter_tool(
                images=[],
                prompt=prompt,
                tool_name=_TOOL_SCHEMA["name"],
                tool_description=_TOOL_SCHEMA["description"],
                tool_parameters=_TOOL_SCHEMA["input_schema"],
                max_output_tokens=3000,
                model=settings.openrouter_model,
            )
        else:
            result = call_gemini_tool(
                images=[],
                prompt=prompt,
                tool_name=_TOOL_SCHEMA["name"],
                tool_description=_TOOL_SCHEMA["description"],
                tool_parameters=_TOOL_SCHEMA["input_schema"],
                max_output_tokens=3000,
                model=settings.gemini_model,
            )
    except Exception as exc:  # noqa: BLE001 — Tier 2 must never break a run
        log.warning("coordination Tier 2: LLM call failed: %s", exc)
        return []

    discrepancies = (result.payload or {}).get("discrepancies") or []
    return [
        flag
        for d in discrepancies
        if (flag := _to_flag(d, spec_by_ref, draw_by_ref)) is not None
    ]


def _to_flag(
    d: dict[str, Any],
    spec_by_ref: dict[str, dict[str, Any]],
    draw_by_ref: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    """Map one discrepancy onto a coordination flag. Dropped when either side is
    ungrounded — the model occasionally invents a ref, and an ungrounded
    cross-document flag is worse than a missed one."""
    spec_row = spec_by_ref.get(str(d.get("spec_ref")))
    draw_row = draw_by_ref.get(str(d.get("drawing_ref")))
    spec_quote = str(d.get("spec_quote") or "").strip()
    draw_quote = str(d.get("drawing_quote") or "").strip()
    if not spec_row or not draw_row or not spec_quote or not draw_quote:
        return None
    return {
        "category": CATEGORY,
        "severity": d.get("severity", "must_resolve"),
        "confidence": d.get("confidence", "medium"),
        "area": str(d.get("area") or "")[:500],
        "reason": str(d.get("reason") or "")[:500],
        "recommended_action": str(d.get("recommended_action") or "")[:500],
        "_rule": "llm_spec_drawing_reconcile",
        "tier": "llm",
        "citations": [
            {
                "source_kind": "spec",
                "source_id": str(spec_row.get("id")),
                "filename": spec_row.get("filename"),
                "page": 1,
                "quote": spec_quote[:300],
            },
            {
                "source_kind": "drawing",
                "source_id": str(draw_row.get("id")),
                "filename": draw_row.get("filename"),
                "page": 1,
                "quote": draw_quote[:300],
            },
        ],
    }


def llm_flag_signature(flag: dict[str, Any]) -> str:
    """Coarse dedup key: the cited document pair + a normalized area, so a Tier 2
    flag that restates a Tier 1 finding for the same documents is dropped."""
    ids = sorted(str(c.get("source_id")) for c in flag.get("citations") or [])
    area = re.sub(r"[^a-z0-9]+", "", str(flag.get("area") or "").lower())[:24]
    return hashlib.sha1(("|".join(ids) + "|" + area).encode()).hexdigest()
