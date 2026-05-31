"""get_plan_flag: fetch one flag in full.

Use when the llm-gateway needs the complete record for a specific flag — bbox,
full reason, full recommended_action — without paginating.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.supabase_client import get_supabase


def get_plan_flag_schema() -> dict[str, Any]:
    return {
        "name": "get_plan_flag",
        "description": (
            "Fetch one plan_flags row by id. Use after list_plan_flags when "
            "you need the full record for a single flag (e.g. to draft an "
            "RFI response or read the full verbatim quote and reason)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "flag_id": {
                    "type": "string",
                    "description": "plan_flags.id UUID.",
                },
            },
            "required": ["flag_id"],
        },
    }


async def get_plan_flag_execute(args: dict[str, Any]) -> dict[str, Any]:
    flag_id = args.get("flag_id")
    if not flag_id:
        return {"error": "flag_id is required"}
    return await asyncio.to_thread(_sync, str(flag_id))


def _sync(flag_id: str) -> dict[str, Any]:
    sb = get_supabase()
    row = (
        sb.table("plan_flags")
        .select("*")
        .eq("id", flag_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        return {"error": "flag not found"}
    return row.data
