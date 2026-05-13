"""Vision-based RFI extraction (FR-1.3).

Primary extractor for scanned PDFs and image uploads. Renders each PDF page
to an image and asks the configured vision model to return structured JSON
via tool use. The deterministic entity extractor (entities.py) populates the
`extracted` block afterwards — the vision model is not asked to do entity
extraction, only layout-aware item segmentation.
"""

from __future__ import annotations

import io
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pdfplumber

from app.config import get_settings
from app.extractors.entities import extract_entities
from app.extractors.metrics import Metrics
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool
from app.models import CanonicalRfi, ExtractionMeta, RfiItem, RfiLetter

EXTRACTOR_VERSION = "1.0.0"

_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_rfi_letter",
    "description": "Record the parsed structure of an RFI letter.",
    "input_schema": {
        "type": "object",
        "required": ["items"],
        "properties": {
            "application_ref": {"type": ["string", "null"]},
            "rfi_number": {"type": ["integer", "null"]},
            "issue_date": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
            "response_deadline": {"type": ["string", "null"]},
            "officer_name": {"type": ["string", "null"]},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["raw_number", "raw_text", "page"],
                    "properties": {
                        "raw_number": {"type": "string"},
                        "raw_text": {"type": "string"},
                        "page": {"type": "integer"},
                    },
                },
            },
        },
    },
}

_SYSTEM = """You parse New Zealand Building Consent Authority (BCA) Request for
Information (RFI) letters into structured data.

Your job:
1. Identify the letter-level metadata (application reference, RFI number, dates,
   officer name) if present in the document headers/body.
2. Identify each numbered or bulleted line item in the body of the letter.
3. Return the **verbatim text** of each item — do not summarise, paraphrase, or
   correct OCR errors. Preserve clause references, document references, and
   dimensions exactly as printed.
4. Skip headers, footers, page numbers, addresses, and signature blocks. These
   are not items.

Return your output via the record_rfi_letter tool."""


def _pdf_to_images(pdf_bytes: bytes, max_pages: int = 20) -> list[bytes]:
    """Render PDF pages to PNG bytes for vision input."""
    images: list[bytes] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:max_pages]:
            im = page.to_image(resolution=150).original
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            images.append(buf.getvalue())
    return images


_PROMPT = (
    _SYSTEM + "\n\nParse this RFI letter. Use the record_rfi_letter tool."
)


def extract_via_vision(
    file_bytes: bytes,
    *,
    media_type: str,
    project_id: UUID,
    bca: str,
    rfi_id: UUID | None = None,
) -> tuple[CanonicalRfi, Metrics]:
    """Extract a scanned PDF or image upload via vision."""
    rfi_id = rfi_id or uuid4()
    settings = get_settings()
    t0 = time.monotonic()

    images = (
        _pdf_to_images(file_bytes)
        if media_type == "application/pdf"
        else [file_bytes]
    )

    if settings.rfi_extractor_provider == "openrouter":
        or_result = call_openrouter_tool(
            images=images,
            prompt=_PROMPT,
            tool_name=_TOOL_SCHEMA["name"],
            tool_description=_TOOL_SCHEMA["description"],
            tool_parameters=_TOOL_SCHEMA["input_schema"],
            max_output_tokens=8000,
            model=settings.openrouter_model,
        )
        payload = or_result.payload
        input_tokens = or_result.input_tokens
        output_tokens = or_result.output_tokens
    else:
        gemini_result = call_gemini_tool(
            images=images,
            prompt=_PROMPT,
            tool_name=_TOOL_SCHEMA["name"],
            tool_description=_TOOL_SCHEMA["description"],
            tool_parameters=_TOOL_SCHEMA["input_schema"],
            max_output_tokens=8000,
            model=settings.gemini_model,
        )
        payload = gemini_result.payload
        input_tokens = gemini_result.input_tokens
        output_tokens = gemini_result.output_tokens

    items: list[RfiItem] = []
    for idx, raw in enumerate(payload.get("items", []), start=1):
        text = raw["raw_text"]
        items.append(
            RfiItem(
                item_id=f"item-{idx}",
                raw_number=raw.get("raw_number"),
                raw_text=text,
                page=raw.get("page"),
                bbox=None,
                extracted=extract_entities(text),
            )
        )

    canonical = CanonicalRfi(
        rfi_letter=RfiLetter(
            rfi_id=rfi_id,
            project_id=project_id,
            bca=bca,
            application_ref=payload.get("application_ref"),
            rfi_number=payload.get("rfi_number"),
            issue_date=payload.get("issue_date"),
            response_deadline=payload.get("response_deadline"),
            officer_name=payload.get("officer_name"),
            extraction=ExtractionMeta(
                extractor="claude-vision",
                extractor_version=EXTRACTOR_VERSION,
                processed_at=datetime.now(UTC),
                warnings=[],
            ),
            items=items,
        )
    )
    metrics = Metrics(
        processing_ms=int((time.monotonic() - t0) * 1000),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return canonical, metrics
