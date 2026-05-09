"""CAD analyser: runs the vision + entity-list pass and returns flags
with handle-grounded targets and an optional proposed_change op.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.cad.cad_loader import load_dxf, summarise
from app.cad.cad_ops import parse_ops
from app.cad.cad_render import list_views, model_to_norm_bbox, render_view
from app.config import get_settings
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool

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
                        "target_handles": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
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
    doc = load_dxf(dxf_bytes)
    entities = [e.to_dict() for e in summarise(doc)]
    valid_handles = {e["handle"] for e in entities}

    # Slim projection for the LLM — drop bulky fields (bbox, points arrays)
    # and cap to ~400 entities so the prompt stays well under the window.
    # Text-bearing entities are already at the front of `entities` (see summarise).
    LLM_KEEP = {"handle", "type", "layer", "text", "length", "block", "rotation"}
    entities_for_llm: list[dict[str, Any]] = []
    for e in entities[:400]:
        slim = {k: v for k, v in e.items() if k in LLM_KEEP}
        if "text" in slim and isinstance(slim["text"], str):
            slim["text"] = slim["text"][:120]
        entities_for_llm.append(slim)

    # Render every view; vision pass sees them all.
    images: list[bytes] = []
    captions: list[str] = []
    views: list[dict[str, Any]] = []
    view_extents_by_name: dict[str, tuple[float, float, float, float]] = {}
    for name in list_views(doc):
        try:
            png, info = render_view(doc, name)
        except Exception:
            continue
        images.append(png)
        captions.append(f"View: {name}")
        views.append({"name": info.name, "width": info.width, "height": info.height})
        view_extents_by_name[info.name] = info.extents

    body, version = _read_prompt()
    prompt = (
        body.replace("{{bca}}", bca or "")
        .replace("{{project_type}}", project_type or "")
        .replace("{{project_description}}", project_description or "")
    )
    prompt += (
        "\n\n## Entity list (first 400, text-bearing first)\n\n"
        "```json\n" + json.dumps(entities_for_llm) + "\n```\n"
    )

    settings = get_settings()
    common = dict(
        images=images,
        prompt=prompt,
        tool_name="emit_cad_flags",
        tool_description="Emit handle-grounded RFI flags with optional proposed_change op.",
        tool_parameters=_flag_tool_schema(),
        image_captions=captions,
        max_output_tokens=12000,
    )
    if settings.cad_analyser_provider == "openrouter":
        res = call_openrouter_tool(**common, model=settings.cad_analyser_model)
    else:
        res = call_gemini_tool(**common, model=settings.gemini_model)
    raw_flags = (res.payload.get("flags") or []) if isinstance(res.payload, dict) else []

    # Index entity model-space bboxes by handle for overlay computation.
    bbox_by_handle: dict[str, tuple[float, float, float, float]] = {}
    for e in entities:
        bb = e.get("bbox")
        if isinstance(bb, list) and len(bb) == 4:
            bbox_by_handle[e["handle"]] = (float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3]))

    # Index text entities for quote-based recovery.
    text_index: list[tuple[str, str]] = [
        (e["handle"], (e.get("text") or "").strip().lower())
        for e in entities
        if isinstance(e.get("text"), str) and e.get("text", "").strip()
    ]

    def _recover_handles_from_quote(quote: str) -> list[str]:
        q = (quote or "").strip().lower()
        if len(q) < 4:
            return []
        # Substring match either direction handles abbreviations and noise.
        hits = [h for h, t in text_index if t and (q in t or t in q)]
        return hits[:3]

    # Drop flags whose handles don't exist; validate proposed_change; compute overlay bboxes.
    flags: list[dict[str, Any]] = []
    drops: list[dict[str, Any]] = []
    for f in raw_flags:
        targets = [h for h in (f.get("target_handles") or []) if h in valid_handles]
        if not targets:
            recovered = _recover_handles_from_quote(f.get("verbatim_quote") or "")
            if recovered:
                targets = recovered
                f["handle_recovery"] = "quote_match"
        if not targets:
            drops.append({"flag": f, "reason": "no valid handles"})
            continue
        f["target_handles"] = targets
        pc = f.get("proposed_change")
        if pc:
            try:
                parse_ops([pc])
            except Exception as e:
                f["proposed_change"] = None
                f["proposed_change_error"] = str(e)[:200]

        # Union model bboxes of targeted handles, expand by ~2% of view extents
        # so single-point entities (text inserts) render as visible rectangles.
        target_bboxes = [bbox_by_handle[h] for h in targets if h in bbox_by_handle]
        if target_bboxes:
            mx0 = min(b[0] for b in target_bboxes)
            my0 = min(b[1] for b in target_bboxes)
            mx1 = max(b[2] for b in target_bboxes)
            my1 = max(b[3] for b in target_bboxes)
            image_bboxes: dict[str, list[float]] = {}
            for view_name, ext in view_extents_by_name.items():
                vw = max(ext[2] - ext[0], 1e-9)
                vh = max(ext[3] - ext[1], 1e-9)
                # Pad point-like bboxes so they're clickable.
                pad_x = vw * 0.01 if (mx1 - mx0) < vw * 0.005 else 0
                pad_y = vh * 0.01 if (my1 - my0) < vh * 0.005 else 0
                norm = model_to_norm_bbox(
                    ext, (mx0 - pad_x, my0 - pad_y, mx1 + pad_x, my1 + pad_y)
                )
                image_bboxes[view_name] = list(norm)
            f["image_bboxes"] = image_bboxes
        flags.append(f)

    analysis = {
        "flags": flags,
        "views": views,
        "entity_count": len(entities),
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
        "image_count": len(images),
    }
    return analysis, version, metrics, extras
