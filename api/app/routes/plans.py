"""Building-plan upload + analysis routes."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from app.auth import get_db
from app.plan_analyzer import ANALYSER_VERSION, analyse_plan
from app.storage import PLANS_BUCKET, signed_url, upload_plan

router = APIRouter()

ALLOWED_MEDIA = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 50 * 1024 * 1024


@router.post("")
async def upload_and_analyse(
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if file.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")
    payload = await file.read()
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "file exceeds 50MB")

    proj = (
        db.table("projects")
        .select("id, bca, project_type, description")
        .eq("id", str(project_id))
        .single()
        .execute()
        .data
    )
    if not proj:
        raise HTTPException(404, "project not found")

    plan_id = str(uuid4())
    filename = file.filename or "plan.pdf"
    storage_path = upload_plan(
        db,
        project_id=str(project_id),
        plan_id=plan_id,
        filename=filename,
        content_type=file.content_type,
        data=payload,
    )

    # Insert pending row first so the UI can poll if we ever go async.
    db.table("plan_uploads").insert(
        {
            "id": plan_id,
            "project_id": str(project_id),
            "filename": filename,
            "storage_path": storage_path,
            "mime_type": file.content_type,
            "size_bytes": len(payload),
            "status": "analysing",
            "analyser_version": ANALYSER_VERSION,
        }
    ).execute()

    try:
        analysis, prompt_version, metrics = analyse_plan(
            file_bytes=payload,
            media_type=file.content_type,
            bca=proj["bca"],
            project_type=proj["project_type"],
            project_description=proj.get("description") or "",
        )
    except Exception as e:
        db.table("plan_uploads").update(
            {"status": "failed", "error": str(e)[:500]}
        ).eq("id", plan_id).execute()
        raise HTTPException(500, f"analysis failed: {e}") from e

    db.table("plan_uploads").update(
        {
            "status": "analysed",
            "analysis": analysis,
            "prompt_version": prompt_version,
            "processing_ms": metrics.processing_ms,
            "cost_usd": round(metrics.cost_usd, 6),
        }
    ).eq("id", plan_id).execute()

    return {
        "plan_id": plan_id,
        "flags_count": len(analysis.get("flags", [])),
        "processing_ms": metrics.processing_ms,
        "cost_usd": round(metrics.cost_usd, 6),
    }


@router.get("/{plan_id}")
async def get_plan(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    row = (
        db.table("plan_uploads")
        .select("*")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    return row


@router.get("/{plan_id}/signed-url")
async def get_plan_url(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("plan_uploads")
        .select("storage_path")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    return {"url": signed_url(db, bucket=PLANS_BUCKET, path=row["storage_path"])}


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("plan_uploads")
        .select("storage_path")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    db.storage.from_(PLANS_BUCKET).remove([row["storage_path"]])
    db.table("plan_uploads").delete().eq("id", plan_id).execute()
    return {"status": "deleted"}
