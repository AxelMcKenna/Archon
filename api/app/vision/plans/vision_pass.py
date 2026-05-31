"""Vision pass + verification pass — the two LLM calls the plan analyser makes."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.auth import get_service_db
from app.config import get_settings
from app.extractors.metrics import Metrics
from app.mbie.retriever import format_hits_for_prompt, retrieve_for_flag
from app.vision.core.invoker import invoke_tool, run_tool_pass
from app.vision.core.prompts import fill, load_prompt
from app.vision.core.renderer import RenderedImage, caption_str
from app.vision.plans.schema import (
    ACTIVE_VERIFICATION_PROMPT,
    ANALYSIS_TOOL_SCHEMA,
    VERIFICATION_TOOL_SCHEMA,
)

log = logging.getLogger(__name__)


def run_single_vision_pass(
    *,
    settings: Any,
    images: list[bytes],
    captions: list[str],
    prompt: str,
) -> tuple[dict[str, Any], int, int]:
    """One analyser call. Returns (payload, input_tokens, output_tokens)."""
    return run_tool_pass(
        settings=settings,
        schema=ANALYSIS_TOOL_SCHEMA,
        images=images,
        captions=captions,
        prompt=prompt,
        max_output_tokens=6000,
    )


def _retrieve_mbie_context(
    flags: list[dict[str, Any]],
) -> list[str]:
    """Per-flag MBIE clause retrieval. Returns a parallel list of
    formatted clause strings (empty string when nothing found or when
    retrieval blows up — we never let MBIE issues break verification).
    """
    try:
        db = get_service_db()
    except Exception as exc:  # noqa: BLE001
        log.warning("MBIE retrieval skipped (no service db): %s", exc)
        return ["" for _ in flags]

    out: list[str] = []
    for f in flags:
        try:
            hits = retrieve_for_flag(db, flag=f)
            out.append(format_hits_for_prompt(hits))
        except Exception as exc:  # noqa: BLE001
            log.warning("MBIE retrieval failed for one flag: %s", exc)
            out.append("")
    return out


def verify_flags(
    *,
    images: list[RenderedImage],
    flags: list[dict[str, Any]],
    metrics: Metrics,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, str]:
    """Run a Haiku/verifier call to check each flag's verbatim_quote and
    AS compliance.

    Returns (kept_flags, drops, verification_status, verification_prompt_version).
    `verification_status` is one of: "verified", "skipped".

    Drops the flag if the verifier returns `verified: false` (quote not
    grounded) OR `as_compliant: true` (drawing visibly satisfies a
    supplied Acceptable Solution clause).
    """
    if not flags:
        return [], [], "verified", load_prompt(ACTIVE_VERIFICATION_PROMPT)[1]

    template, version = load_prompt(ACTIVE_VERIFICATION_PROMPT)
    mbie_blocks = _retrieve_mbie_context(flags)
    flags_block = json.dumps(
        [
            {
                "flag_id": idx,
                "page": f.get("page"),
                "tile": f.get("tile") or "full",
                "category": f.get("category"),
                "verbatim_quote": f.get("verbatim_quote", ""),
                "reason": f.get("reason", ""),
                "recommended_action": f.get("recommended_action", ""),
                "acceptable_solution_clauses": mbie_blocks[idx] or "(none retrieved)",
            }
            for idx, f in enumerate(flags)
        ],
        indent=2,
    )
    prompt = fill(template, flags_block=flags_block)

    settings = get_settings()
    captions = [caption_str(img) for img in images]
    provider = settings.plan_verifier_provider
    model = (
        settings.openrouter_verifier_model
        if provider == "openrouter"
        else settings.gemini_verifier_model
    )
    try:
        payload, in_tokens, out_tokens = invoke_tool(
            provider=provider,
            model=model,
            images=[img.png for img in images],
            image_captions=captions,
            prompt=prompt,
            tool_name=VERIFICATION_TOOL_SCHEMA["name"],
            tool_description=VERIFICATION_TOOL_SCHEMA["description"],
            tool_parameters=VERIFICATION_TOOL_SCHEMA["input_schema"],
            max_output_tokens=2000,
        )
        metrics.verification_input_tokens += in_tokens
        metrics.verification_output_tokens += out_tokens
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
        note = v.get("verification_note", "")
        if not v.get("verified"):
            drops.append({**flag, "verification_note": note or "ungrounded"})
            continue
        if v.get("as_compliant"):
            drops.append(
                {
                    **flag,
                    "verification_note": (
                        f"AS-compliant: {note}" if note else "AS-compliant"
                    ),
                    "dropped_reason": "as_compliant",
                }
            )
            continue
        kept.append(flag)
    return kept, drops, "verified", version
