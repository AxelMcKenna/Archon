"""CAD analyser: runs the vision + entity-list pass and returns flags
with handle-grounded targets and an optional proposed_change op.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.cad.cad_grounding import ground_item_handles, load_and_index_dxf
from app.cad.cad_ops import parse_ops
from app.config import get_settings
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool
from app.vision.core.localization import target_handles_prop

CAD_ANALYSIS_VERSION = "1.0.0"

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "cad_analyser_v1.md"


@dataclass
class CadMetrics:
    processing_ms: int
    cost_usd: float
    input_tokens: int
    output_tokens: int


def _read_prompt() -> tuple[str, str]:
    """Returns (body, version)."""
    text = _PROMPT_PATH.read_text()
    m = re.search(r'^version:\s*"([^"]+)"', text, re.MULTILINE)
    version = m.group(1) if m else "0"
    body = re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.DOTALL)
    return body, version


def _flag_tool_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "flags": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "rule_cited": {"type": "string"},
                        "rationale": {"type": "string"},
                        "severity": {
                            "type": "string",
                            "enum": ["must_resolve", "nice_to_have"],
                        },
                        "target_handles": target_handles_prop(),
                        "verbatim_quote": {"type": "string"},
                        "proposed_change": {
                            "type": "object",
                            "properties": {
                                "op": {"type": "string"},
                                "handle": {"type": "string"},
                                "from_handle": {"type": "string"},
                                "to_handle": {"type": "string"},
                                "anchor_handle": {"type": "string"},
                                "dx": {"type": "number"},
                                "dy": {"type": "number"},
                                "distance": {"type": "number"},
                                "side": {"type": "string"},
                                "scale_x": {"type": "number"},
                                "scale_y": {"type": "number"},
                                "offset": {"type": "number"},
                                "text": {"type": "string"},
                                "height": {"type": "number"},
                                "layer": {"type": "string"},
                                "symbol": {"type": "string"},
                                "x": {"type": "number"},
                                "y": {"type": "number"},
                                "label": {"type": "string"},
                            },
                            "required": ["op"],
                        },
                    },
                    "required": ["rule_cited", "rationale", "severity", "target_handles"],
                },
            }
        },
        "required": ["flags"],
    }


def analyse_cad(
    *,
    dxf_bytes: bytes,
    bca: str,
    project_type: str,
    project_description: str,
) -> tuple[dict[str, Any], str, CadMetrics, dict[str, Any]]:
    """Run the analyser. Returns (analysis, prompt_version, metrics, extras)."""
    import time

    t0 = time.monotonic()
    # Render every view; the vision pass sees them all.
    grounded = load_and_index_dxf(dxf_bytes)

    body, version = _read_prompt()
    prompt = (
        body.replace("{{bca}}", bca or "")
        .replace("{{project_type}}", project_type or "")
        .replace("{{project_description}}", project_description or "")
    )
    prompt += grounded.entity_list_block()

    settings = get_settings()
    common = dict(
        images=grounded.rendered.images,
        prompt=prompt,
        tool_name="emit_cad_flags",
        tool_description="Emit handle-grounded RFI flags with optional proposed_change op.",
        tool_parameters=_flag_tool_schema(),
        image_captions=grounded.rendered.captions,
        max_output_tokens=12000,
    )
    if settings.cad_analyser_provider == "openrouter":
        res = call_openrouter_tool(**common, model=settings.cad_analyser_model)
    else:
        res = call_gemini_tool(**common, model=settings.gemini_model)
    raw_flags = (res.payload.get("flags") or []) if isinstance(res.payload, dict) else []

    # Drop flags whose handles don't exist; validate proposed_change; compute overlay bboxes.
    flags: list[dict[str, Any]] = []
    drops: list[dict[str, Any]] = []
    for f in raw_flags:
        if not ground_item_handles(
            f, grounded, quote_fields=("verbatim_quote",), recovery_marker="handle_recovery"
        ):
            drops.append({"flag": f, "reason": "no valid handles"})
            continue
        pc = f.get("proposed_change")
        if pc:
            try:
                parse_ops([pc])
            except Exception as e:
                f["proposed_change"] = None
                f["proposed_change_error"] = str(e)[:200]
        flags.append(f)

    analysis = {
        "flags": flags,
        "views": grounded.rendered.views,
        "entity_count": len(grounded.entities),
        "verification_drops": drops,
    }
    metrics = CadMetrics(
        processing_ms=int((time.monotonic() - t0) * 1000),
        cost_usd=0.0,
        input_tokens=res.input_tokens,
        output_tokens=res.output_tokens,
    )
    extras = {
        "analysis_version": CAD_ANALYSIS_VERSION,
        "image_count": len(grounded.rendered.images),
    }
    return analysis, version, metrics, extras
