"""get_project_workflow: cross-domain workflow snapshot for a project.

Aggregates RFI letters, document attachments, plan analyses, and inspection
state into a structured payload the llm-gateway can reason about. This replaces
a static UI summary card on the inspections page — moving the data behind
a tool so the llm-gateway can answer follow-up questions with more depth than a
fixed summary could expose.

Read-only Supabase queries — no AI cost.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from typing import Any

from app.supabase_client import get_supabase

OPEN_STATUS_TOKENS = ("open", "draft", "pending")
PENDING_DOC_STATUSES = {"", "pending", "missing"}


def get_project_workflow_schema() -> dict[str, Any]:
    return {
        "name": "get_project_workflow",
        "description": (
            "Cross-domain workflow snapshot for a project — RFIs, documents, "
            "plan flags, and inspections aggregated into status counts, "
            "severity breakdowns, and latest activity. Use this whenever the "
            "user asks how a project is tracking, what's outstanding or "
            "blocking, what's been done recently, or any question that spans "
            "more than one tab. Prefer this over read_tab when the question "
            "is about overall progress rather than a single tab's contents."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "UUID of the project (provided in system context).",
                },
            },
            "required": ["project_id"],
        },
    }


async def get_project_workflow_execute(args: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_sync, args["project_id"])


def _sync(project_id: str) -> dict[str, Any]:
    sb = get_supabase()

    project_row = (
        sb.table("projects")
        .select(
            "id,address,project_type,status,application_ref,bca,"
            "estimated_construction_value_nzd,estimated_floor_area_m2,"
            "created_at,updated_at"
        )
        .eq("id", project_id)
        .maybe_single()
        .execute()
    )
    if not project_row or not project_row.data:
        return {"error": "project not found"}

    return {
        "project": project_row.data,
        "rfis": _summarise_rfis(sb, project_id),
        "attachments": _summarise_attachments(sb, project_id),
        "plans": _summarise_plans(sb, project_id),
        "inspections": _summarise_inspections(sb, project_id),
    }


def _summarise_rfis(sb: Any, project_id: str) -> dict[str, Any]:
    letters = (
        sb.table("rfi_letters")
        .select(
            "id,rfi_number,status,issue_date,response_deadline,"
            "officer_name,created_at,rfi_items(id)"
        )
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = letters.data or []

    status_counts: Counter[str] = Counter()
    open_count = 0
    total_items = 0
    for letter in rows:
        status = str(letter.get("status") or "unknown").lower()
        status_counts[status] += 1
        if any(token in status for token in OPEN_STATUS_TOKENS):
            open_count += 1
        items = letter.get("rfi_items") or []
        total_items += len(items)

    latest = rows[0] if rows else None
    return {
        "total_letters": len(rows),
        "total_items": total_items,
        "open_count": open_count,
        "by_status": dict(status_counts),
        "latest": (
            {
                "id": latest["id"],
                "rfi_number": latest.get("rfi_number"),
                "status": latest.get("status"),
                "issue_date": latest.get("issue_date"),
                "response_deadline": latest.get("response_deadline"),
                "officer_name": latest.get("officer_name"),
            }
            if latest
            else None
        ),
    }


def _summarise_attachments(sb: Any, project_id: str) -> dict[str, Any]:
    attachments = (
        sb.table("attachments")
        .select(
            "id,filename,display_name,document_status,document_type,"
            "rfi_item_id,uploaded_at"
        )
        .eq("project_id", project_id)
        .order("uploaded_at", desc=True)
        .execute()
    )
    rows = attachments.data or []

    status_counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()
    approved = 0
    pending = 0
    for att in rows:
        status = str(att.get("document_status") or "").lower()
        status_counts[status or "pending"] += 1
        type_counts[str(att.get("document_type") or "general")] += 1
        if status == "approved":
            approved += 1
        if status in PENDING_DOC_STATUSES:
            pending += 1

    latest = rows[0] if rows else None
    return {
        "total": len(rows),
        "approved_count": approved,
        "pending_count": pending,
        "by_status": dict(status_counts),
        "by_type": dict(type_counts),
        "latest": (
            {
                "id": latest["id"],
                "filename": latest.get("filename"),
                "display_name": latest.get("display_name"),
                "document_status": latest.get("document_status"),
                "document_type": latest.get("document_type"),
                "rfi_item_id": latest.get("rfi_item_id"),
                "uploaded_at": latest.get("uploaded_at"),
            }
            if latest
            else None
        ),
    }


def _summarise_plans(sb: Any, project_id: str) -> dict[str, Any]:
    plans = (
        sb.table("plan_uploads")
        .select("id,filename,status,processing_ms,created_at,analysis")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = plans.data or []

    status_counts: Counter[str] = Counter()
    flag_severity_counts: Counter[str] = Counter()
    flag_category_counts: Counter[str] = Counter()
    analysed = 0
    total_processing_ms = 0
    must_resolve_flags = 0

    for plan in rows:
        status = str(plan.get("status") or "unknown")
        status_counts[status] += 1
        if status == "analysed":
            analysed += 1
            total_processing_ms += int(plan.get("processing_ms") or 0)
            analysis = plan.get("analysis") or {}
            flags = analysis.get("flags") if isinstance(analysis, dict) else None
            if isinstance(flags, list):
                for flag in flags:
                    if not isinstance(flag, dict):
                        continue
                    severity = str(flag.get("severity") or "unknown")
                    flag_severity_counts[severity] += 1
                    flag_category_counts[str(flag.get("category") or "unknown")] += 1
                    if severity == "must_resolve":
                        must_resolve_flags += 1

    avg_processing_seconds = (
        round(total_processing_ms / analysed / 100) / 10 if analysed > 0 else None
    )
    latest = rows[0] if rows else None
    return {
        "total": len(rows),
        "analysed_count": analysed,
        "must_resolve_flag_count": must_resolve_flags,
        "by_status": dict(status_counts),
        "flags_by_severity": dict(flag_severity_counts),
        "flags_by_category": dict(flag_category_counts),
        "avg_processing_seconds": avg_processing_seconds,
        "latest": (
            {
                "id": latest["id"],
                "filename": latest.get("filename"),
                "status": latest.get("status"),
                "created_at": latest.get("created_at"),
            }
            if latest
            else None
        ),
    }


def _summarise_inspections(sb: Any, project_id: str) -> dict[str, Any]:
    inspections = (
        sb.table("project_inspections")
        .select(
            "inspection_id,title,category,status,due_date,booked_date,"
            "manual,deleted,sort_order"
        )
        .eq("project_id", project_id)
        .eq("deleted", False)
        .order("sort_order")
        .execute()
    )
    rows = inspections.data or []

    status_counts: Counter[str] = Counter()
    for insp in rows:
        status_counts[str(insp.get("status") or "Not Conducted")] += 1

    completed = status_counts.get("Passed", 0) + status_counts.get("Failed", 0)
    failed = status_counts.get("Failed", 0)
    remaining = max(len(rows) - completed, 0)
    percent = round((completed / len(rows)) * 100) if rows else 0

    return {
        "total": len(rows),
        "completed": completed,
        "failed": failed,
        "remaining": remaining,
        "percent_complete": percent,
        "by_status": dict(status_counts),
        "next_pending": next(
            (
                {
                    "inspection_id": r.get("inspection_id"),
                    "title": r.get("title"),
                    "category": r.get("category"),
                    "due_date": r.get("due_date"),
                    "booked_date": r.get("booked_date"),
                }
                for r in rows
                if str(r.get("status") or "Not Conducted") == "Not Conducted"
            ),
            None,
        ),
    }
