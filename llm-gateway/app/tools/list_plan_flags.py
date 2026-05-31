"""list_plan_flags: paginated, filtered view onto plan_flags.

For Parliament-scale plans (thousands of flags) the llm-gateway can't reasonably
load everything in one shot. This tool reads the same plan_flags rows the
web UI uses, filtered and paged.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.supabase_client import get_supabase

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def list_plan_flags_schema() -> dict[str, Any]:
    return {
        "name": "list_plan_flags",
        "description": (
            "List flags for a plan upload with filters and pagination. Use "
            "this for any plan where get_plan_flags returned too_many_flags, "
            "or any time the user asks for a slice (e.g. 'must-resolve "
            "structural flags on sheets 10-20'). Returns up to "
            f"{MAX_LIMIT} rows per call; follow next_offset to page."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "upload_id": {
                    "type": "string",
                    "description": "plan_uploads.id UUID.",
                },
                "severity": {
                    "type": "string",
                    "enum": ["must_resolve", "nice_to_have"],
                },
                "discipline": {
                    "type": "string",
                    "description": (
                        "Filter by discipline (e.g. 'architectural', "
                        "'structural', 'mep'). Null until classifier ships."
                    ),
                },
                "sheet_from": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Inclusive lower bound on 0-based sheet index.",
                },
                "sheet_to": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Inclusive upper bound on 0-based sheet index.",
                },
                "category_prefix": {
                    "type": "string",
                    "description": (
                        "Hierarchical category prefix, e.g. 'building_code:B1' "
                        "to match all B1:* categories."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_LIMIT,
                    "default": DEFAULT_LIMIT,
                },
                "offset": {
                    "type": "integer",
                    "minimum": 0,
                    "default": 0,
                },
            },
            "required": ["upload_id"],
        },
    }


async def list_plan_flags_execute(args: dict[str, Any]) -> dict[str, Any]:
    upload_id = args.get("upload_id")
    if not upload_id:
        return {"error": "upload_id is required"}
    limit = max(1, min(MAX_LIMIT, int(args.get("limit") or DEFAULT_LIMIT)))
    offset = max(0, int(args.get("offset") or 0))
    return await asyncio.to_thread(
        _sync,
        upload_id=str(upload_id),
        severity=args.get("severity"),
        discipline=args.get("discipline"),
        sheet_from=args.get("sheet_from"),
        sheet_to=args.get("sheet_to"),
        category_prefix=args.get("category_prefix"),
        limit=limit,
        offset=offset,
    )


def _sync(
    *,
    upload_id: str,
    severity: str | None,
    discipline: str | None,
    sheet_from: int | None,
    sheet_to: int | None,
    category_prefix: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    sb = get_supabase()
    q = (
        sb.table("plan_flags")
        .select("*", count="exact")
        .eq("plan_upload_id", upload_id)
    )
    if severity:
        q = q.eq("severity", severity)
    if discipline:
        q = q.eq("discipline", discipline)
    if sheet_from is not None:
        q = q.gte("sheet_index", int(sheet_from))
    if sheet_to is not None:
        q = q.lte("sheet_index", int(sheet_to))
    if category_prefix:
        q = q.like("category", f"{category_prefix}%")

    resp = (
        q.order("sheet_index")
        .order("id")
        .range(offset, offset + limit - 1)
        .execute()
    )
    rows = resp.data or []
    total = resp.count if resp.count is not None else len(rows)
    next_offset = offset + len(rows) if offset + len(rows) < total else None
    return {
        "upload_id": upload_id,
        "flags": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
        "next_offset": next_offset,
    }
