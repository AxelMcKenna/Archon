"""Document type detection and extractor routing (FR-1.2)."""

from __future__ import annotations

from uuid import UUID

from app.extractors.claude_vision import extract_via_vision
from app.extractors.metrics import Metrics
from app.extractors.pdf_native import extract_native_pdf, has_text_layer
from app.models import CanonicalRfi


def extract_document(
    file_bytes: bytes,
    *,
    media_type: str,
    project_id: UUID,
    bca: str,
    rfi_id: UUID | None = None,
) -> tuple[CanonicalRfi, Metrics]:
    """Route to the appropriate extractor based on document type."""
    if media_type == "application/pdf" and has_text_layer(file_bytes):
        return extract_native_pdf(file_bytes, project_id=project_id, bca=bca, rfi_id=rfi_id)
    return extract_via_vision(
        file_bytes,
        media_type=media_type,
        project_id=project_id,
        bca=bca,
        rfi_id=rfi_id,
    )
