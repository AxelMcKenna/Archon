"""Building-plan upload + analysis routes.

Thin HTTP layer: validation, auth, response shaping. The upload/analyse
orchestration lives in ``app.services.plan_pipeline``; bbox stats live
in ``app.plans.stats``.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from supabase import Client

from app.auth import get_db
from app.plan_overlay import get_page_info, render_overlay_pdf, render_page
from app.plans.stats import compute_bbox_stats
from app.services.plan_pipeline import upload_and_analyse as run_pipeline
from app.storage import PLANS_BUCKET, download, signed_url

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

    try:
        result = run_pipeline(
            db=db,
            project_id=str(project_id),
            project=proj,
            filename=file.filename or "plan.pdf",
            content_type=file.content_type,
            payload=payload,
        )
    except Exception as e:
        raise HTTPException(500, f"analysis failed: {e}") from e

    return {
        "plan_id": result.plan_id,
        "flags_count": result.flags_count,
        "processing_ms": result.processing_ms,
        "cost_usd": result.cost_usd,
        "truncated": result.truncated,
        "verification": result.verification,
        "cached": result.cached,
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


def _load_plan_for_render(
    db: Client, plan_id: str
) -> tuple[dict[str, Any], bytes]:
    row = (
        db.table("plan_uploads")
        .select("storage_path, mime_type, analysis, status, filename")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    if row.get("status") != "analysed":
        raise HTTPException(409, f"plan not analysed (status={row.get('status')})")
    file_bytes = download(db, bucket=PLANS_BUCKET, path=row["storage_path"])
    return row, file_bytes


@router.get("/{plan_id}/pages")
async def list_pages(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    row, file_bytes = _load_plan_for_render(db, plan_id)
    pages = get_page_info(file_bytes=file_bytes, media_type=row["mime_type"])
    return {"pages": [p.__dict__ for p in pages]}


@router.get("/{plan_id}/pages/{page_num}.png")
async def page_image(
    plan_id: str,
    page_num: int,
    db: Client = Depends(get_db),
) -> Response:
    row, file_bytes = _load_plan_for_render(db, plan_id)
    try:
        png = render_page(
            file_bytes=file_bytes,
            media_type=row["mime_type"],
            page=page_num,
        )
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/{plan_id}/bbox-stats")
async def bbox_stats(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    row = (
        db.table("plan_uploads")
        .select("analysis, status, prompt_version, analyser_version")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    flags = (row.get("analysis") or {}).get("flags") or []
    stats = compute_bbox_stats(flags)
    return {
        **stats,
        "prompt_version": row.get("prompt_version"),
        "analyser_version": row.get("analyser_version"),
        "status": row.get("status"),
    }


@router.get("/{plan_id}/overlay.pdf")
async def overlay_pdf(
    plan_id: str,
    db: Client = Depends(get_db),
) -> Response:
    row, file_bytes = _load_plan_for_render(db, plan_id)
    flags = (row.get("analysis") or {}).get("flags") or []
    pdf = render_overlay_pdf(
        file_bytes=file_bytes,
        media_type=row["mime_type"],
        flags=flags,
    )
    base = (row.get("filename") or "plan").rsplit(".", 1)[0]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{base}-marked-up.pdf"',
            "Cache-Control": "no-store",
        },
    )


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
