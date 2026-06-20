"""Coordination claims adapters — spec + drawing normalization (deterministic)."""

from __future__ import annotations

from app.coordination.claims import (
    claims_from_drawing,
    claims_from_spec,
    standard_family,
    standard_year,
)
from app.extractors.spec_text import extract_spec_from_text


def _spec_row(text: str, *, id_: str = "s1", filename: str = "spec.pdf") -> dict:
    block = extract_spec_from_text(text).to_prompt_block()
    return {"id": id_, "filename": filename, "analysis": {"extraction": block}}


def _tb(sheet: str, discipline: str, label: str | None, *, page: int = 1) -> dict:
    return {
        "page": page,
        "sheet_number": sheet,
        "discipline": discipline,
        "sheet_label": label,
    }


class TestStandardHelpers:
    def test_family_and_year(self) -> None:
        assert standard_family("NZS 3604:1999") == "NZS 3604"
        assert standard_year("NZS 3604:1999") == "1999"
        assert standard_year("NZS 4541") is None


class TestClaimsFromSpec:
    def test_specified_system_becomes_claim(self) -> None:
        c = claims_from_spec(_spec_row("A fire sprinkler system is provided."))
        assert "sprinklers" in c.systems
        assert c.fire_rated is True
        assert c.source_kind == "spec"

    def test_product_keyword_maps_to_system(self) -> None:
        c = claims_from_spec(
            _spec_row("External cladding system: proprietary rainscreen.")
        )
        assert "cladding_system" in c.systems

    def test_numbered_assurance_counted(self) -> None:
        c = claims_from_spec(
            _spec_row("Cladding with BRANZ Appraisal No. 1234 throughout.")
        )
        assert c.assurance_refs == 1

    def test_non_fire_spec_not_fire_rated(self) -> None:
        c = claims_from_spec(_spec_row("Paint internal walls two coats."))
        assert c.fire_rated is False
        assert c.systems == set()


class TestClaimsFromDrawing:
    def _row(self) -> dict:
        return {"id": "d1", "filename": "plans.pdf"}

    def test_disciplines_and_sheets(self) -> None:
        te = {
            "title_blocks": [
                _tb("A1.01", "architectural", "Floor Plan", page=1),
                _tb("S2.01", "structural", "Foundations", page=2),
            ],
            "drawing_register": [],
            "schedules": [],
        }
        c = claims_from_drawing(self._row(), te)
        assert c.disciplines == {"architectural", "structural"}
        assert {"A1.01", "S2.01"} <= c.sheet_codes
        assert c.fire_rated is False

    def test_fire_discipline_sets_fire_rated(self) -> None:
        te = {
            "title_blocks": [_tb("F-101", "fire", "Fire Plan")],
            "drawing_register": [],
            "schedules": [],
        }
        c = claims_from_drawing(self._row(), te)
        assert c.fire_rated is True
        assert "fire" in c.disciplines

    def test_register_title_names_system_and_standard(self) -> None:
        te = {
            "title_blocks": [_tb("A1.01", "architectural", None)],
            "drawing_register": [
                {
                    "sheet_number": "FP01",
                    "title": "Sprinkler Layout to NZS 4541:2020",
                    "discipline": "fire",
                }
            ],
            "schedules": [],
        }
        c = claims_from_drawing(self._row(), te)
        assert "sprinklers" in c.systems
        assert "NZS 4541:2020" in c.standards

    def test_fire_schedule_kind_sets_fire_rated(self) -> None:
        te = {
            "title_blocks": [],
            "drawing_register": [],
            "schedules": [
                {
                    "page": 3,
                    "kind": "fire",
                    "header": ["Element", "FRR"],
                    "row_count": 4,
                    "sample_rows": [],
                }
            ],
        }
        c = claims_from_drawing(self._row(), te)
        assert "fire" in c.schedule_kinds
        assert c.fire_rated is True
