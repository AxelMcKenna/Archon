"""Normalize any project document into a comparable ``DocumentClaims`` record.

Both adapters are pure and deterministic — they read the structured extraction
each single-document analyser already persisted (spec: ``spec_documents.analysis
.extraction``; drawing: ``plan_uploads.analysis.text_extraction``) and project
it onto a shared vocabulary of *systems*, *standards*, *disciplines*, and
*schedules* so the two sides can be reconciled by ``coordination.rules``.

No vision, no LLM, no network. A drawing row without a persisted
``text_extraction`` (analysed before that key existed) is handled by the caller,
which re-parses the stored PDF with ``extract_plan_text`` and passes the
``to_prompt_block()`` dict in.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.extractors.entities import _extract_standards

# ── Shared system vocabulary ─────────────────────────────────────────────────
# Specified-system tokens come straight from the spec extractor
# (spec_text._SPECIFIED_SYSTEMS keys); product keywords collapse onto two
# building-envelope system tokens.
_FIRE_FAMILY: frozenset[str] = frozenset(
    {"sprinklers", "fire_alarm", "emergency_lighting", "hydrants", "smoke_control"}
)

# system token -> drawing disciplines that would carry it. Used to decide whether
# a system specified in the spec is represented anywhere in the drawing set.
SYSTEM_DISCIPLINES: dict[str, frozenset[str]] = {
    "sprinklers": frozenset({"fire", "hydraulic", "mechanical"}),
    "fire_alarm": frozenset({"fire", "electrical"}),
    "emergency_lighting": frozenset({"electrical", "fire"}),
    "hydrants": frozenset({"fire", "hydraulic"}),
    "smoke_control": frozenset({"fire", "mechanical"}),
    "cladding_system": frozenset({"architectural"}),
    "membrane": frozenset({"architectural"}),
}

# Spec product-mention keyword -> normalized system token.
_PRODUCT_TO_SYSTEM: dict[str, str] = {
    "cladding system": "cladding_system",
    "cladding": "cladding_system",
    "weatherboard": "cladding_system",
    "rainscreen": "cladding_system",
    "cavity system": "cladding_system",
    "rigid air barrier": "cladding_system",
    "building wrap": "cladding_system",
    "membrane": "membrane",
    "waterproofing": "membrane",
    "tanking": "membrane",
}

# Fire-related compliance standards (family form) that imply fire-rated design.
_FIRE_STANDARDS: frozenset[str] = frozenset({"NZS 4541", "NZS 4512", "NZS 4510"})

# Register-title / schedule keywords that name a system on a drawing.
_DRAWING_SYSTEM_KEYWORDS: dict[str, str] = {
    "sprinkler": "sprinklers",
    "fire alarm": "fire_alarm",
    "detection": "fire_alarm",
    "emergency lighting": "emergency_lighting",
    "hydrant": "hydrants",
    "hose reel": "hydrants",
    "smoke control": "smoke_control",
    "cladding": "cladding_system",
    "elevation": "cladding_system",
    "membrane": "membrane",
    "waterproofing": "membrane",
}


@dataclass
class DocumentClaims:
    source_kind: str  # "drawing" | "spec"
    source_id: str
    filename: str
    systems: set[str] = field(default_factory=set)
    standards: set[str] = field(default_factory=set)
    disciplines: set[str] = field(default_factory=set)
    schedule_kinds: set[str] = field(default_factory=set)
    sheet_codes: set[str] = field(default_factory=set)
    assurance_refs: int = 0
    fire_rated: bool = False
    # token -> {"page": int, "quote": str} so a flag can cite where the claim
    # was found in this document.
    evidence: dict[str, dict[str, Any]] = field(default_factory=dict)

    def citation(self, token: str) -> dict[str, Any]:
        """A citation dict for a claim token (falls back to the document itself)."""
        ev = self.evidence.get(token, {})
        return {
            "source_kind": self.source_kind,
            "source_id": self.source_id,
            "filename": self.filename,
            "page": ev.get("page", 1),
            "quote": ev.get("quote", ""),
        }


def standard_family(std: str) -> str:
    """``"NZS 3604:1999"`` -> ``"NZS 3604"`` (drops the edition year)."""
    return std.split(":", 1)[0].strip().upper()


def standard_year(std: str) -> str | None:
    parts = std.split(":", 1)
    return parts[1].strip() if len(parts) == 2 and parts[1].strip() else None


def claims_from_spec(spec_row: dict[str, Any]) -> DocumentClaims:
    """Build claims from a ``spec_documents`` row (reads ``analysis.extraction``)."""
    analysis = spec_row.get("analysis") or {}
    ex = analysis.get("extraction") or {}
    claims = DocumentClaims(
        source_kind="spec",
        source_id=str(spec_row.get("id")),
        filename=str(spec_row.get("filename") or "specification"),
    )

    for cue in ex.get("specified_systems") or []:
        sysname = cue.get("system")
        if not sysname:
            continue
        claims.systems.add(sysname)
        claims.evidence.setdefault(
            sysname, {"page": cue.get("page", 1), "quote": cue.get("snippet", "")}
        )

    for pm in ex.get("product_mentions") or []:
        token = _PRODUCT_TO_SYSTEM.get(pm.get("keyword", ""))
        if not token:
            continue
        claims.systems.add(token)
        claims.evidence.setdefault(
            token, {"page": pm.get("page", 1), "quote": pm.get("snippet", "")}
        )

    claims.standards = set(ex.get("standards") or [])
    claims.assurance_refs = sum(
        1 for r in (ex.get("assurance_refs") or []) if r.get("numbered")
    )

    families = {standard_family(s) for s in claims.standards}
    claims.fire_rated = bool(claims.systems & _FIRE_FAMILY) or bool(
        families & _FIRE_STANDARDS
    )
    return claims


def claims_from_material(material_row: dict[str, Any]) -> DocumentClaims:
    """Build claims from a material/product datasheet row (doc_kind='material').

    Reads the persisted ``analysis.extraction`` (MaterialExtraction block):
    product/system tokens, numbered assurance count, standards, and scope-of-use
    as evidence the coordination rules / Tier 2 can cite."""
    analysis = material_row.get("analysis") or {}
    ex = analysis.get("extraction") or {}
    claims = DocumentClaims(
        source_kind="material",
        source_id=str(material_row.get("id")),
        filename=str(material_row.get("filename") or "product datasheet"),
    )
    claims.systems = set(ex.get("systems") or [])
    claims.standards = set(ex.get("standards") or [])
    claims.assurance_refs = sum(
        1 for r in (ex.get("assurance_refs") or []) if r.get("numbered")
    )
    product = ex.get("product") or ", ".join(sorted(claims.systems)) or "product"
    for token in claims.systems:
        claims.evidence.setdefault(token, {"page": 1, "quote": product})
    scope = ex.get("scope_of_use") or []
    if scope:
        claims.evidence.setdefault(
            "scope_of_use", {"page": scope[0].get("page", 1), "quote": scope[0].get("snippet", "")}
        )
    families = {standard_family(s) for s in claims.standards}
    claims.fire_rated = bool(families & _FIRE_STANDARDS)
    return claims


def claims_from_drawing(
    drawing_row: dict[str, Any], text_extraction: dict[str, Any]
) -> DocumentClaims:
    """Build claims from a drawing row + its ``plan_text`` ``to_prompt_block()``.

    ``text_extraction`` is the persisted ``plan_uploads.analysis.text_extraction``
    or a fresh ``extract_plan_text(pdf).to_prompt_block()`` for older rows.
    """
    claims = DocumentClaims(
        source_kind="drawing",
        source_id=str(drawing_row.get("id")),
        filename=str(drawing_row.get("filename") or "drawing"),
    )

    title_blocks = text_extraction.get("title_blocks") or []
    register = text_extraction.get("drawing_register") or []
    schedules = text_extraction.get("schedules") or []

    # Disciplines + sheet codes + a representative citation per discipline.
    for tb in title_blocks:
        disc = tb.get("discipline")
        if disc and disc != "unknown":
            claims.disciplines.add(disc)
            claims.evidence.setdefault(
                f"discipline:{disc}",
                {
                    "page": tb.get("page", 1),
                    "quote": tb.get("sheet_number") or tb.get("sheet_label") or "",
                },
            )
        if tb.get("sheet_number"):
            claims.sheet_codes.add(str(tb["sheet_number"]))
    for e in register:
        disc = e.get("discipline")
        if disc and disc != "unknown":
            claims.disciplines.add(disc)
        if e.get("sheet_number"):
            claims.sheet_codes.add(str(e["sheet_number"]))

    # Schedule kinds.
    for s in schedules:
        if s.get("kind"):
            claims.schedule_kinds.add(s["kind"])

    # Systems named in register titles / schedule headers.
    title_text = " ".join(
        str(e.get("title") or "") for e in register
    ) + " " + " ".join(
        str(tb.get("sheet_label") or "") for tb in title_blocks
    )
    schedule_text = " ".join(
        " ".join(s.get("header") or []) for s in schedules
    )
    haystack = (title_text + " " + schedule_text).lower()
    for kw, token in _DRAWING_SYSTEM_KEYWORDS.items():
        if kw in haystack:
            claims.systems.add(token)
            claims.evidence.setdefault(token, {"page": 1, "quote": kw})

    # Standards mentioned in register titles / schedule rows.
    schedule_rows = " ".join(
        " ".join(" ".join(r) for r in (s.get("sample_rows") or [])) for s in schedules
    )
    claims.standards = set(
        _extract_standards(title_text + " " + schedule_text + " " + schedule_rows)
    )

    families = {standard_family(s) for s in claims.standards}
    claims.fire_rated = (
        "fire" in claims.disciplines
        or "fire" in claims.schedule_kinds
        or bool(claims.systems & _FIRE_FAMILY)
        or bool(families & _FIRE_STANDARDS)
    )
    return claims
