"""Vision pass + verification pass — the two LLM calls the analyser makes."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import get_settings
from app.extractors.metrics import Metrics
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool
from app.plans.prompt import ACTIVE_VERIFICATION_PROMPT, fill, load_prompt
from app.plans.render import RenderedImage, caption_str

log = logging.getLogger(__name__)


ANALYSIS_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_plan_analysis",
    "description": "Record the structured analysis of a building plan.",
    "input_schema": {
        "type": "object",
        "required": ["flags", "summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 20},
            "flags": {
                "type": "array",
                "maxItems": 50,
                "items": {
                    "type": "object",
                    "required": [
                        "page",
                        "area",
                        "category",
                        "severity",
                        "confidence",
                        "verbatim_quote",
                        "reason",
                        "recommended_action",
                    ],
                    "properties": {
                        "page": {"type": "integer", "minimum": 1},
                        "tile": {
                            "type": "string",
                            "enum": [
                                "top-left",
                                "top-right",
                                "bottom-left",
                                "bottom-right",
                                "full",
                            ],
                        },
                        "area": {"type": "string", "minLength": 4, "maxLength": 200},
                        "category": {"type": "string"},
                        "severity": {"enum": ["must_resolve", "nice_to_have"]},
                        "confidence": {"enum": ["high", "medium", "low"]},
                        "verbatim_quote": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 200,
                        },
                        "reason": {"type": "string", "minLength": 12, "maxLength": 500},
                        "recommended_action": {
                            "type": "string",
                            "minLength": 8,
                            "maxLength": 500,
                        },
                        "bbox": {
                            "type": "array",
                            "description": (
                                "Optional bounding box around the cited "
                                "feature, in normalised coordinates (0-1) "
                                "RELATIVE TO THE IMAGE YOU ARE LOOKING AT "
                                "(the tile if tiled, otherwise the full "
                                "page). Order: [x0, y0, x1, y1] with origin "
                                "at top-left. Omit if you cannot localise."
                            ),
                            "minItems": 4,
                            "maxItems": 4,
                            "items": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                    },
                },
            },
        },
    },
}

VERIFICATION_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_verification",
    "description": "Verify groundedness of each flag against the drawing.",
    "input_schema": {
        "type": "object",
        "required": ["verifications"],
        "properties": {
            "verifications": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["flag_id", "verified"],
                    "properties": {
                        "flag_id": {"type": "integer", "minimum": 0},
                        "verified": {"type": "boolean"},
                        "verification_note": {"type": "string", "maxLength": 200},
                    },
                },
            },
        },
    },
}


def run_single_vision_pass(
    *,
    settings: Any,
    images: list[bytes],
    captions: list[str],
    prompt: str,
) -> tuple[dict[str, Any], int, int]:
    """One analyser call. Returns (payload, input_tokens, output_tokens)."""
    if settings.plan_analyser_provider == "openrouter":
        result = call_openrouter_tool(
            images=images,
            image_captions=captions,
            prompt=prompt,
            tool_name=ANALYSIS_TOOL_SCHEMA["name"],
            tool_description=ANALYSIS_TOOL_SCHEMA["description"],
            tool_parameters=ANALYSIS_TOOL_SCHEMA["input_schema"],
            max_output_tokens=6000,
            model=settings.openrouter_model,
        )
        return result.payload, result.input_tokens, result.output_tokens

    result = call_gemini_tool(
        images=images,
        image_captions=captions,
        prompt=prompt,
        tool_name=ANALYSIS_TOOL_SCHEMA["name"],
        tool_description=ANALYSIS_TOOL_SCHEMA["description"],
        tool_parameters=ANALYSIS_TOOL_SCHEMA["input_schema"],
        max_output_tokens=6000,
        model=settings.gemini_model,
    )
    return result.payload, result.input_tokens, result.output_tokens


def verify_flags(
    *,
    images: list[RenderedImage],
    flags: list[dict[str, Any]],
    metrics: Metrics,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, str]:
    """Run a Haiku/verifier call to check each flag's verbatim_quote.

    Returns (kept_flags, drops, verification_status, verification_prompt_version).
    `verification_status` is one of: "verified", "skipped".
    """
    if not flags:
        return [], [], "verified", load_prompt(ACTIVE_VERIFICATION_PROMPT)[1]

    template, version = load_prompt(ACTIVE_VERIFICATION_PROMPT)
    flags_block = json.dumps(
        [
            {
                "flag_id": idx,
                "page": f.get("page"),
                "tile": f.get("tile") or "full",
                "verbatim_quote": f.get("verbatim_quote", ""),
                "reason": f.get("reason", ""),
                "recommended_action": f.get("recommended_action", ""),
            }
            for idx, f in enumerate(flags)
        ],
        indent=2,
    )
    prompt = fill(template, flags_block=flags_block)

    settings = get_settings()
    captions = [caption_str(img) for img in images]
    payload: dict[str, Any]
    try:
        if settings.plan_verifier_provider == "openrouter":
            or_result = call_openrouter_tool(
                images=[img.png for img in images],
                image_captions=captions,
                prompt=prompt,
                tool_name=VERIFICATION_TOOL_SCHEMA["name"],
                tool_description=VERIFICATION_TOOL_SCHEMA["description"],
                tool_parameters=VERIFICATION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
                model=settings.openrouter_verifier_model,
            )
            payload = or_result.payload
            metrics.verification_input_tokens += or_result.input_tokens
            metrics.verification_output_tokens += or_result.output_tokens
        else:
            gemini_result = call_gemini_tool(
                images=[img.png for img in images],
                image_captions=captions,
                prompt=prompt,
                tool_name=VERIFICATION_TOOL_SCHEMA["name"],
                tool_description=VERIFICATION_TOOL_SCHEMA["description"],
                tool_parameters=VERIFICATION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
                model=settings.gemini_verifier_model,
            )
            payload = gemini_result.payload
            metrics.verification_input_tokens += gemini_result.input_tokens
            metrics.verification_output_tokens += gemini_result.output_tokens
    except Exception as exc:  # noqa: BLE001
        log.warning("plan verification skipped: %s", exc)
        return list(flags), [], "skipped", version
    verifications = {
        int(v["flag_id"]): v
        for v in payload.get("verifications", [])
        if isinstance(v, dict) and "flag_id" in v
    }

    kept: list[dict[str, Any]] = []
    drops: list[dict[str, Any]] = []
    for idx, flag in enumerate(flags):
        v = verifications.get(idx)
        if v is None:
            drops.append({**flag, "verification_note": "no verdict from verifier"})
            continue
        if v.get("verified"):
            kept.append(flag)
        else:
            drops.append(
                {**flag, "verification_note": v.get("verification_note", "")}
            )
    return kept, drops, "verified", version
