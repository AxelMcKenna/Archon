"""POST /extract — upload an RFI, persist canonical JSON + items, return letter_id."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from app.auth import CurrentUser, get_current_user, get_db_for, get_service_db
from app.extractors.markdown import render_letter
from app.extractors.router import extract_document
from app.persistence import insert_extraction_audit, insert_letter
from app.storage import upload_rfi_original

router = APIRouter()

ALLOWED_MEDIA = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 25 * 1024 * 1024


@router.post("")
async def extract(
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    bca: str = Form(...),
    user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db_for),
    service_db: Client = Depends(get_service_db),
) -> dict[str, object]:
    if file.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")
    payload = await file.read()
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "file exceeds 25MB")

    # Pre-allocate the letter id so the storage path matches the DB row.
    letter_uuid = uuid4()

    # Storage upload uses service-role client (file is namespaced under user id,
    # bucket policy keeps us inside the user's prefix).
    filename = file.filename or "rfi.pdf"
    storage_path = upload_rfi_original(
        service_db,
        user_id=user.user_id,
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

    # User-scoped writes — RLS verifies project ownership.
    letter_id = insert_letter(
        db,
        project_id=str(project_id),
        storage_path=storage_path,
        canonical=canonical,
        rendered_markdown=rendered,
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
