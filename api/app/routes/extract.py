"""POST /extract — upload an RFI, persist canonical JSON + items, return letter_id."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from supabase import Client

from app.auth import get_db
from app.extractors.markdown import render_letter
from app.extractors.router import extract_document
from app.persistence import insert_extraction_audit, insert_letter
from app.rate_limit import limiter
from app.storage import upload_rfi_original
from app.utils.safe_filename import safe_filename
from app.vision.core.renderer import count_pdf_pages
from app.vision.rfi.schema import MAX_RFI_PAGES

router = APIRouter()

ALLOWED_MEDIA = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 25 * 1024 * 1024


@router.post("")
@limiter.limit("10/minute")
async def extract(
    request: Request,
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    bca: str = Form(...),
    plan_upload_id: UUID | None = Form(None),
    cad_upload_id: UUID | None = Form(None),
    db: Client = Depends(get_db),
) -> dict[str, object]:
    if file.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")
    if plan_upload_id and cad_upload_id:
        raise HTTPException(400, "link to plan_upload_id OR cad_upload_id, not both")
    payload = await file.read()
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "file exceeds 25MB")
    if file.content_type == "application/pdf":
        pages = count_pdf_pages(payload)
        if pages > MAX_RFI_PAGES:
            raise HTTPException(
                422, f"PDF has {pages} pages; the limit is {MAX_RFI_PAGES}"
            )

    letter_uuid = uuid4()
    filename = safe_filename(file.filename, default="rfi.pdf")
    storage_path = upload_rfi_original(
        db,
        project_id=str(project_id),
        letter_id=str(letter_uuid),
        filename=filename,
        content_type=file.content_type,
        data=payload,
    )

    canonical, metrics = extract_document(
        payload,
        media_type=file.content_type,
        project_id=project_id,
        bca=bca,
        rfi_id=letter_uuid,
    )
    rendered = render_letter(canonical)

    letter_id = insert_letter(
        db,
        project_id=str(project_id),
        storage_path=storage_path,
        canonical=canonical,
        rendered_markdown=rendered,
        plan_upload_id=str(plan_upload_id) if plan_upload_id else None,
        cad_upload_id=str(cad_upload_id) if cad_upload_id else None,
    )
    insert_extraction_audit(db, letter_id=letter_id, canonical=canonical, metrics=metrics)

    return {
        "letter_id": letter_id,
        "storage_path": storage_path,
        "extractor": canonical.rfi_letter.extraction.extractor,
        "items_count": len(canonical.rfi_letter.items),
        "processing_ms": metrics.processing_ms,
        "cost_usd": round(metrics.cost_usd, 6),
    }
