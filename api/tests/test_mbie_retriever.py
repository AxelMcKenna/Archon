"""Flag → clause mapping for the verifier's MBIE grounding lookup.

These are the pure pieces of ``app.mbie.retriever`` — no Supabase. The
family-key behaviour they pin down is the contract the ``match_mbie_clauses``
RPC relies on (single-letter key → prefix match over sub-clauses); see
supabase/migrations/20260613000002_mbie_match_family.sql.
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest

from app.mbie.retriever import (
    QUERY_VARIANTS,
    ClauseHit,
    _build_query,
    _window_around_query,
    code_clause_for_category,
    format_hits_for_prompt,
    hit_provenance,
)


_QV_FLAG = {
    "verbatim_quote": "DP 4050 SHT A1.02",
    "area": "north wall cladding",
    "reason": "cavity batten spacing not shown",
    "recommended_action": "confirm 35mm drained cavity per E2/AS1",
}


class TestQueryVariants:
    def test_full_includes_quote_and_prose(self) -> None:
        q = _build_query(_QV_FLAG, "full")
        assert "4050" in q and "cavity batten spacing" in q

    def test_prose_drops_the_drawing_quote(self) -> None:
        # The quote is drawing noise (sheet/DP codes) — prose variant must omit
        # it so it can't dilute the clause query.
        q = _build_query(_QV_FLAG, "prose")
        assert "4050" not in q and "cavity batten spacing" in q

    def test_quote_only_is_just_the_quote(self) -> None:
        q = _build_query(_QV_FLAG, "quote_only")
        assert "4050" in q and "cavity batten spacing" not in q

    def test_unknown_variant_falls_back_to_full(self) -> None:
        assert _build_query(_QV_FLAG, "bogus") == _build_query(_QV_FLAG, "full")

    def test_all_variants_declared(self) -> None:
        assert set(QUERY_VARIANTS) == {"full", "prose", "quote_only"}

_REPO = pathlib.Path(__file__).resolve().parents[2]


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


def _hit(text: str, **kw) -> ClauseHit:
    base = dict(
        document_id="E2/AS1",
        clause_number="9.1.1",
        heading="Cavities",
        text=text,
        page=5,
        source_url="https://example/e2as1",
        rank=0.5,
    )
    base.update(kw)
    return ClauseHit(**base)


class TestHitProvenance:
    def test_serialises_persistable_fields(self) -> None:
        prov = hit_provenance([_hit("body")])
        assert prov == [
            {
                "document_id": "E2/AS1",
                "clause_number": "9.1.1",
                "heading": "Cavities",
                "page": 5,
                "source_url": "https://example/e2as1",
            }
        ]
        # No clause body — provenance is a pointer, not a copy of the text.
        assert "text" not in prov[0] and "rank" not in prov[0]

    def test_empty(self) -> None:
        assert hit_provenance([]) == []


class TestWindowing:
    def test_short_body_untouched(self) -> None:
        assert _window_around_query("short", "short", 800) == "short"

    def test_head_trim_when_match_in_head(self) -> None:
        body = "cavity " + "x" * 1000
        out = _window_around_query(body, "cavity", 100)
        assert out.startswith("cavity") and out.endswith("…")
        assert len(out) <= 101

    def test_head_trim_when_no_query(self) -> None:
        body = "z" * 1000
        out = _window_around_query(body, None, 100)
        assert out.endswith("…") and out.startswith("z")

    def test_windows_around_deep_match(self) -> None:
        # The matching passage lives well past the head — head-truncation
        # would drop it. Windowing must keep it (with a leading ellipsis).
        body = ("filler " * 200) + "DRAINEDCAVITY detail here " + ("tail " * 200)
        out = _window_around_query(body, "drainedcavity spacing", 200)
        assert "DRAINEDCAVITY" in out
        assert out.startswith("…")
        assert len(out) <= 200

    def test_format_hits_passes_query_through(self) -> None:
        body = ("a " * 500) + "FLASHING upstand " + ("b " * 500)
        rendered = format_hits_for_prompt(
            [_hit(body)], query="flashing upstand", max_chars=120
        )
        assert "FLASHING" in rendered
        assert "E2/AS1 §9.1.1 — Cavities" in rendered


class TestCategoryCoverageGuard:
    """Every building_code:* category the analyser can emit must resolve to a
    retrievable clause/family key. A new taxonomy category that doesn't would
    silently lose its Acceptable-Solution grounding (retrieval returns empty,
    as_compliant defaults false, the flag is never checked against any AS)."""

    def _building_code_categories(self) -> list[str]:
        taxonomy = json.loads((_REPO / "shared" / "taxonomy.json").read_text())
        cats = set(re.findall(r"building_code:[A-Za-z0-9:_-]+", json.dumps(taxonomy)))
        return sorted(cats)

    def test_taxonomy_has_building_code_categories(self) -> None:
        # Guards against the regex silently matching nothing (which would make
        # the coverage test below vacuously pass).
        assert len(self._building_code_categories()) >= 10

    def test_every_category_resolves_to_a_clause_key(self) -> None:
        unresolved = [
            c for c in self._building_code_categories()
            if not code_clause_for_category(c)
        ]
        assert not unresolved, f"categories with no clause key: {unresolved}"
