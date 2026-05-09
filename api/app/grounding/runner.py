"""Match all items in a letter against the linked plan's flags and persist."""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.grounding.matcher import (
    MATCHER_VERSION,
    Match,
    best_match,
    evidence_payload,
    parse_flags,
)


def _load_letter_link(db: Client, letter_id: str) -> dict[str, Any] | None:
    """Fetch the letter's link to a submitted plan (PDF or DXF)."""
    row = (
        db.table("rfi_letters")
        .select("id, plan_upload_id, cad_upload_id")
        .eq("id", letter_id)
        .maybe_single()
        .execute()
    )
    return row.data if row else None


def _load_plan_flags(
    db: Client, plan_upload_id: str | None, cad_upload_id: str | None
) -> tuple[list[dict[str, Any]], str | None, str | None]:
    """Return (flags, plan_upload_id, cad_upload_id) — only one source populated."""
    if plan_upload_id:
        row = (
            db.table("plan_uploads")
            .select("id, status, analysis")
            .eq("id", plan_upload_id)
            .maybe_single()
            .execute()
        )
        if row and row.data and row.data.get("status") == "analysed":
            flags = (row.data.get("analysis") or {}).get("flags") or []
            return flags, plan_upload_id, None
    if cad_upload_id:
        row = (
            db.table("cad_uploads")
            .select("id, status, analysis")
            .eq("id", cad_upload_id)
            .maybe_single()
            .execute()
        )
        if row and row.data and row.data.get("status") == "analysed":
            flags = (row.data.get("analysis") or {}).get("flags") or []
            return flags, None, cad_upload_id
    return [], None, None


def _load_items(db: Client, letter_id: str) -> list[dict[str, Any]]:
    return (
        db.table("rfi_items")
        .select("id, item_id, raw_text, extracted")
        .eq("rfi_letter_id", letter_id)
        .order("ordering")
        .execute()
        .data
        or []
    )


def ground_letter(db: Client, letter_id: str) -> dict[str, Any]:
    """Run Stage A grounding for every item in a letter; idempotent.

    Returns counts so the caller (upload pipeline) can report progress.
    """
    link = _load_letter_link(db, letter_id)
    if not link:
        return {"matched": 0, "unmatched": 0, "skipped_no_link": True}

    raw_flags, plan_upload_id, cad_upload_id = _load_plan_flags(
        db, link.get("plan_upload_id"), link.get("cad_upload_id")
    )
    flags = parse_flags(raw_flags)
    items = _load_items(db, letter_id)

    matched = 0
    unmatched = 0
    for it in items:
        clauses = (it.get("extracted") or {}).get("clause_references") or []
        match: Match | None = best_match(it["raw_text"], clauses, flags) if flags else None

        if match is not None:
            flag = flags[match.flag_index]
            db.table("rfi_item_plan_evidence").upsert(
                {
                    "rfi_item_id": it["id"],
                    "source": "flag",
                    "plan_upload_id": plan_upload_id,
                    "cad_upload_id": cad_upload_id,
                    "flag_index": match.flag_index,
                    "evidence": evidence_payload(flag, match),
                    "confidence": match.score,
                    "rationale": (
                        f"matched clauses={match.matched_clauses} "
                        f"clause_overlap={match.clause_overlap:.2f} "
                        f"token_overlap={match.token_overlap:.2f}"
                    ),
                    "matcher_version": MATCHER_VERSION,
                },
                on_conflict="rfi_item_id",
            ).execute()
            matched += 1
        else:
            db.table("rfi_item_plan_evidence").upsert(
                {
                    "rfi_item_id": it["id"],
                    "source": "none",
                    "plan_upload_id": plan_upload_id,
                    "cad_upload_id": cad_upload_id,
                    "flag_index": None,
                    "evidence": {},
                    "confidence": None,
                    "rationale": (
                        "no flag above threshold"
                        if flags
                        else "linked plan has no analysed flags"
                    ),
                    "matcher_version": MATCHER_VERSION,
                },
                on_conflict="rfi_item_id",
            ).execute()
            unmatched += 1

    return {
        "matched": matched,
        "unmatched": unmatched,
        "total_items": len(items),
        "total_flags": len(flags),
        "plan_upload_id": plan_upload_id,
        "cad_upload_id": cad_upload_id,
    }
