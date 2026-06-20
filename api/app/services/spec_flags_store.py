"""Persistence helpers for the spec_flags table.

spec_flags is the per-row source of truth for paginated reads. The full set is
also mirrored into spec_documents.analysis jsonb (by spec_pipeline) so a single
read can hydrate the whole document. Mirrors plans/flags_store.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

_INSERT_CHUNK = 500


def _flag_to_row(
    *, spec_document_id: str, project_id: str, flag: dict[str, Any]
) -> dict[str, Any]:
    return {
        "spec_document_id": spec_document_id,
        "project_id": project_id,
        "page": int(flag.get("page") or 1),
        "area": str(flag.get("area") or "")[:500],
        "category": str(flag.get("category") or ""),
        "severity": str(flag.get("severity") or "nice_to_have"),
        "confidence": str(flag.get("confidence") or "low"),
        "verbatim_quote": str(flag.get("verbatim_quote") or "")[:500],
        "reason": flag.get("reason"),
        "recommended_action": flag.get("recommended_action"),
        "rule": flag.get("_rule"),
    }


def replace_spec_flags(
    db: Client,
    *,
    spec_document_id: str,
    project_id: str,
    flags: list[dict[str, Any]],
) -> int:
    """Delete any existing rows for the document and insert the new set.

    Idempotent: re-running the flagger yields the same spec_flags state. Returns
    the number of rows inserted.
    """
    db.table("spec_flags").delete().eq(
        "spec_document_id", spec_document_id
    ).execute()

    if not flags:
        return 0

    rows = [
        _flag_to_row(
            spec_document_id=spec_document_id, project_id=project_id, flag=f
        )
        for f in flags
    ]

    inserted = 0
    for i in range(0, len(rows), _INSERT_CHUNK):
        chunk = rows[i : i + _INSERT_CHUNK]
        db.table("spec_flags").insert(chunk).execute()
        inserted += len(chunk)
    return inserted
