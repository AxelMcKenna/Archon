"""PDF text-layer extraction for building plans.

Pulls structured metadata that the vision pass would otherwise have to
re-read from images: title-block sheet numbers + revisions, and the
drawing register on the cover sheet. Used by `doc_rules` for deterministic
documentation flags and by the analyser prompt for grounding context.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

import pdfplumber

# Sheet code patterns commonly seen on NZ architectural plans:
# A1.01, S2.04, E1.10, M3.02, etc. Letter prefix (architectural, structural,
# civil, electrical, mechanical, plumbing, hydraulic) + numeric.
SHEET_CODE_RE = re.compile(r"\b([A-Z]{1,2}\d{1,2}[.\-]?\d{1,3})\b")
# Revision letter usually appears after "REV", "REVISION", or alone in a
# title-block cell.
REVISION_RE = re.compile(
    r"REV(?:ISION)?[\s.:#-]*([A-Z]\d?|\d+)\b",
    re.IGNORECASE,
)


@dataclass
class TitleBlock:
    page: int
    sheet_number: str | None
    revision: str | None
    raw_text: str


@dataclass
class RegisterEntry:
    sheet_number: str
    title: str | None


@dataclass
class PlanTextExtraction:
    title_blocks: list[TitleBlock] = field(default_factory=list)
    drawing_register: list[RegisterEntry] = field(default_factory=list)

    def to_prompt_block(self) -> dict[str, Any]:
        return {
            "title_blocks": [
                {
                    "page": tb.page,
                    "sheet_number": tb.sheet_number,
                    "revision": tb.revision,
                }
                for tb in self.title_blocks
            ],
            "drawing_register": [
                {"sheet_number": e.sheet_number, "title": e.title}
                for e in self.drawing_register
            ],
        }


def _bottom_right_text(page: pdfplumber.page.Page) -> str:
    """Extract text from the bottom-right quadrant of the page.

    NZ title blocks almost universally sit there. We accept some false
    positives in exchange for a simple deterministic rule.
    """
    w, h = page.width, page.height
    bbox = (w * 0.55, h * 0.55, w, h)
    try:
        cropped = page.within_bbox(bbox, relative=False)
        return cropped.extract_text() or ""
    except Exception:
        return ""


def _parse_title_block(page_no: int, raw: str) -> TitleBlock:
    sheet_match = SHEET_CODE_RE.search(raw)
    rev_match = REVISION_RE.search(raw)
    return TitleBlock(
        page=page_no,
        sheet_number=sheet_match.group(1) if sheet_match else None,
        revision=rev_match.group(1).upper() if rev_match else None,
        raw_text=raw[:500],
    )


def _extract_register(page: pdfplumber.page.Page) -> list[RegisterEntry]:
    """Heuristic: scan the cover sheet for sheet codes paired with titles.

    Looks for lines where a sheet code is followed by descriptive text on
    the same line. Filters duplicates.
    """
    entries: dict[str, RegisterEntry] = {}
    text = page.extract_text() or ""
    for line in text.splitlines():
        # Allow a sheet code anywhere in the line; capture trailing text
        # after the code as the candidate title.
        match = SHEET_CODE_RE.search(line)
        if not match:
            continue
        code = match.group(1)
        rest = line[match.end() :].strip(" -:\t")
        # Skip if the sheet code is the only token (probably a title-block,
        # not a register entry).
        if not rest or len(rest) < 3:
            continue
        # Skip lines that look like a revision/date row rather than a register row.
        if REVISION_RE.search(line) and len(rest) < 8:
            continue
        entries.setdefault(code, RegisterEntry(sheet_number=code, title=rest[:120]))
    return list(entries.values())


def extract_plan_text(pdf_bytes: bytes) -> PlanTextExtraction:
    """Run all PDF text-layer extractions in a single pass."""
    out = PlanTextExtraction()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            raw = _bottom_right_text(page)
            tb = _parse_title_block(idx, raw)
            if tb.sheet_number or tb.revision:
                out.title_blocks.append(tb)
            # Cover sheet: register lives on page 1 in nearly every set we've seen.
            if idx == 1:
                out.drawing_register = _extract_register(page)
    return out
