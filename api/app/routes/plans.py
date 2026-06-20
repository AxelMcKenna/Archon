"""Building-plan upload + analysis routes.

Thin HTTP layer: validation, auth, response shaping. The upload/analyse
orchestration lives in ``app.services.plan_pipeline``; bbox stats live
in ``app.plans.stats``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db
from app.plans.overlay import get_page_info, render_overlay_pdf, render_page
from app.plans.stats import compute_bbox_stats
from app.rate_limit import limiter
from app.services.plan_pipeline import upload_and_analyse as run_pipeline
from app.services.value_engineering_pipeline import (
    get_latest_value_engineering,
    run_value_engineering,
)
from app.storage import PLANS_BUCKET, download, signed_upload_url, signed_url
from app.utils.safe_filename import safe_filename
from app.utils.sse import progress_sse_response

router = APIRouter()
log = logging.getLogger(__name__)

ALLOWED_MEDIA = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 50 * 1024 * 1024


@router.post("")
@limiter.limit("10/minute")
async def upload_and_analyse(
    request: Request,
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    analyse: bool = Form(True),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if file.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")
    payload = await file.read()
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "file exceeds 50MB")

    proj = _load_project(db, project_id)

    try:
        result = await asyncio.to_thread(
            run_pipeline,
            db=db,
            project_id=str(project_id),
            project=proj,
            filename=safe_filename(file.filename, default="plan.pdf"),
            content_type=file.content_type,
            payload=payload,
            analyse=analyse,
        )
    except Exception as e:
        log.exception("plan analysis failed (project_id=%s)", project_id)
        raise HTTPException(500, "analysis failed") from e

    return {
        "plan_id": result.plan_id,
        "flags_count": result.flags_count,
        "processing_ms": result.processing_ms,
        "cost_usd": result.cost_usd,
        "truncated": result.truncated,
        "verification": result.verification,
        "cached": result.cached,
    }


def _load_project(db: Client, project_id: UUID) -> dict[str, Any]:
    # risk_group / importance_level land with the commercial-support migration;
    # fall back to the legacy projection if they aren't present yet.
    def _fetch(columns: str) -> dict[str, Any] | None:
        return (
            db.table("projects")
            .select(columns)
            .eq("id", str(project_id))
            .single()
            .execute()
            .data
        )

    try:
        proj = _fetch(
            "id, bca, project_type, description, risk_group, importance_level"
        )
    except Exception:  # noqa: BLE001 — pre-migration column-missing fallback
        proj = _fetch("id, bca, project_type, description")
    if not proj:
        raise HTTPException(404, "project not found")
    return proj


class UploadUrlRequest(BaseModel):
    project_id: UUID
    filename: str
    content_type: str


class IngestRequest(BaseModel):
    project_id: UUID
    plan_id: UUID
    storage_path: str
    filename: str
    content_type: str
    analyse: bool = True


@router.post("/upload-url")
@limiter.limit("20/minute")
async def create_upload_url(
    request: Request,
    body: UploadUrlRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Issue a signed Supabase Storage upload URL so the browser can upload the
    file directly (HTTPS, no Vercel proxy body limit). The path embeds the
    plan_id; ``/ingest`` later validates the file lands under this prefix."""
    if body.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {body.content_type}")
    _load_project(db, body.project_id)  # RLS-enforced ownership check
    plan_id = uuid4()
    fname = safe_filename(body.filename, default="plan.pdf")
    path = f"{body.project_id}/{plan_id}/{fname}"
    signed = signed_upload_url(db, bucket=PLANS_BUCKET, path=path)
    return {
        "plan_id": str(plan_id),
        "bucket": PLANS_BUCKET,
        "path": path,
        "filename": fname,
        "token": signed["token"],
    }


@router.post("/ingest")
@limiter.limit("10/minute")
async def ingest_uploaded(
    request: Request,
    body: IngestRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Analyse a file the browser already uploaded to storage via /upload-url."""
    if body.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {body.content_type}")
    # Reject paths that don't belong to this project+plan — the signed token is
    # path-scoped, but defend in depth so a caller can't analyse another row's file.
    expected_prefix = f"{body.project_id}/{body.plan_id}/"
    if not body.storage_path.startswith(expected_prefix):
        raise HTTPException(400, "storage_path does not match project/plan")
    proj = _load_project(db, body.project_id)

    try:
        result = await asyncio.to_thread(
            run_pipeline,
            db=db,
            project_id=str(body.project_id),
            project=proj,
            filename=safe_filename(body.filename, default="plan.pdf"),
            content_type=body.content_type,
            storage_path=body.storage_path,
            plan_id=str(body.plan_id),
            analyse=body.analyse,
        )
    except Exception as e:
        log.exception("plan ingest failed (project_id=%s)", body.project_id)
        raise HTTPException(500, "analysis failed") from e

    return {
        "plan_id": result.plan_id,
        "flags_count": result.flags_count,
        "processing_ms": result.processing_ms,
        "cost_usd": result.cost_usd,
        "truncated": result.truncated,
        "verification": result.verification,
        "cached": result.cached,
    }


@router.post("/ingest-stream")
@limiter.limit("10/minute")
async def ingest_uploaded_stream(
    request: Request,
    body: IngestRequest,
    db: Client = Depends(get_db),
) -> StreamingResponse:
    """Same as /ingest, but streams the analyser's progress as SSE so the UI can
    show a live engine log instead of a spinner. The final ``result`` frame
    carries the same payload /ingest returns."""
    if body.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {body.content_type}")
    expected_prefix = f"{body.project_id}/{body.plan_id}/"
    if not body.storage_path.startswith(expected_prefix):
        raise HTTPException(400, "storage_path does not match project/plan")
    proj = _load_project(db, body.project_id)

    def run(progress: Any) -> dict[str, Any]:
        result = run_pipeline(
            db=db,
            project_id=str(body.project_id),
            project=proj,
            filename=safe_filename(body.filename, default="plan.pdf"),
            content_type=body.content_type,
            storage_path=body.storage_path,
            plan_id=str(body.plan_id),
            analyse=body.analyse,
            progress=progress,
        )
        return {
            "plan_id": result.plan_id,
            "flags_count": result.flags_count,
            "processing_ms": result.processing_ms,
            "cost_usd": result.cost_usd,
            "truncated": result.truncated,
            "verification": result.verification,
            "cached": result.cached,
        }

    return await progress_sse_response(run)


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
    # Rendering page images / overlays only needs the stored file, not a
    # completed RFI analysis — VE overlays run on plans that were never
    # RFI-analysed. Missing analysis just yields an empty flag set.
    if not row.get("storage_path"):
        raise HTTPException(409, "plan has no stored file to render")
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


@router.post("/{plan_id}/value-engineering")
@limiter.limit("10/minute")
async def trigger_value_engineering(
    request: Request,
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = await asyncio.to_thread(run_value_engineering, db, plan_id=plan_id)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:
        log.exception("value engineering failed (plan_id=%s)", plan_id)
        raise HTTPException(500, "value engineering failed") from e
    return {
        "ve_id": result.ve_id,
        "plan_id": result.source_id,
        "opportunities_count": result.opportunities_count,
        "processing_ms": result.processing_ms,
        "cost_usd": result.cost_usd,
        "cached": result.cached,
        "truncated": result.truncated,
    }


@router.get("/{plan_id}/value-engineering")
async def get_value_engineering(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any] | None:
    row = get_latest_value_engineering(db, plan_id=plan_id)
    if not row:
        return None
    return row


def _opportunities_to_flags(opportunities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shape VE opportunities into the overlay renderer's flag contract.

    Cost-impact bands map to ``ve_*`` severity keys (emerald) and the model
    bbox is passed through. Opportunities without a bbox are dropped so the
    pin numbering matches only the localised items.
    """
    flags: list[dict[str, Any]] = []
    for o in opportunities:
        bbox = o.get("bbox")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
            continue
        impact = str(o.get("cost_impact") or "medium")
        flags.append(
            {
                "page": int(o.get("page") or 1),
                "bbox": bbox,
                "severity": f"ve_{impact}",
            }
        )
    return flags


@router.get("/{plan_id}/value-engineering/overlay.pdf")
async def value_engineering_overlay_pdf(
    plan_id: str,
    db: Client = Depends(get_db),
) -> Response:
    row, file_bytes = _load_plan_for_render(db, plan_id)
    ve = get_latest_value_engineering(db, plan_id=plan_id)
    opportunities = (ve or {}).get("opportunities") or []
    pdf = render_overlay_pdf(
        file_bytes=file_bytes,
        media_type=row["mime_type"],
        flags=_opportunities_to_flags(opportunities),
    )
    base = (row.get("filename") or "plan").rsplit(".", 1)[0]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{base}-value-engineering.pdf"',
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
