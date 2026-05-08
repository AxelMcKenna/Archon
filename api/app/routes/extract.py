"""POST /extract — accept an RFI upload, return canonical JSON + markdown.

Phase-1 scaffold: no Supabase persistence yet (added in Phase 2). The route
exists so the web app can wire upload UI against it now.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.extractors.markdown import render_letter
from app.extractors.router import extract_document
from app.models import CanonicalRfi

router = APIRouter()

ALLOWED_MEDIA = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 25 * 1024 * 1024


@router.post("")
async def extract(
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    bca: str = Form(...),
) -> dict[str, object]:
    if file.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")
    payload = await file.read()
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "file exceeds 25MB")

    canonical: CanonicalRfi = extract_document(
        payload,
        media_type=file.content_type,
        project_id=project_id,
        bca=bca,
    )
    return {
        "canonical": canonical.model_dump(mode="json"),
        "markdown": render_letter(canonical),
    }
