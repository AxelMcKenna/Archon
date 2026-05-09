"""Per-item response drafting (Phase 4).

POST /draft/{item_id}        generate (or regenerate) the draft via Claude
GET  /draft/{item_id}        fetch persisted draft + edited text
PATCH /draft/{item_id}       save user edits with Levenshtein edit distance
"""

from __future__ import annotations

from typing import Any

import Levenshtein
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db_for
from app.drafter import draft_response
from app.persistence import (
    fetch_response,
    update_response_edit,
    upsert_response,
)
from app.taxonomy import acceptable_solution_for

router = APIRouter()


def _load_item_context(db: Client, item_id: str) -> dict[str, Any]:
    res = (
        db.table("rfi_items")
        .select(
            "id, raw_text, item_id, "
            "rfi_letters!inner("
            "  id, rfi_number, plan_upload_id, cad_upload_id, "
            "  projects!inner(bca, project_type, description, application_ref)"
            ")"
        )
        .eq("id", item_id)
        .single()
        .execute()
        .data
    )
    if not res:
        raise HTTPException(404, "item not found")

    final_class = (
        db.table("classifications")
        .select("primary_category, severity, reasoning")
        .eq("rfi_item_id", item_id)
        .eq("prong", "final")
        .maybe_single()
        .execute()
    )

    # Stage A grounding output, if it ran. Drafter uses this to choose
    # between FLAG-MATCHED and NO MATCH branches.
    evidence_row = (
        db.table("rfi_item_plan_evidence")
        .select("source, plan_upload_id, cad_upload_id, flag_index, evidence, confidence, rationale")
        .eq("rfi_item_id", item_id)
        .maybe_single()
        .execute()
    )
    evidence = evidence_row.data if evidence_row else None

    # Look up the plan filename + format so the drafter can name the file
    # in the response (e.g. "see floorplan-pro.dxf, hallway adjacent to
    # bedroom 2"). Only fetched when there's a flag match — a NO MATCH
    # draft never references the plan.
    plan_filename: str | None = None
    plan_format: str | None = None
    if evidence and evidence.get("source") == "flag":
        if evidence.get("plan_upload_id"):
            r = (
                db.table("plan_uploads")
                .select("filename")
                .eq("id", evidence["plan_upload_id"])
                .maybe_single()
                .execute()
            )
            if r and r.data:
                plan_filename = r.data["filename"]
                plan_format = "pdf"
        elif evidence.get("cad_upload_id"):
            r = (
                db.table("cad_uploads")
                .select("filename")
                .eq("id", evidence["cad_upload_id"])
                .maybe_single()
                .execute()
            )
            if r and r.data:
                plan_filename = r.data["filename"]
                plan_format = "dxf"

    return {
        "item": res,
        "final": final_class.data if final_class else None,
        "evidence": evidence,
        "plan_filename": plan_filename,
        "plan_format": plan_format,
    }


@router.post("/{item_id}")
async def generate_draft(
    item_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    ctx = _load_item_context(db, item_id)
    if not ctx["final"]:
        raise HTTPException(409, "item must be classified before drafting")

    item = ctx["item"]
    letter = item["rfi_letters"]
    project = letter["projects"]
    final = ctx["final"]

    plan_evidence: dict[str, Any] | None = None
    if ctx["evidence"]:
        plan_evidence = dict(ctx["evidence"])
        plan_evidence["plan_filename"] = ctx["plan_filename"]
        plan_evidence["plan_format"] = ctx["plan_format"]

    draft_text, prompt_version, _metrics = draft_response(
        bca=project["bca"],
        project_type=project["project_type"],
        project_description=project.get("description") or "",
        application_ref=project.get("application_ref"),
        rfi_number=letter.get("rfi_number"),
        item_text=item["raw_text"],
        category=final["primary_category"],
        severity=final["severity"],
        reasoning=final.get("reasoning") or "",
        acceptable_solution=acceptable_solution_for(final["primary_category"]),
        plan_evidence=plan_evidence,
    )

    row = upsert_response(
        db,
        rfi_item_id=item_id,
        draft_text=draft_text,
        prompt_version=prompt_version,
    )
    return row


@router.get("/{item_id}")
async def get_draft(
    item_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    row = fetch_response(db, item_id)
    if not row:
        raise HTTPException(404, "no draft yet")
    return row


class EditRequest(BaseModel):
    edited_text: str


@router.patch("/{item_id}")
async def edit_draft(
    item_id: str,
    body: EditRequest,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    existing = fetch_response(db, item_id)
    if not existing:
        raise HTTPException(404, "no draft yet")
    distance = Levenshtein.distance(existing["draft_text"], body.edited_text)
    try:
        return update_response_edit(
            db,
            rfi_item_id=item_id,
            edited_text=body.edited_text,
            edit_distance=distance,
        )
    except LookupError as e:
        raise HTTPException(404, "draft missing") from e
