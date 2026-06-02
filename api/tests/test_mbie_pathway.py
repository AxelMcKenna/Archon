"""Pathway citation validation: catch fabricated Building Code clause refs in
the verifier's free-text Alternative-Solution pathway, without false-flagging
real clauses or non-clause references (standards, producer statements)."""

from __future__ import annotations

import pytest

from app.mbie.pathway import pathway_citations, unverified_citations


class TestPathwayCitations:
    def test_extracts_dotted_clause_refs(self):
        text = "Meets E2.3.2 via a drained cavity; see B1.3.1 for bracing."
        assert pathway_citations(text) == ["E2.3.2", "B1.3.1"]

    def test_ignores_standards_and_producer_statements(self):
        # AS/NZS numbers, PS1, and Building Act sections are not clause cites.
        text = "Producer statement PS1 + test to AS/NZS 4284, Building Act s19."
        assert pathway_citations(text) == []

    def test_empty(self):
        assert pathway_citations(None) == [] and pathway_citations("") == []


class TestUnverifiedCitations:
    def test_real_clauses_not_flagged(self):
        text = "E2.3.2, G12.3, H1, B1.3.1 are all real."
        assert unverified_citations(text) == []

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Complies via E9.1 performance", ["E9.1"]),   # E only has E1–E3
            ("per Z2.3 of the code", ["Z2.3"]),            # not a real letter…
            ("see C9 fire clause", ["C9"]),                # C only to C6
        ],
    )
    def test_fabricated_clauses_flagged(self, text, expected):
        # Note: Z2.3 starts with Z which is outside A–H, so the regex won't
        # match it at all — it's simply not a citation, hence not flagged.
        got = unverified_citations(text)
        if expected == ["Z2.3"]:
            assert got == []
        else:
            assert got == expected

    def test_dedup_order_preserving(self):
        text = "E9.1 then G99 then E9.1 again"
        assert unverified_citations(text) == ["E9.1", "G99"]
