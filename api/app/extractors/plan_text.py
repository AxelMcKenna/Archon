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

# Sheet code patterns commonly seen on NZ plans. Two conventions:
#   - dotted/joined:  A1.01, S2.04, E1.10, M3.02  (letter + digit + digits)
#   - dashed:         A-101, F-101, M-101          (letter + dash + digits)
# Both require at least two digits (or a separator + 2-3 digits) so bare
# Building Code clauses like "B1"/"C3" are NOT mistaken for sheet codes.
SHEET_CODE_RE = re.compile(
    r"\b([A-Z]{1,2}(?:\d{1,2}[.\-]?\d{1,3}|[.\-]\d{2,3}))\b"
)
# Revision letter usually appears after "REV", "REVISION", or alone in a
# title-block cell.
REVISION_RE = re.compile(
    r"REV(?:ISION)?[\s.:#-]*([A-Z]\d?|\d+)\b",
    re.IGNORECASE,
)

# Sheet-code letter prefix → engineering discipline (NZ drawing convention).
# Keyed on the FIRST letter of the code prefix; a commercial set is split across
# these disciplines, and the split is the highest-value commercial RFI surface
# (cross-discipline coordination). Ambiguous prefixes fall back to the title.
_DISCIPLINE_BY_PREFIX: dict[str, str] = {
    "A": "architectural",
    "S": "structural",
    "E": "electrical",
    "M": "mechanical",
    "P": "plumbing",
    "H": "hydraulic",
    "C": "civil",
    "F": "fire",
    "G": "geotech",
}

# Title-text keywords → discipline, used when the sheet code is missing or its
# prefix is ambiguous. Ordered most-specific first.
_DISCIPLINE_BY_TITLE: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)\bfire\b|fire\s+(?:report|engineering|cell|rated|safety)"), "fire"),
    (re.compile(r"(?i)geotech"), "geotech"),
    (
        re.compile(r"(?i)structural|foundation|framing|\bbeam\b|\bslab\b|\bsteel\b|portal"),
        "structural",
    ),
    (re.compile(r"(?i)mechanical|\bhvac\b|ventilation|ductwork|\bduct\b"), "mechanical"),
    (
        re.compile(r"(?i)electrical|lighting|\bpower\b|switchboard|\brcp\b|reflected\s+ceiling"),
        "electrical",
    ),
    (
        re.compile(r"(?i)hydraulic|plumbing|sanitary|drainage|stormwater|wastewater|water\s+supply"),
        "hydraulic",
    ),
    (re.compile(r"(?i)\bcivil\b|earthworks|site\s+services|pavement"), "civil"),
    (
        re.compile(r"(?i)architectural|floor\s+plan|elevation|\bsection\b|site\s+plan|\bdetail"),
        "architectural",
    ),
)


def discipline_for_sheet_code(code: str | None) -> str | None:
    """Map a sheet code (e.g. ``S2.04``) to a discipline via its letter prefix.

    Returns None when the code is missing or its first letter isn't a known
    discipline prefix — callers then fall back to the title text."""
    if not code:
        return None
    first = code.strip()[:1].upper()
    return _DISCIPLINE_BY_PREFIX.get(first)


def discipline_for_sheet(code: str | None, title: str | None) -> str:
    """Best-effort discipline for a sheet: code prefix first, then title
    keywords, else ``"unknown"``."""
    by_code = discipline_for_sheet_code(code)
    if by_code:
        return by_code
    if title:
        for pattern, disc in _DISCIPLINE_BY_TITLE:
            if pattern.search(title):
                return disc
    return "unknown"


@dataclass
class TitleBlock:
    page: int
    sheet_number: str | None
    revision: str | None
    raw_text: str
    discipline: str | None = None
    sheet_label: str | None = None


@dataclass
class RegisterEntry:
    sheet_number: str
    title: str | None
    discipline: str | None = None


@dataclass
class Schedule:
    """A schedule/table read off a drawing (door, window, fixture, fire-rated
    element, etc.). Commercial sets carry these as structured tables that the
    BCA checks; we surface header + a row sample to the analyser."""

    page: int
    kind: str  # door | window | fixture | fire | finishes | generic
    header: list[str]
    row_count: int
    sample_rows: list[list[str]]


@dataclass
class PlanTextExtraction:
    title_blocks: list[TitleBlock] = field(default_factory=list)
    drawing_register: list[RegisterEntry] = field(default_factory=list)
    schedules: list[Schedule] = field(default_factory=list)

    def to_prompt_block(self) -> dict[str, Any]:
        return {
            "title_blocks": [
                {
                    "page": tb.page,
                    "sheet_number": tb.sheet_number,
                    "revision": tb.revision,
                    "discipline": tb.discipline,
                    "sheet_label": tb.sheet_label,
                }
                for tb in self.title_blocks
            ],
            "drawing_register": [
                {
                    "sheet_number": e.sheet_number,
                    "title": e.title,
                    "discipline": e.discipline,
                }
                for e in self.drawing_register
            ],
            "schedules": [
                {
                    "page": s.page,
                    "kind": s.kind,
                    "header": s.header,
                    "row_count": s.row_count,
                    "sample_rows": s.sample_rows,
                }
                for s in self.schedules
            ],
        }

    def page_metadata(self) -> dict[int, dict[str, str | None]]:
        """``page → {sheet_number, sheet_label, discipline}`` for every page
        with a title block. ``sheet_label`` is the drawing-register title for
        that sheet; ``discipline`` is resolved from the code prefix, falling
        back to the title. Consumed by the analyser to tag each flag's sheet."""
        title_by_code = {
            e.sheet_number: e.title for e in self.drawing_register if e.title
        }
        out: dict[int, dict[str, str | None]] = {}
        for tb in self.title_blocks:
            label = title_by_code.get(tb.sheet_number) if tb.sheet_number else None
            out[tb.page] = {
                "sheet_number": tb.sheet_number,
                "sheet_label": label,
                "discipline": discipline_for_sheet(tb.sheet_number, label),
            }
        return out


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


# Header-keyword → schedule kind. A table whose header row matches one of these
# is kept; everything else (drawing borders, title blocks parsed as tables) is
# dropped so we don't flood the prompt with noise.
_SCHEDULE_KINDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("door", ("door",)),
    ("window", ("window", "glazing")),
    ("fire", ("frr", "fire rating", "fire resistance", "fire-rated", "fire rated")),
    ("fixture", ("fixture", "sanitary", "basin", "wc", "pan", "urinal")),
    ("finishes", ("finish",)),
)
_SCHEDULE_GENERIC_HINTS = ("schedule", "type", "mark", "qty", "ref")
_MAX_SCHEDULES = 24
_SCHEDULE_SAMPLE_ROWS = 6


def _classify_schedule(header_text: str) -> str | None:
    low = header_text.lower()
    for kind, keys in _SCHEDULE_KINDS:
        if any(k in low for k in keys):
            return kind
    if any(h in low for h in _SCHEDULE_GENERIC_HINTS):
        return "generic"
    return None


def _extract_schedules(page: pdfplumber.page.Page, page_no: int) -> list[Schedule]:
    """Pull schedule-like tables off a page. Best-effort and fail-open — a page
    whose table detection errors just yields no schedules."""
    try:
        tables = page.extract_tables() or []
    except Exception:
        return []
    out: list[Schedule] = []
    for table in tables:
        rows = [
            [(c or "").strip() for c in row]
            for row in table
            if row and any(c and c.strip() for c in row)
        ]
        if len(rows) < 2 or len(rows[0]) < 2:
            continue
        header = rows[0]
        kind = _classify_schedule(" ".join(header))
        if not kind:
            continue
        out.append(
            Schedule(
                page=page_no,
                kind=kind,
                header=[h[:40] for h in header][:12],
                row_count=len(rows) - 1,
                sample_rows=[[c[:40] for c in r][:12] for r in rows[1 : 1 + _SCHEDULE_SAMPLE_ROWS]],
            )
        )
    return out


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
            if len(out.schedules) < _MAX_SCHEDULES:
                out.schedules.extend(_extract_schedules(page, idx))

    # Resolve discipline + sheet label now that both register (titles) and
    # title blocks (per-page sheet codes) are known.
    title_by_code = {e.sheet_number: e.title for e in out.drawing_register if e.title}
    for e in out.drawing_register:
        e.discipline = discipline_for_sheet(e.sheet_number, e.title)
    for tb in out.title_blocks:
        label = title_by_code.get(tb.sheet_number) if tb.sheet_number else None
        tb.sheet_label = label
        tb.discipline = discipline_for_sheet(tb.sheet_number, label)
    return out
