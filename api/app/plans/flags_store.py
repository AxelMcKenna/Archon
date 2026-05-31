"""Persistence helpers for the plan_flags table.

plan_flags is the per-row source of truth for paginated reads. The legacy
plan_uploads.analysis jsonb is also kept populated (by plan_pipeline) so
old readers — UI, llm-gateway get_plan_flags, overlay.pdf renderer — keep
working without changes.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

# Supabase / PostgREST tops out around 1000 rows per insert; chunk to stay
# well under that and keep individual statements small.
_INSERT_CHUNK = 500


def _flag_to_row(
    *, plan_upload_id: str, project_id: str, flag: dict[str, Any]
) -> dict[str, Any]:
    page = int(flag.get("page") or 1)
    bbox = flag.get("bbox")
    if isinstance(bbox, list) and len(bbox) == 4:
        bbox_json: Any = bbox
    else:
        bbox_json = None

    return {
        "plan_upload_id": plan_upload_id,
        "project_id": project_id,
        "sheet_index": page - 1,
        "sheet_label": flag.get("sheet_label"),
        "discipline": flag.get("discipline"),
        "page": page,
        "tile": (flag.get("tile") or "full"),
        "area": str(flag.get("area") or "")[:500],
        "category": str(flag.get("category") or ""),
        "severity": str(flag.get("severity") or "nice_to_have"),
        "confidence": str(flag.get("confidence") or "low"),
        "verbatim_quote": str(flag.get("verbatim_quote") or "")[:500],
        "reason": flag.get("reason"),
        "recommended_action": flag.get("recommended_action"),
        "bbox": bbox_json,
        "bbox_source": flag.get("bbox_source"),
        "verified": bool(flag.get("verified", True)),
        "verification_note": flag.get("verification_note"),
        "pass_index": flag.get("pass_index"),
    }


def replace_plan_flags(
    db: Client,
    *,
    plan_upload_id: str,
    project_id: str,
    flags: list[dict[str, Any]],
) -> int:
    """Delete any existing rows for the plan and insert the new set.

    Idempotent: re-running an analysis (or cloning a cached one) yields the
    same plan_flags state regardless of prior contents. Returns the number
    of rows inserted.
    """
    db.table("plan_flags").delete().eq("plan_upload_id", plan_upload_id).execute()

    if not flags:
        return 0

    rows = [
        _flag_to_row(
            plan_upload_id=plan_upload_id, project_id=project_id, flag=f
        )
        for f in flags
    ]

    inserted = 0
    for i in range(0, len(rows), _INSERT_CHUNK):
        chunk = rows[i : i + _INSERT_CHUNK]
        db.table("plan_flags").insert(chunk).execute()
        inserted += len(chunk)
    return inserted
