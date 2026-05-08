"""Claude vision RFI extraction (FR-1.3).

Primary extractor for scanned PDFs and image uploads. Renders each PDF page to
an image and asks Claude to return structured JSON via tool use. The deterministic
entity extractor (entities.py) populates the `extracted` block afterwards — Claude
is not asked to do entity extraction, only layout-aware item segmentation.
"""

from __future__ import annotations

import base64
import io
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import anthropic
import pdfplumber

from app.config import get_settings
from app.extractors.entities import extract_entities
from app.extractors.metrics import Metrics
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
    """Render PDF pages to PNG bytes for Claude vision input."""
    images: list[bytes] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:max_pages]:
            im = page.to_image(resolution=150).original
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            images.append(buf.getvalue())
    return images


def _image_block(png_bytes: bytes) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.b64encode(png_bytes).decode("ascii"),
        },
    }


def extract_via_vision(
    file_bytes: bytes,
    *,
    media_type: str,
    project_id: UUID,
    bca: str,
    rfi_id: UUID | None = None,
) -> tuple[CanonicalRfi, Metrics]:
    """Extract a scanned PDF or image upload via Claude vision."""
    rfi_id = rfi_id or uuid4()
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    t0 = time.monotonic()

    if media_type == "application/pdf":
        images = _pdf_to_images(file_bytes)
    else:
        images = [file_bytes]

    content: list[dict[str, Any]] = [_image_block(img) for img in images]
    content.append(
        {
            "type": "text",
            "text": "Parse this RFI letter. Use the record_rfi_letter tool.",
        }
    )

    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=8000,
        system=_SYSTEM,
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "record_rfi_letter"},
        messages=[{"role": "user", "content": content}],
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("Claude vision extractor did not return tool use")
    payload: dict[str, Any] = tool_use.input  # type: ignore[assignment]

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
        input_tokens=int(getattr(response.usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(response.usage, "output_tokens", 0) or 0),
    )
    return canonical, metrics
