"""PDF text-layer extraction for material / product data sheets.

A product datasheet (BRANZ appraisal, CodeMark certificate, manufacturer data
sheet) is its own document shape - not specification prose. What the BCA cares
about, and what drives product-assurance RFIs, is:

  - the product / system name and manufacturer,
  - the assurance reference (BRANZ Appraisal No. / CodeMark CM number) - a bare
    "BRANZ appraised" with no number is itself an RFI,
  - the **scope / conditions of use** (the appraisal's limits - wind zone,
    height, exposure), which is where "product used outside its appraised scope"
    RFIs originate,
  - durability (B2) / weathertightness (E2) relevance and cited standards.

Reuses the spec extractor's assurance regexes + the shared standards extractor.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

import pdfplumber

from app.extractors.entities import _extract_standards
from app.extractors.spec_text import (
    _ASSURANCE_NUMBERED_RE,
    _ASSURANCE_WORD_RE,
)

# Product / system tokens (shared coordination vocabulary - same tokens the spec
# extractor and coordination claims use).
_SYSTEM_KEYWORDS: dict[str, str] = {
    "cladding": "cladding_system",
    "weatherboard": "cladding_system",
    "rainscreen": "cladding_system",
    "cavity": "cladding_system",
    "rigid air barrier": "cladding_system",
    "building wrap": "cladding_system",
    "membrane": "membrane",
    "waterproofing": "membrane",
    "tanking": "membrane",
}

# Labelled fields commonly on a datasheet / appraisal cover.
_PRODUCT_RE = re.compile(
    r"(?im)^\s*(?:product(?:\s+name)?|system|trade\s+name|description)\s*[:\-]\s*(.+)$"
)
_MANUFACTURER_RE = re.compile(
    r"(?im)^\s*(?:manufacturer|manufactured\s+by|supplier|distributed\s+by|product\s+holder|appraisal\s+holder)\s*[:\-]\s*(.+)$"
)

# Scope / conditions of use - the lines that carry the appraisal's limits.
_SCOPE_RE = re.compile(
    r"(?i)\b(scope\s+of\s+use|conditions?\s+of\s+use|intended\s+(?:for\s+)?use|"
    r"limitations?|must\s+not\s+be\s+used|not\s+suitable|maximum\s+(?:height|wind)|"
    r"wind\s+zone|exposure\s+zone|sea\s+spray)\b"
)

# Durability (B2) / weathertightness (E2) relevance.
_DURABILITY_RE = re.compile(r"(?i)\b(durability|B2/AS1|\bB2\b|serviceable\s+life|\d+\s*years?)\b")
_WEATHERTIGHT_RE = re.compile(r"(?i)\b(weathertight|E2/AS1|\bE2\b|moisture|water\s+penetration)\b")

_SNIPPET = 200
_MAX_SCOPE = 40


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()[:_SNIPPET]


@dataclass
class AssuranceRef:
    text: str
    numbered: bool


@dataclass
class ScopePhrase:
    page: int
    snippet: str


@dataclass
class MaterialExtraction:
    page_count: int = 0
    text_chars: int = 0
    product: str | None = None
    manufacturer: str | None = None
    assurance_refs: list[AssuranceRef] = field(default_factory=list)
    scope_of_use: list[ScopePhrase] = field(default_factory=list)
    standards: list[str] = field(default_factory=list)
    systems: set[str] = field(default_factory=set)
    durability_mentioned: bool = False
    weathertight_mentioned: bool = False

    @property
    def has_numbered_assurance(self) -> bool:
        return any(r.numbered for r in self.assurance_refs)

    @property
    def looks_scanned(self) -> bool:
        return self.page_count > 0 and self.text_chars < 40 * self.page_count

    def to_prompt_block(self) -> dict[str, Any]:
        return {
            "product": self.product,
            "manufacturer": self.manufacturer,
            "systems": sorted(self.systems),
            "assurance_refs": [
                {"text": r.text, "numbered": r.numbered} for r in self.assurance_refs
            ],
            "scope_of_use": [
                {"page": s.page, "snippet": s.snippet} for s in self.scope_of_use
            ],
            "standards": self.standards,
            "durability_mentioned": self.durability_mentioned,
            "weathertight_mentioned": self.weathertight_mentioned,
        }


def _scan_line(out: MaterialExtraction, page_no: int, line: str) -> None:
    snippet = _clean(line)
    if not snippet:
        return

    if out.product is None:
        m = _PRODUCT_RE.match(line)
        if m:
            out.product = _clean(m.group(1))
    if out.manufacturer is None:
        m = _MANUFACTURER_RE.match(line)
        if m:
            out.manufacturer = _clean(m.group(1))

    numbered = list(_ASSURANCE_NUMBERED_RE.finditer(line))
    for m in numbered:
        out.assurance_refs.append(AssuranceRef(text=_clean(m.group(0)), numbered=True))
    if not numbered and _ASSURANCE_WORD_RE.search(line):
        out.assurance_refs.append(AssuranceRef(text=snippet, numbered=False))

    if len(out.scope_of_use) < _MAX_SCOPE and _SCOPE_RE.search(line):
        out.scope_of_use.append(ScopePhrase(page=page_no, snippet=snippet))

    low = line.lower()
    for kw, token in _SYSTEM_KEYWORDS.items():
        if kw in low:
            out.systems.add(token)


def extract_material_from_text(
    full_text: str, *, page_count: int = 1
) -> MaterialExtraction:
    """Run the material extraction over already-extracted text (testable path)."""
    out = MaterialExtraction(page_count=page_count, text_chars=len(full_text or ""))
    for line in (full_text or "").splitlines():
        _scan_line(out, 1, line)
    _finalise(out, full_text or "")
    return out


def extract_material_text(pdf_bytes: bytes) -> MaterialExtraction:
    """Read a material/product datasheet PDF's text layer."""
    out = MaterialExtraction()
    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        out.page_count = len(pdf.pages)
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            parts.append(text)
            for line in text.splitlines():
                _scan_line(out, idx, line)
    full_text = "\n".join(parts)
    out.text_chars = len(full_text)
    _finalise(out, full_text)
    return out


def _finalise(out: MaterialExtraction, full_text: str) -> None:
    out.standards = _extract_standards(full_text)
    out.durability_mentioned = bool(_DURABILITY_RE.search(full_text))
    out.weathertight_mentioned = bool(_WEATHERTIGHT_RE.search(full_text))
