"""PDF → structured clause chunks for MBIE Acceptable Solutions.

MBIE AS / VM wiki are well-structured: each document has hierarchical
clauses like ``3.1.2 Cavity wall ties`` followed by prose, often with
embedded tables and figures. We extract:

  - clause_number   ('3.1.2')
  - heading         ('Cavity wall ties')
  - text            (the body until the next clause heading)
  - page            (1-based PDF page where the heading appears)

Tables and figures are not separately parsed in v1 — their captions
get pulled in with surrounding prose, which is usually enough for the
verifier to know a relevant detail exists. Diagram-only clauses (e.g.
E2/AS1 flashing details) will need a later upgrade that passes the
page image alongside the text.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass

import pdfplumber

# Heading patterns the extractor recognises. Order matters: more
# specific patterns first.
#
# Examples we want to catch:
#   "3.1 Floors"
#   "3.1.2 Cavity wall ties"
#   "9.2.4.1 Drainage cavity battens"
#   "Paragraph 9.1.5"
#
# We *don't* want to catch:
#   "Figure 7", "Table 4" — these are captions, kept as body text
#   "Page 12" — page numbers
_CLAUSE_HEADING = re.compile(
    r"^(\d+(?:\.\d+){0,4})\s+([A-Z][A-Za-z][A-Za-z0-9 ,\-\/&\(\)]{2,120})\s*$"
)

# Some MBIE wiki prefix clauses with "Paragraph N.N.N" inline. Treat
# those as headings only when they sit alone on a line.
_PARAGRAPH_HEADING = re.compile(
    r"^Paragraph\s+(\d+(?:\.\d+){1,4})\s*[:\-]?\s*(.{2,120})?$"
)


@dataclass
class ClauseChunk:
    clause_number: str
    heading: str
    text: str
    page: int


def _normalise_line(line: str) -> str:
    return re.sub(r"\s+", " ", line or "").strip()


def _is_heading(line: str) -> tuple[str, str] | None:
    """Returns (clause_number, heading) if this line is a clause heading."""
    norm = _normalise_line(line)
    if not norm or len(norm) > 160:
        return None
    m = _CLAUSE_HEADING.match(norm)
    if m:
        return m.group(1), m.group(2).strip()
    m = _PARAGRAPH_HEADING.match(norm)
    if m:
        return m.group(1), (m.group(2) or "").strip()
    return None


def page_texts_native(pdf_bytes: bytes) -> list[str]:
    """Per-page text via the PDF's own text layer (pdfplumber).

    Returns one string per page (empty string for pages with no
    extractable text). Reliable for the well-behaved MBIE PDFs; useless
    for documents whose text layer encodes glyphs into the private-use
    area (see ``app.ingestion.mbie.extract`` for the OCR fallback that
    handles those).
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return [(page.extract_text() or "") for page in pdf.pages]


def chunk_page_texts(
    page_texts: list[str],
    *,
    min_body_chars: int = 40,
) -> list[ClauseChunk]:
    """Chunk a list of per-page text strings into clauses.

    Source-agnostic: ``page_texts`` may come from the native text layer
    (``page_texts_native``) or from OCR (``app.ingestion.mbie.ocr``), so
    the same clause-heading logic serves both paths.

    ``min_body_chars`` drops degenerate chunks where the heading was
    detected but the body is empty (typical for ToC entries that match
    the regex but have no following prose on the same page).
    """
    chunks: list[ClauseChunk] = []
    current: dict | None = None

    for page_idx, text in enumerate(page_texts, start=1):
        for raw_line in (text or "").splitlines():
            line = _normalise_line(raw_line)
            if not line:
                continue
            heading_match = _is_heading(line)
            if heading_match is not None:
                if current is not None:
                    body = current["body"].strip()
                    if len(body) >= min_body_chars:
                        chunks.append(
                            ClauseChunk(
                                clause_number=current["clause_number"],
                                heading=current["heading"],
                                text=body,
                                page=current["page"],
                            )
                        )
                clause_number, heading = heading_match
                current = {
                    "clause_number": clause_number,
                    "heading": heading,
                    "body": "",
                    "page": page_idx,
                }
                continue
            if current is None:
                # Preamble before the first heading — skip rather than
                # bucket into an "intro" clause that won't be looked up.
                continue
            current["body"] += line + " "

    # Flush the trailing chunk.
    if current is not None:
        body = current["body"].strip()
        if len(body) >= min_body_chars:
            chunks.append(
                ClauseChunk(
                    clause_number=current["clause_number"],
                    heading=current["heading"],
                    text=body,
                    page=current["page"],
                )
            )

    return chunks


def extract_clauses(
    pdf_bytes: bytes,
    *,
    min_body_chars: int = 40,
) -> list[ClauseChunk]:
    """Parse a PDF into clause chunks via its native text layer.

    Thin wrapper kept for back-compat; new callers that want the OCR
    fallback for broken-text-layer PDFs should use
    ``app.ingestion.mbie.extract.extract_clauses_robust``.
    """
    return chunk_page_texts(
        page_texts_native(pdf_bytes), min_body_chars=min_body_chars
    )
