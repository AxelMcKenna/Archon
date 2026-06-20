"""Phase 6 — commercial drawing analysis: discipline classification,
schedule extraction, the fire-door coordination rule, and cross-discipline
coordination set building. All deterministic (no LLM)."""

from __future__ import annotations

import pytest

from app.extractors.doc_rules import flag_fire_door_schedule_gap
from app.extractors.plan_text import (
    SHEET_CODE_RE,
    PlanTextExtraction,
    Schedule,
    TitleBlock,
    _classify_schedule,
    discipline_for_sheet,
    discipline_for_sheet_code,
)
from app.plans.registration import build_coordination_sets
from app.plans.views import ViewRecord


class TestSheetCodeRegex:
    @pytest.mark.parametrize("code", ["A1.01", "S2.04", "A-101", "F-101", "M-101", "E1.10"])
    def test_matches_both_conventions(self, code: str) -> None:
        assert SHEET_CODE_RE.search(code)

    @pytest.mark.parametrize("clause", ["B1", "C3", "B-1", "H1"])
    def test_does_not_match_bare_building_code_clauses(self, clause: str) -> None:
        assert SHEET_CODE_RE.fullmatch(clause) is None


class TestDisciplineClassification:
    @pytest.mark.parametrize(
        "code,expected",
        [
            ("A1.01", "architectural"),
            ("S2.04", "structural"),
            ("E1.10", "electrical"),
            ("M3.02", "mechanical"),
            ("P1.01", "plumbing"),
            ("H2.01", "hydraulic"),
            ("C1.01", "civil"),
            ("F-101", "fire"),
            ("G1.01", "geotech"),
        ],
    )
    def test_code_prefix(self, code: str, expected: str) -> None:
        assert discipline_for_sheet_code(code) == expected

    def test_unknown_prefix_is_none(self) -> None:
        assert discipline_for_sheet_code("Z9.9") is None
        assert discipline_for_sheet_code(None) is None

    def test_title_fallback_when_code_ambiguous(self) -> None:
        assert discipline_for_sheet("Z9.9", "Fire Report") == "fire"
        assert discipline_for_sheet("Z9.9", "Structural General Arrangement") == "structural"
        assert discipline_for_sheet("Z9.9", "Mechanical Services") == "mechanical"

    def test_code_wins_over_title(self) -> None:
        # An S-coded sheet titled "fire" still reads as structural (code first).
        assert discipline_for_sheet("S2.01", "Fire egress notes") == "structural"

    def test_unknown_when_nothing_matches(self) -> None:
        assert discipline_for_sheet(None, None) == "unknown"
        assert discipline_for_sheet("Z9.9", "Cover Sheet") == "unknown"


class TestScheduleClassification:
    @pytest.mark.parametrize(
        "header,kind",
        [
            ("Door No  Type  Width", "door"),
            ("Window  Glazing  Size", "window"),
            ("Element  FRR  Construction", "fire"),
            ("Fixture  Qty  Location", "fixture"),
            ("Room  Finish  Notes", "finishes"),
            ("Mark  Type  Ref", "generic"),
        ],
    )
    def test_classifies_schedule_headers(self, header: str, kind: str) -> None:
        assert _classify_schedule(header) == kind

    def test_rejects_non_schedule(self) -> None:
        assert _classify_schedule("Project North  Scale  Date") is None


def _door_schedule(header: list[str]) -> Schedule:
    return Schedule(page=12, kind="door", header=header, row_count=8, sample_rows=[])


class TestFireDoorScheduleGap:
    def _fire_sheet(self) -> TitleBlock:
        return TitleBlock(
            page=7, sheet_number="F-101", revision="A", raw_text="", discipline="fire"
        )

    def test_flags_when_door_schedule_has_no_frr(self) -> None:
        ex = PlanTextExtraction(
            title_blocks=[self._fire_sheet()],
            schedules=[_door_schedule(["Door No", "Type", "Width"])],
        )
        flags = flag_fire_door_schedule_gap(ex)
        assert len(flags) == 1
        assert flags[0]["category"] == "documentation:plans:design_coordination"

    def test_no_flag_when_frr_column_present(self) -> None:
        ex = PlanTextExtraction(
            title_blocks=[self._fire_sheet()],
            schedules=[_door_schedule(["Door No", "FRR", "Width"])],
        )
        assert flag_fire_door_schedule_gap(ex) == []

    def test_no_flag_without_fire_sheet(self) -> None:
        ex = PlanTextExtraction(schedules=[_door_schedule(["Door No", "Type"])])
        assert flag_fire_door_schedule_gap(ex) == []

    def test_no_flag_without_door_schedule(self) -> None:
        ex = PlanTextExtraction(title_blocks=[self._fire_sheet()])
        assert flag_fire_door_schedule_gap(ex) == []


class TestCoordinationSets:
    def test_same_level_different_disciplines_forms_one_set(self) -> None:
        views = [
            ViewRecord(page=3, discipline="architectural", level_id="Ground Floor"),
            ViewRecord(page=8, discipline="fire", level_id="Ground Floor"),
            ViewRecord(page=15, discipline="mechanical", level_id="Ground Floor"),
        ]
        sets = build_coordination_sets(views)
        assert len(sets) == 1
        assert sets[0].kind == "coordination"
        assert sets[0].pages == [3, 8, 15]
        assert sets[0].link_types == ["coordination"]

    def test_same_discipline_is_not_a_coordination_set(self) -> None:
        views = [
            ViewRecord(page=3, discipline="architectural", level_id="L1"),
            ViewRecord(page=4, discipline="architectural", level_id="L1"),
        ]
        assert build_coordination_sets(views) == []

    def test_different_levels_dont_link(self) -> None:
        views = [
            ViewRecord(page=3, discipline="architectural", level_id="L1"),
            ViewRecord(page=4, discipline="fire", level_id="L2"),
        ]
        assert build_coordination_sets(views) == []

    def test_unknown_discipline_doesnt_count_toward_distinct(self) -> None:
        views = [
            ViewRecord(page=3, discipline="architectural", level_id="L1"),
            ViewRecord(page=4, discipline="unknown", level_id="L1"),
        ]
        assert build_coordination_sets(views) == []

    def test_set_size_cap_respected(self) -> None:
        views = [
            ViewRecord(page=p, discipline=d, level_id="L1")
            for p, d in enumerate(
                ["architectural", "structural", "fire", "mechanical", "electrical", "hydraulic"],
                start=1,
            )
        ]
        sets = build_coordination_sets(views, max_set_size=3)
        assert len(sets) == 1
        assert len(sets[0].pages) == 3
