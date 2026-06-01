"""Flag → clause mapping for the verifier's MBIE grounding lookup.

These are the pure pieces of ``app.mbie.retriever`` — no Supabase. The
family-key behaviour they pin down is the contract the ``match_mbie_clauses``
RPC relies on (single-letter key → prefix match over sub-clauses); see
supabase/migrations/20260613000002_mbie_match_family.sql.
"""

from __future__ import annotations

import pytest

from app.mbie.retriever import _build_query, code_clause_for_category


class TestCodeClauseForCategory:
    @pytest.mark.parametrize(
        "category,expected",
        [
            # Specific clauses pass through unchanged.
            ("building_code:E2", "E2"),
            ("building_code:E2:cladding", "E2"),
            ("building_code:B1:geotech", "B1"),
            ("building_code:G12", "G12"),
            ("building_code:H1:lighting", "H1"),
            # Umbrella categories resolve to a single-letter family key. The
            # corpus stores sub-clauses (C/AS*, D1, F2/F4, G1/G4/G12/G13) and
            # the RPC prefix-matches these — without the family key they
            # matched nothing.
            ("building_code:C", "C"),
            ("building_code:D", "D"),
            ("building_code:F", "F"),
            ("building_code:G", "G"),
        ],
    )
    def test_maps_building_code_categories(self, category: str, expected: str) -> None:
        assert code_clause_for_category(category) == expected

    @pytest.mark.parametrize(
        "category",
        [
            None,
            "",
            "documentation:plans",
            "building_code",  # no clause segment
            "building_code:",  # empty clause segment
        ],
    )
    def test_returns_none_for_non_clause_categories(self, category) -> None:
        assert code_clause_for_category(category) is None


class TestBuildQuery:
    def test_concatenates_informative_fields_in_weight_order(self) -> None:
        flag = {
            "verbatim_quote": "35mm cavity",
            "area": "north elevation",
            "reason": "cladding clearance",
            "recommended_action": "confirm cavity batten spacing",
        }
        q = _build_query(flag)
        # verbatim_quote leads (highest FTS weight), all fields present.
        assert q.startswith("35mm cavity")
        for fragment in ("north elevation", "cladding clearance", "batten"):
            assert fragment in q

    def test_strips_tsquery_hostile_punctuation(self) -> None:
        q = _build_query({"verbatim_quote": "R-value >= 2.0 (per H1/AS1)!"})
        # Alphanumerics plus - / . survive; parens/!/>= are scrubbed to spaces.
        assert "(" not in q and ")" not in q and "!" not in q and ">" not in q
        assert "H1/AS1" in q

    def test_empty_flag_yields_empty_query(self) -> None:
        assert _build_query({}) == ""
