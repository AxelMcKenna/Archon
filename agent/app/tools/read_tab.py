"""read_tab: fetch the backing Supabase rows for a project tab.

Returns a compact, summary-friendly payload — not raw rows. The agent uses
this to answer "what's on this tab" without us having to ship every column
to the model.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.supabase_client import get_supabase

# Tabs match web/src/components/project-subnav.tsx — keep in sync.
TAB_NAMES = [
    "overview",
    "forecasting",
    "application-prep",
    "drawings",
    "rfis",
    "processing",
    "inspections",
    "documents",
    "ccc",
    "consent-assessment",
    "risk",
]


def read_tab_schema() -> dict[str, Any]:
    return {
        "name": "read_tab",
        "description": (
            "Read a compact summary of the backing Supabase data for a specific "
            "project tab. Use this whenever the user asks 'what's here', "
            "'summarize this', or asks a question about the current view."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "UUID of the project (provided in system context).",
                },
                "tab": {
                    "type": "string",
                    "enum": TAB_NAMES,
                    "description": "Which tab to read.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to include in detail (default 10).",
                    "default": 10,
                },
            },
            "required": ["project_id", "tab"],
        },
    }


async def read_tab_execute(args: dict[str, Any]) -> dict[str, Any]:
    project_id = args["project_id"]
    tab = args["tab"]
    limit = int(args.get("limit", 10))

    # Supabase python client is sync — offload to a thread so we don't
    # block the agent loop's event loop.
    return await asyncio.to_thread(_read_tab_sync, project_id, tab, limit)


def _read_tab_sync(project_id: str, tab: str, limit: int) -> dict[str, Any]:
    sb = get_supabase()

    if tab == "overview":
        proj = (
            sb.table("projects")
            .select(
                "id,address,bca,project_type,status,description,application_ref,"
                "estimated_floor_area_m2,estimated_construction_value_nzd,created_at,updated_at"
            )
            .eq("id", project_id)
            .maybe_single()
            .execute()
        )
        return {"tab": tab, "project": (proj.data if proj else None)}

    if tab == "drawings":
        rows = (
            sb.table("plan_uploads")
            .select(
                "id,filename,status,analyser_version,prompt_version,"
                "processing_ms,cost_usd,error,created_at,analysis"
            )
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        items = []
        for r in rows.data or []:
            analysis = r.get("analysis") or {}
            flags = analysis.get("flags") if isinstance(analysis, dict) else None
            items.append(
                {
                    "id": r["id"],
                    "filename": r.get("filename"),
                    "status": r.get("status"),
                    "created_at": r.get("created_at"),
                    "flag_count": len(flags) if isinstance(flags, list) else None,
                    "error": r.get("error"),
                    "cost_usd": r.get("cost_usd"),
                }
            )
        return {"tab": tab, "uploads": items, "count": len(items)}

    if tab == "rfis":
        letters = (
            sb.table("rfi_letters")
            .select(
                "id,rfi_number,issue_date,response_deadline,officer_name,status,created_at"
            )
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"tab": tab, "letters": letters.data or [], "count": len(letters.data or [])}

    if tab == "inspections":
        rows = (
            sb.table("project_inspections")
            .select(
                "inspection_id,title,category,timing,status,due_date,booked_date,"
                "result_notes,manual,deleted,sort_order"
            )
            .eq("project_id", project_id)
            .eq("deleted", False)
            .order("sort_order")
            .execute()
        )
        items = rows.data or []
        by_status: dict[str, int] = {}
        for r in items:
            by_status[r.get("status", "Unknown")] = by_status.get(r.get("status", "Unknown"), 0) + 1
        return {
            "tab": tab,
            "inspections": items[:limit],
            "total": len(items),
            "by_status": by_status,
        }

    if tab == "documents" or tab == "application-prep":
        rows = (
            sb.table("attachments")
            .select(
                "id,filename,display_name,document_type,document_status,"
                "rfi_item_id,uploaded_at"
            )
            .eq("project_id", project_id)
            .order("uploaded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"tab": tab, "attachments": rows.data or [], "count": len(rows.data or [])}

    if tab == "ccc":
        # CCC tables vary by deploy — best-effort: surface attachments tagged 'certificates'.
        rows = (
            sb.table("attachments")
            .select("id,filename,display_name,document_status,uploaded_at")
            .eq("project_id", project_id)
            .eq("document_type", "certificates")
            .order("uploaded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"tab": tab, "certificates": rows.data or [], "count": len(rows.data or [])}

    # Tabs without a dedicated table yet (forecasting, processing, risk,
    # consent-assessment) — return the project header so the agent has *some*
    # context. Phase 2 will add real readers when those features land DB-side.
    proj = (
        sb.table("projects")
        .select("id,address,bca,project_type,status")
        .eq("id", project_id)
        .maybe_single()
        .execute()
    )
    return {
        "tab": tab,
        "note": f"No dedicated table for '{tab}' yet; returning project header only.",
        "project": (proj.data if proj else None),
    }
