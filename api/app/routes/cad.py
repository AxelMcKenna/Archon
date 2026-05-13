"""CAD (DXF) upload, analyse, and revision routes.

Thin HTTP layer. Pipeline orchestration lives in
``app.services.cad_pipeline``.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db
from app.cad.cad_loader import load_dxf
from app.cad.cad_render import list_views, render_view
from app.services.cad_pipeline import (
    RevisionError,
    apply_revision,
)
from app.services.cad_pipeline import (
    upload_and_analyse as run_upload_pipeline,
)
from app.storage import CAD_BUCKET, download, signed_url

router = APIRouter()

ALLOWED_EXT = {".dxf"}
MAX_BYTES = 50 * 1024 * 1024


@router.post("")
async def upload_and_analyse_cad(
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    fname = (file.filename or "drawing.dxf").lower()
    if not any(fname.endswith(ext) for ext in ALLOWED_EXT):
        raise HTTPException(415, "only .dxf is supported")
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
        result = run_upload_pipeline(
            db=db,
            project_id=str(project_id),
            project=proj,
            filename=file.filename or "drawing.dxf",
            payload=payload,
        )
    except Exception as e:
        raise HTTPException(500, f"analysis failed: {e}") from e

    return {
        "cad_id": result.cad_id,
        "flags_count": result.flags_count,
        "entity_count": result.entity_count,
        "views": result.views,
        "processing_ms": result.processing_ms,
    }


def _load_for_render(
    db: Client, cad_id: str, *, prefer_latest_revision: bool = False
) -> tuple[dict[str, Any], bytes]:
    row = (
        db.table("cad_uploads")
        .select("storage_path, analysis, status, filename, project_id")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    if row.get("status") != "analysed":
        raise HTTPException(409, f"not analysed (status={row.get('status')})")

    if prefer_latest_revision:
        rev = (
            db.table("cad_revisions")
            .select("dxf_path")
            .eq("cad_id", cad_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if rev:
            return row, download(db, bucket=CAD_BUCKET, path=rev[0]["dxf_path"])

    return row, download(db, bucket=CAD_BUCKET, path=row["storage_path"])


@router.get("/{cad_id}")
async def get_cad(cad_id: str, db: Client = Depends(get_db)) -> dict[str, Any]:
    row = (
        db.table("cad_uploads").select("*").eq("id", cad_id).maybe_single().execute().data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    return row


@router.get("/{cad_id}/views")
async def list_cad_views(
    cad_id: str, db: Client = Depends(get_db)
) -> dict[str, Any]:
    row, _ = _load_for_render(db, cad_id)
    return {"views": (row.get("analysis") or {}).get("views") or []}


@router.get("/{cad_id}/views/{view_name}.png")
async def cad_view_image(
    cad_id: str,
    view_name: str,
    revised: bool = False,
    db: Client = Depends(get_db),
) -> Response:
    """Render the requested view.

    `?revised=1` swaps in the latest revision DXF so approved changes
    show up baked into the rendered image. Default is the original
    upload so the bbox overlay coordinates (precomputed against the
    original entity layout) line up.
    """
    _, file_bytes = _load_for_render(db, cad_id, prefer_latest_revision=revised)
    doc = load_dxf(file_bytes)
    if view_name not in list_views(doc):
        raise HTTPException(404, f"view {view_name!r} not found")
    png, _ = render_view(doc, view_name)
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store" if revised else "private, max-age=3600"
        },
    )


@router.get("/{cad_id}/signed-url")
async def cad_signed_url(
    cad_id: str, db: Client = Depends(get_db)
) -> dict[str, str]:
    row = (
        db.table("cad_uploads")
        .select("storage_path")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    return {"url": signed_url(db, bucket=CAD_BUCKET, path=row["storage_path"])}


class RevisionRequest(BaseModel):
    approved_flag_indices: list[int]


@router.post("/{cad_id}/revisions")
async def create_revision(
    cad_id: str,
    body: RevisionRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Apply approved proposed_change ops, write a new DXF, return its URL."""
    row, original_bytes = _load_for_render(db, cad_id)
    try:
        result = apply_revision(
            db=db,
            cad_id=cad_id,
            cad_row=row,
            original_bytes=original_bytes,
            approved_flag_indices=body.approved_flag_indices,
        )
    except RevisionError as e:
        raise HTTPException(400, str(e)) from e
    return {
        "revision_id": result.revision_id,
        "applied_count": result.applied_count,
        "url": result.url,
    }


@router.delete("/{cad_id}")
async def delete_cad(cad_id: str, db: Client = Depends(get_db)) -> dict[str, str]:
    row = (
        db.table("cad_uploads")
        .select("storage_path")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    db.storage.from_(CAD_BUCKET).remove([row["storage_path"]])
    db.table("cad_uploads").delete().eq("id", cad_id).execute()
    return {"status": "deleted"}
