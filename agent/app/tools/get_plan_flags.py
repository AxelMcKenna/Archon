"""get_plan_flags: fetch the full analysis JSON for one plan upload.

Read-only Supabase query — no AI cost. Returns flag list with categories,
severities, quotes, page refs so the agent can answer detailed questions
("what fire-safety flags are on plan X?").
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.supabase_client import get_supabase


def get_plan_flags_schema() -> dict[str, Any]:
    return {
        "name": "get_plan_flags",
        "description": (
            "Fetch the full AI flag list for a specific drawing upload — works "
            "for both PDF plan uploads and CAD/DXF uploads. Use after "
            "read_tab(drawings) when the user asks about a particular file's "
            "flags, categories, or severities."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "upload_id": {
                    "type": "string",
                    "description": (
                        "UUID of the upload row (plan_uploads.id or "
                        "cad_uploads.id from read_tab(drawings))."
                    ),
                },
            },
            "required": ["upload_id"],
        },
    }


async def get_plan_flags_execute(args: dict[str, Any]) -> dict[str, Any]:
    upload_id = args.get("upload_id") or args.get("plan_upload_id")
    if not upload_id:
        return {"error": "upload_id is required"}
    return await asyncio.to_thread(_sync, upload_id)


def _sync(upload_id: str) -> dict[str, Any]:
    sb = get_supabase()
    # Try plan_uploads first, then cad_uploads — both expose `analysis.flags`.
    for table, kind, extra in (
        ("plan_uploads", "plan", "cost_usd,"),
        ("cad_uploads", "cad", ""),
    ):
        row = (
            sb.table(table)
            .select(
                "id,filename,status,analyser_version,prompt_version,"
                f"processing_ms,{extra}error,created_at,analysis"
            )
            .eq("id", upload_id)
            .maybe_single()
            .execute()
        )
        if row and row.data:
            data = row.data
            analysis = data.get("analysis") or {}
            flags = analysis.get("flags") if isinstance(analysis, dict) else []
            return {
                "id": data["id"],
                "kind": kind,
                "filename": data.get("filename"),
                "status": data.get("status"),
                "analyser_version": data.get("analyser_version"),
                "flag_count": len(flags) if isinstance(flags, list) else 0,
                "flags": flags if isinstance(flags, list) else [],
                "error": data.get("error"),
            }
    return {"error": "upload not found"}
