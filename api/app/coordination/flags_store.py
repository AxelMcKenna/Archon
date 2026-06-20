"""Persistence for project_coordination_flags (per-project, replace-on-run)."""

from __future__ import annotations

from typing import Any

from supabase import Client

_INSERT_CHUNK = 500


def _flag_to_row(*, project_id: str, flag: dict[str, Any]) -> dict[str, Any]:
    citations = flag.get("citations")
    return {
        "project_id": project_id,
        "category": str(flag.get("category") or ""),
        "severity": str(flag.get("severity") or "nice_to_have"),
        "confidence": str(flag.get("confidence") or "low"),
        "area": str(flag.get("area") or "")[:500],
        "reason": flag.get("reason"),
        "recommended_action": flag.get("recommended_action"),
        "rule": flag.get("_rule"),
        "tier": str(flag.get("tier") or "deterministic"),
        "citations": citations if isinstance(citations, list) else [],
    }


def replace_project_coordination_flags(
    db: Client,
    *,
    project_id: str,
    flags: list[dict[str, Any]],
) -> int:
    """Delete the project's existing coordination flags and insert the new set."""
    db.table("project_coordination_flags").delete().eq(
        "project_id", project_id
    ).execute()

    if not flags:
        return 0

    rows = [_flag_to_row(project_id=project_id, flag=f) for f in flags]
    inserted = 0
    for i in range(0, len(rows), _INSERT_CHUNK):
        chunk = rows[i : i + _INSERT_CHUNK]
        db.table("project_coordination_flags").insert(chunk).execute()
        inserted += len(chunk)
    return inserted
