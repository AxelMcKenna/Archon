"""PDF text-layer extraction for written specifications and product documents.

The plan analyser reads *drawings*; this reads the *spec* — the prose side of a
consent set (architectural/engineering specifications, masterspec trade sections,
product/material data sheets, BRANZ appraisals, CodeMark certificates). Spec PDFs
are text-heavy, so a deterministic pdfplumber text pass is enough; no vision call.

What we pull is exactly what the deterministic spec rules (``spec_rules``) and the
RFI classifier care about:

  - product-assurance references (BRANZ Appraisal / CodeMark, with or without a
    certificate number — a bare "BRANZ appraised" with no number is itself an RFI),
  - mentions of product categories that the BCA expects to be assured
    (cladding/membrane/proprietary systems),
  - hedge / placeholder language ("or similar approved", "TBC", "by others"),
  - specified-system cues (sprinklers, alarms, emergency lighting) and the NZS
    standard they should cite,
  - Building Code clauses and AS/NZS standards (reusing ``entities``).
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

import pdfplumber

from app.extractors.entities import _extract_clauses, _extract_standards

# ── Product assurance ────────────────────────────────────────────────────────
# A numbered reference is the "good" shape: an appraisal/certificate number the
# BCA can look up. Cover the common spellings (BRANZ Appraisal No. 1234,
# CodeMark CM40123, CodeMark Certificate 40123).
_ASSURANCE_NUMBERED_RE = re.compile(
    r"""(?ix)
    \b(?:
        branz \s+ appraisal (?:\s+ no\.?)? \s* \#? \s* \d{2,5}
      | codemark \s+ (?:cert(?:ificate)?\s+)? (?:no\.?|\#)? \s* (?:cm\s*)? \d{4,6}
      | \b cm \s? \d{5} \b
    )
    """
)
# A bare assurance *word* with no number on the same line is an incomplete
# reference — the single most common product-assurance RFI.
_ASSURANCE_WORD_RE = re.compile(r"(?i)\b(branz\s+appraisal|codemark)\b")

# Product categories the BCA routinely expects product assurance for. A line
# naming one of these without any assurance reference anywhere in the document
# is an RFI surface.
_ASSURANCE_REQUIRED_KEYWORDS: tuple[str, ...] = (
    "cladding system",
    "cladding",
    "weatherboard",
    "rainscreen",
    "cavity system",
    "rigid air barrier",
    "building wrap",
    "membrane",
    "waterproofing",
    "tanking",
    "proprietary system",
    "proprietary",
    "passive fire",
    "fire-rated system",
    "fire rated system",
    "joint sealant system",
)

# ── Hedge / placeholder language ─────────────────────────────────────────────
# Phrases that defer a decision the consent set is supposed to resolve. Each is
# a documented RFI driver: the BCA can't assess "or similar approved".
_HEDGE_PHRASES: tuple[str, ...] = (
    "or similar approved",
    "or similar",
    "or approved equivalent",
    "or equal approved",
    "to be confirmed",
    "to be advised",
    "by others",
    "refer engineer",
    "refer to engineer",
    "design by others",
    "tbc",
    "tba",
)
_HEDGE_RE = re.compile(
    r"(?i)\b(" + "|".join(re.escape(p) for p in _HEDGE_PHRASES) + r")\b"
)

# ── Specified systems → expected standard ────────────────────────────────────
# A "specified system" named in the spec should cite its compliance standard /
# compliance schedule. system key -> (line-match regex, expected standard token).
_SPECIFIED_SYSTEMS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("sprinklers", re.compile(r"(?i)\bsprinkler"), "NZS 4541"),
    (
        "fire_alarm",
        re.compile(r"(?i)\b(?:fire\s+alarm|detection\s+and\s+alarm|smoke\s+detection)"),
        "NZS 4512",
    ),
    ("emergency_lighting", re.compile(r"(?i)\bemergency\s+lighting"), "F6"),
    ("hydrants", re.compile(r"(?i)\b(?:hydrant|hose\s+reel)"), "NZS 4510"),
    ("smoke_control", re.compile(r"(?i)\bsmoke\s+(?:control|management)"), "AS/NZS 1668"),
)

# ── Superseded standards (small, curated, year-anchored) ─────────────────────
# Conservative map of well-known NZ standard supersessions. Keyed on the
# normalised "STANDARD:YEAR" string the entities extractor emits.
_SUPERSEDED_STANDARDS: dict[str, str] = {
    "NZS 3604:1999": "NZS 3604:2011",
    "NZS 3604:1990": "NZS 3604:2011",
    "NZS 4229:1999": "NZS 4229:2013",
    "NZS 4230:2004": "NZS 4230:2004 (confirm current amendment)",
    "AS/NZS 1170:1992": "AS/NZS 1170 (2002 series)",
}

# Masterspec-style section codes: a 3-4 digit code followed by an uppercase
# heading (e.g. "4511 ALUMINIUM WINDOWS").
_SECTION_RE = re.compile(r"^\s*(\d{3,4})\s+([A-Z][A-Z0-9 /&,\-]{4,60})\s*$")

_MAX_PRODUCT_MENTIONS = 60
_MAX_HEDGES = 60
_SNIPPET = 200


@dataclass
class SpecSection:
    page: int
    code: str | None
    heading: str


@dataclass
class ProductMention:
    page: int
    keyword: str
    snippet: str
    has_assurance_on_line: bool


@dataclass
class AssuranceRef:
    page: int
    text: str
    numbered: bool


@dataclass
class HedgePhrase:
    page: int
    phrase: str
    snippet: str


@dataclass
class SpecifiedSystemCue:
    page: int
    system: str
    expected_standard: str
    snippet: str


@dataclass
class SpecExtraction:
    page_count: int = 0
    text_chars: int = 0
    sections: list[SpecSection] = field(default_factory=list)
    product_mentions: list[ProductMention] = field(default_factory=list)
    assurance_refs: list[AssuranceRef] = field(default_factory=list)
    hedge_phrases: list[HedgePhrase] = field(default_factory=list)
    specified_systems: list[SpecifiedSystemCue] = field(default_factory=list)
    standards: list[str] = field(default_factory=list)
    clauses: list[str] = field(default_factory=list)

    @property
    def has_any_assurance_ref(self) -> bool:
        return any(r.numbered for r in self.assurance_refs)

    @property
    def looks_scanned(self) -> bool:
        """A text layer of almost nothing across many pages means the spec is a
        scan; the deterministic pass can't see it and callers should fall back
        to vision (out of scope here) rather than trust an empty extraction."""
        return self.page_count > 0 and self.text_chars < 40 * self.page_count

    def to_prompt_block(self) -> dict[str, Any]:
        return {
            "page_count": self.page_count,
            "sections": [
                {"page": s.page, "code": s.code, "heading": s.heading}
                for s in self.sections
            ],
            "product_mentions": [
                {
                    "page": p.page,
                    "keyword": p.keyword,
                    "snippet": p.snippet,
                    "has_assurance_on_line": p.has_assurance_on_line,
                }
                for p in self.product_mentions
            ],
            "assurance_refs": [
                {"page": r.page, "text": r.text, "numbered": r.numbered}
                for r in self.assurance_refs
            ],
            "hedge_phrases": [
                {"page": h.page, "phrase": h.phrase, "snippet": h.snippet}
                for h in self.hedge_phrases
            ],
            "specified_systems": [
                {
                    "page": c.page,
                    "system": c.system,
                    "expected_standard": c.expected_standard,
                    "snippet": c.snippet,
                }
                for c in self.specified_systems
            ],
            "standards": self.standards,
            "clauses": self.clauses,
        }


def _line_snippet(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()[:_SNIPPET]


def _scan_line(out: SpecExtraction, page_no: int, line: str) -> None:
    """Apply every per-line extractor to one line of spec text."""
    snippet = _line_snippet(line)
    if not snippet:
        return

    # Section heading.
    sec = _SECTION_RE.match(line)
    if sec:
        out.sections.append(
            SpecSection(page=page_no, code=sec.group(1), heading=sec.group(2).strip())
        )

    # Assurance references (numbered vs bare word).
    numbered = list(_ASSURANCE_NUMBERED_RE.finditer(line))
    for m in numbered:
        out.assurance_refs.append(
            AssuranceRef(page=page_no, text=_line_snippet(m.group(0)), numbered=True)
        )
    line_has_assurance = bool(numbered)
    if not numbered and _ASSURANCE_WORD_RE.search(line):
        # A bare appraisal/codemark word with no number on the line is an
        # incomplete reference — record it as a non-numbered ref.
        out.assurance_refs.append(
            AssuranceRef(page=page_no, text=snippet, numbered=False)
        )

    # Assurance-requiring product mentions.
    if len(out.product_mentions) < _MAX_PRODUCT_MENTIONS:
        low = line.lower()
        for kw in _ASSURANCE_REQUIRED_KEYWORDS:
            if kw in low:
                out.product_mentions.append(
                    ProductMention(
                        page=page_no,
                        keyword=kw,
                        snippet=snippet,
                        has_assurance_on_line=line_has_assurance,
                    )
                )
                break  # one mention per line, most-specific keyword first

    # Hedge / placeholder language.
    if len(out.hedge_phrases) < _MAX_HEDGES:
        for m in _HEDGE_RE.finditer(line):
            out.hedge_phrases.append(
                HedgePhrase(page=page_no, phrase=m.group(1).lower(), snippet=snippet)
            )
            break

    # Specified-system cues.
    for system, pattern, standard in _SPECIFIED_SYSTEMS:
        if pattern.search(line) and not any(
            c.system == system for c in out.specified_systems
        ):
            out.specified_systems.append(
                SpecifiedSystemCue(
                    page=page_no,
                    system=system,
                    expected_standard=standard,
                    snippet=snippet,
                )
            )


def extract_spec_from_text(full_text: str, *, page_count: int = 1) -> SpecExtraction:
    """Run the spec extraction over already-extracted text (one string).

    Kept separate from the PDF reader so it's trivially unit-testable without a
    PDF fixture. ``page_count`` is informational (drives the scanned-doc guard);
    pages aren't tracked when text is passed pre-joined, so everything lands on
    page 1.
    """
    out = SpecExtraction(page_count=page_count, text_chars=len(full_text or ""))
    for line in (full_text or "").splitlines():
        _scan_line(out, 1, line)
    _finalise(out, full_text or "")
    return out


def extract_spec_text(pdf_bytes: bytes) -> SpecExtraction:
    """Read a specification/product PDF's text layer into a SpecExtraction."""
    out = SpecExtraction()
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        out.page_count = len(pdf.pages)
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text_parts.append(text)
            for line in text.splitlines():
                _scan_line(out, idx, line)
    full_text = "\n".join(text_parts)
    out.text_chars = len(full_text)
    _finalise(out, full_text)
    return out


def _finalise(out: SpecExtraction, full_text: str) -> None:
    """Document-wide extractions that need the whole text (standards, clauses)."""
    out.standards = _extract_standards(full_text)
    out.clauses = _extract_clauses(full_text)
