"""Stage-A matcher: RFI item → analyser flag, for both flag shapes.

The proactive arm (PDF plan analyser) and the CAD arm emit different field
names for the same concepts. parse_flags must normalise both, or PDF-plan
grounding silently degrades to a verbatim-quote token match with the
diagnostic clause signal dead — see _derived_rule_cited / _derived_rationale.
"""

from __future__ import annotations

from app.grounding.matcher import (
    best_match,
    evidence_payload,
    parse_flags,
    score_match,
)

# Shape the v2 PDF analyser actually emits: category / reason /
# recommended_action — NOT rule_cited / rationale.
_PDF_FLAG = {
    "page": 3,
    "area": "North elevation cladding",
    "category": "building_code:E2:cladding",
    "severity": "must_resolve",
    "confidence": "high",
    "verbatim_quote": "James Hardie Linea weatherboard",
    "reason": "Cavity batten spacing not shown for the drained cavity system.",
    "recommended_action": "Confirm 35mm drained cavity batten spacing.",
}

# An RFI item that cites the same clause and shares cladding/cavity language.
_ITEM_TEXT = "Provide details of the E2 drained cavity and batten spacing for the cladding."


def test_pdf_flag_clause_signal_is_alive():
    [cand] = parse_flags([_PDF_FLAG])
    # category-derived clause feeds the (60%-weighted) clause overlap.
    assert cand.rule_cited == "E2"
    m = score_match(_ITEM_TEXT, ["E2"], cand)
    assert m.clause_overlap > 0, "clause signal must not be dead for PDF flags"
    assert "E2" in m.matched_clauses


def test_pdf_flag_matches_above_threshold():
    flags = parse_flags([_PDF_FLAG])
    match = best_match(_ITEM_TEXT, ["E2"], flags)
    assert match is not None, "a real PDF-plan flag must ground its RFI item"
    assert match.flag_index == 0


def test_pdf_flag_rationale_reaches_evidence_payload():
    [cand] = parse_flags([_PDF_FLAG])
    match = best_match(_ITEM_TEXT, ["E2"], [cand])
    assert match is not None
    ev = evidence_payload(cand, match)
    # The drafter reads these directly; they must not be the "(unknown clause)"
    # / "(no rationale recorded)" placeholders.
    assert ev["rule_cited"] == "E2"
    assert "cavity" in (ev["rationale"] or "").lower()


def test_cad_flag_explicit_fields_are_preferred():
    # CAD/DXF flags carry rule_cited + rationale; the derivation must defer to
    # them rather than overwrite with a category-derived clause.
    cad_flag = {
        "rule_cited": "NZBC F7/AS1",
        "rationale": "Smoke alarm missing from hallway.",
        "verbatim_quote": "hallway",
        "category": "building_code:E2",  # present but must NOT win
        "target_handles": ["2F"],
        "severity": "must_resolve",
    }
    [cand] = parse_flags([cad_flag])
    assert cand.rule_cited == "NZBC F7/AS1"
    assert cand.rationale == "Smoke alarm missing from hallway."


def test_documentation_flag_has_no_clause():
    # A non-building-code flag yields no clause but still gets prose rationale.
    doc_flag = {
        "category": "documentation:missing_sheets",
        "reason": "Drawing register lists sheet A1.05 but it is absent.",
        "recommended_action": "Reissue the set including A1.05.",
        "verbatim_quote": "A1.05 Site Plan",
    }
    [cand] = parse_flags([doc_flag])
    assert cand.rule_cited is None
    assert "register" in (cand.rationale or "").lower()
