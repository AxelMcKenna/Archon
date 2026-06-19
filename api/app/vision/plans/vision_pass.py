"""Vision pass + verification pass — the two LLM calls the plan analyser makes."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.auth import get_service_db
from app.config import get_settings
from app.extractors.metrics import Metrics
from app.mbie.pathway import unverified_citations
from app.mbie.retriever import (
    _build_query,
    format_hits_for_prompt,
    hit_provenance,
    retrieve_for_flag,
)
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
) -> tuple[list[str], list[list[dict[str, Any]]]]:
    """Per-flag MBIE clause retrieval. Returns two parallel lists:
    formatted clause strings for the verifier prompt, and structured
    provenance (which clauses each flag was checked against) for
    persistence. Both default to empty when nothing is found or retrieval
    blows up — we never let MBIE issues break verification.
    """
    try:
        db = get_service_db()
    except Exception as exc:  # noqa: BLE001
        log.warning("MBIE retrieval skipped (no service db): %s", exc)
        return (["" for _ in flags], [[] for _ in flags])

    blocks: list[str] = []
    provenance: list[list[dict[str, Any]]] = []
    for f in flags:
        try:
            hits = retrieve_for_flag(db, flag=f)
            blocks.append(format_hits_for_prompt(hits, query=_build_query(f)))
            provenance.append(hit_provenance(hits))
        except Exception as exc:  # noqa: BLE001
            log.warning("MBIE retrieval failed for one flag: %s", exc)
            blocks.append("")
            provenance.append([])
    return blocks, provenance


def _as_clause_matches_prov(
    claimed: Any, prov: list[dict[str, Any]]
) -> bool:
    """Does the verifier's claimed satisfied-clause correspond to a clause
    that was actually retrieved for this flag?

    Loose, whitespace-insensitive containment match either way — the verifier
    may cite a bare clause number ("9.1.2") or a fuller form. We only need to
    confirm the cited clause maps to something we put in front of it; an
    unmatched citation means the drop is ungrounded and the flag is kept."""
    c = re.sub(r"\s+", "", str(claimed or "")).lower()
    if not c:
        return False
    for p in prov:
        cn = re.sub(r"\s+", "", str(p.get("clause_number") or "")).lower()
        if cn and (c == cn or c in cn or cn in c):
            return True
    return False


def _classify_flag(
    flag: dict[str, Any], v: dict[str, Any], prov: list[dict[str, Any]]
) -> tuple[str, dict[str, Any]]:
    """Turn one verifier verdict into an outcome + the row to emit.

    Returns ``(kind, payload)`` where ``kind`` is one of:
      - ``"drop_ungrounded"`` — verbatim_quote not grounded on the drawing
      - ``"drop_as_compliant"`` — drawing visibly satisfies a retrieved AS
        clause, grounded by a quoted detail + matching clause
      - ``"keep"`` — survives, carrying any Alternative-Solution annotation
    """
    note = v.get("verification_note", "")
    if not v.get("verified"):
        return "drop_ungrounded", {
            **flag,
            "verification_note": note or "ungrounded",
            "mbie_clauses_considered": prov,
        }
    # An AS-compliant *drop* silently removes a flag from the user's view, so it
    # must be grounded to the same standard as the verbatim_quote check: the
    # verifier has to quote the visible compliant detail AND name a clause we
    # actually retrieved. Any gap (no clauses retrieved, no quoted detail, or a
    # clause that doesn't match the retrieved set) means the drop is
    # unverifiable — keep the flag rather than trust an ungrounded drop from the
    # cheap verifier model.
    if v.get("as_compliant"):
        as_quote = v.get("as_compliant_quote")
        as_clause = v.get("as_compliant_clause")
        quote_ok = isinstance(as_quote, str) and bool(as_quote.strip())
        clause_ok = _as_clause_matches_prov(as_clause, prov)
        if prov and quote_ok and clause_ok:
            return "drop_as_compliant", {
                **flag,
                "verification_note": (
                    f"AS-compliant: {note}" if note else "AS-compliant"
                ),
                "dropped_reason": "as_compliant",
                "as_compliant_quote": as_quote.strip(),
                "as_compliant_clause": str(as_clause).strip(),
                "mbie_clauses_considered": prov,
            }
        reasons: list[str] = []
        if not prov:
            reasons.append("no AS clause retrieved")
        if not quote_ok:
            reasons.append("no visible compliant detail quoted")
        if prov and not clause_ok:
            reasons.append("cited clause not among retrieved clauses")
        extra = "as_compliant claimed but " + ", ".join(reasons) + " — kept"
        note = (note + "; " + extra) if note else extra
    # Surviving flag: carry the Alternative Solution consideration so the UI and
    # downstream RFI drafting can reframe an AS deviation as "resolvable via
    # Alternative Solution with the right evidence".
    alt_available = bool(v.get("alt_solution_available"))
    pathway = v.get("alt_solution_pathway")
    pathway_str = (
        str(pathway).strip()
        if alt_available and isinstance(pathway, str) and pathway.strip()
        else None
    )
    kept_flag = {
        **flag,
        "alt_solution_available": alt_available,
        "alt_solution_pathway": pathway_str,
        # Flag any Building Code clause the verifier cited that isn't a real
        # clause — the pathway is ungrounded model text, so don't present
        # fabricated clause refs as fact.
        "alt_solution_pathway_unverified": (unverified_citations(pathway_str) or None),
        "mbie_clauses_considered": prov,
    }
    if note:
        kept_flag["verification_note"] = note
    return "keep", kept_flag


def _run_verification_pass(
    *,
    provider: str,
    model: str,
    image_pngs: list[bytes],
    captions: list[str],
    prompt: str,
    metrics: Metrics,
) -> dict[int, dict[str, Any]] | None:
    """One verifier call. Returns verdicts keyed by flag_id, or ``None`` if the
    call itself failed (so the caller can distinguish a failed pass from a pass
    that simply returned no verdicts)."""
    try:
        payload, in_tokens, out_tokens = invoke_tool(
            provider=provider,
            model=model,
            images=image_pngs,
            image_captions=captions,
            prompt=prompt,
            tool_name=VERIFICATION_TOOL_SCHEMA["name"],
            tool_description=VERIFICATION_TOOL_SCHEMA["description"],
            tool_parameters=VERIFICATION_TOOL_SCHEMA["input_schema"],
            # Sized to match the analyser (6000). A tight budget here truncates
            # the tool call on sheets with many flags, dropping the trailing
            # flag_ids from the response — and a missing verdict must never be
            # the reason a real flag disappears (see the keep-on-no-verdict path
            # below).
            max_output_tokens=6000,
        )
        metrics.verification_input_tokens += in_tokens
        metrics.verification_output_tokens += out_tokens
    except Exception as exc:  # noqa: BLE001
        log.warning("plan verification pass failed: %s", exc)
        return None
    return {
        int(v["flag_id"]): v
        for v in payload.get("verifications", [])
        if isinstance(v, dict) and "flag_id" in v
    }


def verify_flags(
    *,
    images: list[RenderedImage],
    flags: list[dict[str, Any]],
    metrics: Metrics,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, str]:
    """Verify each flag's verbatim_quote and AS compliance, with optional
    self-consistency voting (``plan_verifier_voting_n``).

    Returns (kept_flags, drops, verification_status, verification_prompt_version).
    `verification_status` is one of: "verified", "skipped".

    Dropping is the destructive direction (the flag vanishes from the user's
    view), so it is fail-open at every level: a flag is dropped only when at
    least ``threshold`` of the passes that returned a verdict for it agree on a
    drop. A missing verdict, a split vote, or a total call failure all keep the
    flag.
    """
    if not flags:
        return [], [], "verified", load_prompt(ACTIVE_VERIFICATION_PROMPT)[1]

    template, version = load_prompt(ACTIVE_VERIFICATION_PROMPT)
    mbie_blocks, mbie_provenance = _retrieve_mbie_context(flags)
    flags_block = json.dumps(
        [
            {
                "flag_id": idx,
                "page": f.get("page"),
                "tile": f.get("tile") or "full",
                "category": f.get("category"),
                "area": f.get("area", ""),
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
    image_pngs = [img.png for img in images]
    provider = settings.plan_verifier_provider
    model = (
        settings.openrouter_verifier_model
        if provider == "openrouter"
        else settings.gemini_verifier_model
    )
    n = max(1, getattr(settings, "plan_verifier_voting_n", 1))
    vote_threshold = max(1, getattr(settings, "plan_verifier_voting_threshold", 1))

    verdict_maps: list[dict[int, dict[str, Any]]] = []
    for _ in range(n):
        vm = _run_verification_pass(
            provider=provider,
            model=model,
            image_pngs=image_pngs,
            captions=captions,
            prompt=prompt,
            metrics=metrics,
        )
        if vm is not None:
            verdict_maps.append(vm)

    # Every pass failed → no signal at all. Fail open: keep everything.
    if not verdict_maps:
        return list(flags), [], "skipped", version

    kept: list[dict[str, Any]] = []
    drops: list[dict[str, Any]] = []
    for idx, flag in enumerate(flags):
        # Clauses this flag was checked against — attached to kept *and* dropped
        # flags so an AS-compliant drop or an alt-solution annotation is
        # auditable back to the exact clauses that drove the verdict.
        prov = mbie_provenance[idx]
        votes = [vm[idx] for vm in verdict_maps if idx in vm]
        if not votes:
            # No pass returned a verdict for this flag — almost always a
            # truncated/malformed response, not a judgement that it's bogus. No
            # evidence to drop on, so keep it and mark it unverified.
            kept.append(
                {
                    **flag,
                    "verification_note": "no verdict from verifier — kept unverified",
                    "mbie_clauses_considered": prov,
                }
            )
            continue
        decisions = [_classify_flag(flag, v, prov) for v in votes]
        drop_decisions = [(k, p) for k, p in decisions if k != "keep"]
        # Threshold can't exceed the number of passes that actually voted on
        # this flag, mirroring the analyser's per-bucket clamp.
        threshold = max(1, min(vote_threshold, len(votes)))
        if len(drop_decisions) >= threshold:
            # Prefer the ungrounded reason when present: a fabricated quote
            # makes the whole flag unreliable, which is a stronger drop than
            # "satisfies an AS clause".
            ungrounded = [p for k, p in drop_decisions if k == "drop_ungrounded"]
            drops.append(ungrounded[0] if ungrounded else drop_decisions[0][1])
            continue
        keep_payloads = [p for k, p in decisions if k == "keep"]
        # Representative kept row: prefer one that carries an Alternative
        # Solution pathway so the annotation survives a split vote.
        rep = next(
            (p for p in keep_payloads if p.get("alt_solution_pathway")), None
        ) or keep_payloads[0]
        kept.append(rep)
    return kept, drops, "verified", version
