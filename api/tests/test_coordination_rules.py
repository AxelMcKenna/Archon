"""Deterministic cross-document coordination rules — positive + negative cases."""

from __future__ import annotations

from app.coordination.claims import DocumentClaims
from app.coordination.rules import (
    flag_drawn_fire_rating_spec_silent,
    flag_proprietary_system_no_drawing,
    flag_standard_edition_mismatch,
    flag_system_specified_not_drawn,
    run_coordination_rules,
)


def _spec(**kw) -> DocumentClaims:
    return DocumentClaims(source_kind="spec", source_id="s1", filename="spec.pdf", **kw)


def _drawing(**kw) -> DocumentClaims:
    return DocumentClaims(source_kind="drawing", source_id="d1", filename="plans.pdf", **kw)


class TestSystemSpecifiedNotDrawn:
    def test_flags_when_discipline_absent(self) -> None:
        claims = [
            _spec(systems={"sprinklers"}),
            _drawing(disciplines={"architectural", "structural"}),
        ]
        flags = flag_system_specified_not_drawn(claims)
        assert len(flags) == 1
        assert flags[0]["_rule"] == "system_specified_not_drawn"
        assert len(flags[0]["citations"]) == 2

    def test_no_flag_when_discipline_present(self) -> None:
        claims = [_spec(systems={"sprinklers"}), _drawing(disciplines={"fire"})]
        assert flag_system_specified_not_drawn(claims) == []

    def test_no_flag_when_drawings_unclassified(self) -> None:
        # No disciplines at all -> can't assert absence -> stay quiet.
        claims = [_spec(systems={"sprinklers"}), _drawing()]
        assert flag_system_specified_not_drawn(claims) == []

    def test_no_flag_when_system_named_on_drawing(self) -> None:
        claims = [
            _spec(systems={"sprinklers"}),
            _drawing(disciplines={"architectural"}, systems={"sprinklers"}),
        ]
        assert flag_system_specified_not_drawn(claims) == []


class TestDrawnFireRatingSpecSilent:
    def test_flags_when_drawings_fire_spec_silent(self) -> None:
        claims = [
            _spec(fire_rated=False),
            _drawing(disciplines={"fire"}, fire_rated=True),
        ]
        flags = flag_drawn_fire_rating_spec_silent(claims)
        assert len(flags) == 1
        assert flags[0]["_rule"] == "drawn_fire_rating_spec_silent"

    def test_no_flag_when_spec_addresses_fire(self) -> None:
        claims = [_spec(fire_rated=True), _drawing(fire_rated=True)]
        assert flag_drawn_fire_rating_spec_silent(claims) == []

    def test_no_flag_when_drawings_not_fire(self) -> None:
        claims = [_spec(fire_rated=False), _drawing(fire_rated=False)]
        assert flag_drawn_fire_rating_spec_silent(claims) == []


class TestStandardEditionMismatch:
    def test_flags_on_year_mismatch(self) -> None:
        claims = [
            _spec(standards={"NZS 3604:1999"}),
            _drawing(standards={"NZS 3604:2011"}),
        ]
        flags = flag_standard_edition_mismatch(claims)
        assert len(flags) == 1
        assert len(flags[0]["citations"]) == 2

    def test_no_flag_on_matching_edition(self) -> None:
        claims = [
            _spec(standards={"NZS 3604:2011"}),
            _drawing(standards={"NZS 3604:2011"}),
        ]
        assert flag_standard_edition_mismatch(claims) == []

    def test_no_flag_without_years(self) -> None:
        claims = [_spec(standards={"NZS 4541"}), _drawing(standards={"NZS 4541"})]
        assert flag_standard_edition_mismatch(claims) == []


class TestProprietarySystemNoDrawing:
    def test_flags_when_cladding_absent_on_arch_set(self) -> None:
        claims = [
            _spec(systems={"cladding_system"}),
            _drawing(disciplines={"architectural"}),
        ]
        flags = flag_proprietary_system_no_drawing(claims)
        assert len(flags) == 1
        assert flags[0]["_rule"] == "proprietary_system_no_drawing"

    def test_no_flag_when_cladding_on_drawing(self) -> None:
        claims = [
            _spec(systems={"cladding_system"}),
            _drawing(disciplines={"architectural"}, systems={"cladding_system"}),
        ]
        assert flag_proprietary_system_no_drawing(claims) == []

    def test_no_flag_without_architectural_set(self) -> None:
        claims = [
            _spec(systems={"cladding_system"}),
            _drawing(disciplines={"structural"}),
        ]
        assert flag_proprietary_system_no_drawing(claims) == []


class TestRunAll:
    def test_combined(self) -> None:
        claims = [
            _spec(
                systems={"sprinklers", "cladding_system"},
                standards={"NZS 3604:1999"},
                fire_rated=True,
            ),
            _drawing(
                disciplines={"architectural", "structural"},
                standards={"NZS 3604:2011"},
            ),
        ]
        rules = {f["_rule"] for f in run_coordination_rules(claims)}
        assert "system_specified_not_drawn" in rules
        assert "proprietary_system_no_drawing" in rules
        assert "standard_edition_mismatch" in rules

    def test_single_document_no_flags(self) -> None:
        assert run_coordination_rules([_spec(systems={"sprinklers"})]) == []
