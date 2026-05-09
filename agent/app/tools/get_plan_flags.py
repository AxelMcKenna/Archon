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
            "Fetch the full AI flag list for a specific building plan upload. "
            "Use after read_tab(drawings) when the user asks about a particular "
            "plan's flags, categories, or severities."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "plan_upload_id": {
                    "type": "string",
                    "description": "UUID of the plan_uploads row.",
                },
            },
            "required": ["plan_upload_id"],
        },
    }


async def get_plan_flags_execute(args: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_sync, args["plan_upload_id"])


def _sync(plan_upload_id: str) -> dict[str, Any]:
    sb = get_supabase()
    row = (
        sb.table("plan_uploads")
        .select(
            "id,filename,status,analyser_version,prompt_version,"
            "processing_ms,cost_usd,error,created_at,analysis"
        )
        .eq("id", plan_upload_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        return {"error": "plan upload not found"}
    data = row.data
    analysis = data.get("analysis") or {}
    flags = analysis.get("flags") if isinstance(analysis, dict) else []
    return {
        "id": data["id"],
        "filename": data.get("filename"),
        "status": data.get("status"),
        "analyser_version": data.get("analyser_version"),
        "flag_count": len(flags) if isinstance(flags, list) else 0,
        "flags": flags if isinstance(flags, list) else [],
        "error": data.get("error"),
    }
