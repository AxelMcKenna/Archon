"""Native PDF extraction via pdfplumber (FR-1.2, FR-1.4).

Used when the uploaded PDF has a usable text layer (CCC's standard format).
Produces canonical RFI items with bboxes preserved.
"""

from __future__ import annotations

import io
import re
import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pdfplumber

from app.extractors.entities import extract_entities
from app.extractors.metrics import Metrics
from app.models import CanonicalRfi, ExtractionMeta, RfiItem, RfiLetter

EXTRACTOR_VERSION = "1.0.0"

# Numbered list patterns commonly used in RFI letters.
# Two-tier: prefer explicit "Item N" headings when present (council letters),
# fall back to bare numbered/lettered list markers otherwise.

# Explicit: "Item 1", "Item 1.2", followed by em-dash / en-dash / hyphen / colon
# / dot / paren / a newline. Required for styled letters where bodies contain
# their own internal "1." / "2." sub-bullets.
_ITEM_HEAD_EXPLICIT = re.compile(
    r"""
    ^\s*
    item\s+
    (?P<num>\d{1,2}(?:\.\d{1,2}){0,2})
    (?:\s*[—–\-:.\)]\s+   # em-dash / en-dash / hyphen / colon / dot / paren
       | \s+(?=\S))        # or just whitespace before the title text
    """,
    re.IGNORECASE | re.VERBOSE | re.MULTILINE,
)

# Generic fallback: 1.  …  / 1)  …  / 1.1  …  / a)  …
_ITEM_HEAD_GENERIC = re.compile(
    r"""
    ^\s*
    (?P<num>
        \d{1,2}(?:\.\d{1,2}){0,2}    # 1, 1.1, 1.1.1
        | [a-z]                       # a, b, c
    )
    \s*[.\):\-]\s+
    """,
    re.IGNORECASE | re.VERBOSE | re.MULTILINE,
)


def has_text_layer(pdf_bytes: bytes, threshold_chars: int = 50) -> bool:
    """Probe whether a PDF has a meaningful text layer (FR-1.2 routing)."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        total = 0
        for page in pdf.pages[:3]:
            text = page.extract_text() or ""
            total += len(text.strip())
            if total >= threshold_chars:
                return True
    return False


def _split_items(full_text: str) -> list[tuple[str, str]]:
    """Split letter body into (raw_number, raw_text) tuples.

    Prefers explicit "Item N" headings when at least two are present in the
    letter (typical council format). Falls back to generic numbered-list
    markers, which is more permissive but can be confused by sub-bullets
    embedded within an item body.
    """
    explicit = list(_ITEM_HEAD_EXPLICIT.finditer(full_text))
    matches = explicit if len(explicit) >= 2 else list(_ITEM_HEAD_GENERIC.finditer(full_text))
    if not matches:
        return []
    out: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        body = full_text[start:end].strip()
        if body:
            out.append((m.group("num"), body))
    return out


def extract_native_pdf(
    pdf_bytes: bytes,
    *,
    project_id: UUID,
    bca: str,
    rfi_id: UUID | None = None,
) -> tuple[CanonicalRfi, Metrics]:
    """Extract a native digital PDF into a canonical RFI letter."""
    rfi_id = rfi_id or uuid4()
    warnings: list[str] = []
    t0 = time.monotonic()

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text_parts: list[tuple[int, str]] = []
        for page_idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append((page_idx, text))
        joined = "\n".join(t for _, t in full_text_parts)

    splits = _split_items(joined)
    if not splits:
        warnings.append("No numbered items detected; treating whole letter as one item")
        splits = [("1", joined.strip())]

    items: list[RfiItem] = []
    for idx, (num, body) in enumerate(splits, start=1):
        items.append(
            RfiItem(
                item_id=f"item-{idx}",
                raw_number=num,
                raw_text=body,
                page=None,
                bbox=None,
                extracted=extract_entities(body),
            )
        )

    canonical = CanonicalRfi(
        rfi_letter=RfiLetter(
            rfi_id=rfi_id,
            project_id=project_id,
            bca=bca,
            extraction=ExtractionMeta(
                extractor="pdfplumber",
                extractor_version=EXTRACTOR_VERSION,
                processed_at=datetime.now(UTC),
                warnings=warnings,
            ),
            items=items,
        )
    )
    metrics = Metrics(processing_ms=int((time.monotonic() - t0) * 1000))
    return canonical, metrics
