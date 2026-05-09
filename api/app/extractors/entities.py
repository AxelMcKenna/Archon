"""Deterministic entity extraction (FR-1.5).

Runs after either the pdfplumber or claude-vision extractor, populating the
`extracted` block on every RFI item. Independent of AI extractor variability —
guarantees clean structured input for the rules engine.

Patterns derived from Appendix C field notes.
"""

from __future__ import annotations

import re

from app.models import Dimension, ExtractedEntities

# ── Compiled patterns ────────────────────────────────────────────────────────

# Building Code clause references. Disambiguation: only treat as a clause when
# the surrounding context looks like a code reference (preceded by "clause",
# "Building Code", "/AS", "/VM", or appearing standalone in parentheses or at
# start of a phrase). The naive token \bB1\b would match e.g. a room label.
_CLAUSE_PATTERN = re.compile(
    r"""
    (?:
        (?:clause|building\s+code|under|per|requirement|comply\s+with)\s+
    )?
    \b(B[12]|C[1-6]?|D[12]?|E[123]|F[1-9]|G(?:1[0-9]|[1-9])|H1)\b
    (?:\s*/\s*(?:AS|VM)\s*\d?)?
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Strict variant: clauses that are unambiguous (followed by /AS or /VM, or
# preceded by an explicit "clause" / "Building Code" cue).
_CLAUSE_STRICT = re.compile(
    r"""
    (?:
        (?<=clause\s)(B[12]|C[1-6]?|D[12]?|E[123]|F[1-9]|G(?:1[0-9]|[1-9])|H1)
        | (?<=building\scode\s)(B[12]|C[1-6]?|D[12]?|E[123]|F[1-9]|G(?:1[0-9]|[1-9])|H1)
        | \b(B[12]|C[1-6]?|D[12]?|E[123]|F[1-9]|G(?:1[0-9]|[1-9])|H1)\s*/\s*(?:AS|VM)\d?
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Fallback: bare clause tokens. Allowed when the item text looks consent-y
# (contains other code-y keywords). Otherwise we'd over-match (e.g. "B1" as
# room id).
_BARE_CLAUSE = re.compile(
    r"\b(B[12]|C[1-6]?|D[12]?|E[123]|F[1-9]|G(?:1[0-9]|[1-9])|H1)\b"
)
_CONSENT_CONTEXT = re.compile(
    r"(?i)\b(building\s+code|acceptable\s+solution|clause|consent|compliance|MBIE)\b"
)

_DOC_REF_PATTERN = re.compile(
    r"""
    \b(PS[1-4]|CPD|LBP|RBW)\b
    | \bproducer\s+statement\s+(\d)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_PROF_PATTERN = re.compile(
    r"\b(CPEng|RPEQ|CMEngNZ|architect|draughtsperson|drainlayer|surveyor|engineer)\b",
    re.IGNORECASE,
)

_STANDARDS_PATTERN = re.compile(
    r"""
    \b(?:AS/?NZS|NZS|AS)\s*\d{3,5}(?:[.:-]\d+)?(?::\d{4})?\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Dimensions: number + unit, capture preceding ~6 words as context.
_DIMENSION_PATTERN = re.compile(
    r"""
    (?P<context>(?:\b\w+\b[\s,]*){0,6}?)
    (?P<value>\d+(?:\.\d+)?)\s*
    (?P<unit>mm|cm|m|km|kPa|MPa|kN|kg|m2|m\^2|m²|sqm|degrees?|deg|°)
    \b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _normalise_clause(c: str) -> str:
    return c.upper()


def _normalise_doc_ref(d: str) -> str:
    d = d.upper()
    return d


def _extract_clauses(text: str) -> list[str]:
    found: set[str] = set()
    for m in _CLAUSE_STRICT.finditer(text):
        for g in m.groups():
            if g:
                found.add(_normalise_clause(g))
    if _CONSENT_CONTEXT.search(text):
        for m in _BARE_CLAUSE.finditer(text):
            found.add(_normalise_clause(m.group(1)))
    return sorted(found)


def _extract_doc_refs(text: str) -> list[str]:
    found: set[str] = set()
    for m in _DOC_REF_PATTERN.finditer(text):
        if m.group(1):
            found.add(_normalise_doc_ref(m.group(1)))
        elif m.group(2):
            found.add(f"PS{m.group(2)}")
    return sorted(found)


def _extract_profs(text: str) -> list[str]:
    return sorted({m.group(1) for m in _PROF_PATTERN.finditer(text)})


def _extract_standards(text: str) -> list[str]:
    return sorted(
        {re.sub(r"\s+", " ", m.group(0)).strip().upper() for m in _STANDARDS_PATTERN.finditer(text)}
    )


def _extract_dimensions(text: str) -> list[Dimension]:
    out: list[Dimension] = []
    for m in _DIMENSION_PATTERN.finditer(text):
        try:
            v = float(m.group("value"))
        except ValueError:
            continue
        unit = m.group("unit").lower()
        # Skip silly matches (e.g. "1mm" with no surrounding context — keep all
        # for now; rules engine can filter).
        ctx = (m.group("context") or "").strip().rstrip(",") or None
        out.append(Dimension(value=v, unit=unit, context=ctx))
    return out


def extract_entities(raw_text: str) -> ExtractedEntities:
    """Populate the canonical `extracted` block from raw item text."""
    return ExtractedEntities(
        clause_references=_extract_clauses(raw_text),
        document_references=_extract_doc_refs(raw_text),
        professional_references=_extract_profs(raw_text),
        standards_references=_extract_standards(raw_text),
        dimensions=_extract_dimensions(raw_text),
    )
