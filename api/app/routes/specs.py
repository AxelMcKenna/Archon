"""Specification / product-document upload + analysis routes.

Thin HTTP layer mirroring ``routes.plans``: validation, auth, response shaping.
Orchestration lives in ``app.services.spec_pipeline``. The flagger is
deterministic, so there is no streaming/progress variant.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db
from app.rate_limit import limiter
from app.services.spec_pipeline import upload_and_analyse as run_pipeline
from app.storage import SPECS_BUCKET, signed_upload_url, signed_url
from app.utils.safe_filename import safe_filename

router = APIRouter()
log = logging.getLogger(__name__)

# Specs are usually PDFs; allow the common office text formats through to
# storage too, but the pipeline only text-extracts PDFs (others store-only).
ALLOWED_MEDIA = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}
MAX_BYTES = 50 * 1024 * 1024


def _result_payload(result: Any) -> dict[str, Any]:
    return {
        "spec_id": result.spec_id,
        "flags_count": result.flags_count,
        "processing_ms": result.processing_ms,
        "status": result.status,
        "analysed": result.analysed,
    }


def _assert_project(db: Client, project_id: UUID) -> None:
    """RLS-enforced ownership check — a non-owner sees no row."""
    row = (
        db.table("projects")
        .select("id")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "project not found")


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

    _assert_project(db, project_id)

    try:
        result = await asyncio.to_thread(
            run_pipeline,
            db=db,
            project_id=str(project_id),
            filename=safe_filename(file.filename, default="spec.pdf"),
            content_type=file.content_type,
            payload=payload,
            analyse=analyse,
        )
    except Exception as e:
        log.exception("spec analysis failed (project_id=%s)", project_id)
        raise HTTPException(500, "analysis failed") from e

    return _result_payload(result)


class UploadUrlRequest(BaseModel):
    project_id: UUID
    filename: str
    content_type: str


class IngestRequest(BaseModel):
    project_id: UUID
    spec_id: UUID
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
    """Signed Supabase Storage upload URL so the browser can upload the file
    directly (HTTPS, no Vercel proxy body limit). The path embeds the spec_id;
    ``/ingest`` later validates the file lands under this prefix."""
    if body.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {body.content_type}")
    _assert_project(db, body.project_id)
    spec_id = uuid4()
    fname = safe_filename(body.filename, default="spec.pdf")
    path = f"{body.project_id}/{spec_id}/{fname}"
    signed = signed_upload_url(db, bucket=SPECS_BUCKET, path=path)
    return {
        "spec_id": str(spec_id),
        "bucket": SPECS_BUCKET,
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
    expected_prefix = f"{body.project_id}/{body.spec_id}/"
    if not body.storage_path.startswith(expected_prefix):
        raise HTTPException(400, "storage_path does not match project/spec")
    _assert_project(db, body.project_id)

    try:
        result = await asyncio.to_thread(
            run_pipeline,
            db=db,
            project_id=str(body.project_id),
            filename=safe_filename(body.filename, default="spec.pdf"),
            content_type=body.content_type,
            storage_path=body.storage_path,
            spec_id=str(body.spec_id),
            analyse=body.analyse,
        )
    except Exception as e:
        log.exception("spec ingest failed (project_id=%s)", body.project_id)
        raise HTTPException(500, "analysis failed") from e

    return _result_payload(result)


@router.get("/{spec_id}")
async def get_spec(
    spec_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    row = (
        db.table("spec_documents")
        .select("*")
        .eq("id", spec_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "spec document not found")
    return row


@router.get("/{spec_id}/signed-url")
async def get_spec_url(
    spec_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("spec_documents")
        .select("storage_path")
        .eq("id", spec_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "spec document not found")
    return {"url": signed_url(db, bucket=SPECS_BUCKET, path=row["storage_path"])}


@router.delete("/{spec_id}")
async def delete_spec(
    spec_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("spec_documents")
        .select("storage_path")
        .eq("id", spec_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "spec document not found")
    db.storage.from_(SPECS_BUCKET).remove([row["storage_path"]])
    db.table("spec_documents").delete().eq("id", spec_id).execute()
    return {"status": "deleted"}
