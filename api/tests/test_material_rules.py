"""Deterministic material/product datasheet rules."""

from __future__ import annotations

from app.extractors.material_rules import (
    flag_missing_appraisal_number,
    flag_scope_limitation_noted,
    flag_superseded_standards,
    run_material_rules,
)
from app.extractors.material_text import extract_material_from_text


class TestMissingAppraisalNumber:
    def test_bare_flags(self) -> None:
        ex = extract_material_from_text("Carries a BRANZ Appraisal.")
        flags = flag_missing_appraisal_number(ex)
        assert len(flags) == 1
        assert flags[0]["category"] == "documentation:product_assurance"

    def test_numbered_no_flag(self) -> None:
        ex = extract_material_from_text("BRANZ Appraisal No. 1234.")
        assert flag_missing_appraisal_number(ex) == []


class TestScopeLimitation:
    def test_scope_flags(self) -> None:
        ex = extract_material_from_text("Scope of use: max wind zone high, height 7m.")
        flags = flag_scope_limitation_noted(ex)
        assert len(flags) == 1
        assert flags[0]["severity"] == "nice_to_have"

    def test_no_scope_no_flag(self) -> None:
        ex = extract_material_from_text("Colour: grey.")
        assert flag_scope_limitation_noted(ex) == []


class TestSuperseded:
    def test_flags(self) -> None:
        ex = extract_material_from_text("Assessed against NZS 3604:1999.")
        flags = flag_superseded_standards(ex)
        assert len(flags) == 1
        assert "NZS 3604:2011" in flags[0]["recommended_action"]


class TestRunAll:
    def test_combined(self) -> None:
        text = (
            "Product: Acme Cladding\n"
            "Carries a BRANZ Appraisal.\n"
            "Scope of use: max height 7m, high wind zone.\n"
            "Assessed against NZS 3604:1999.\n"
        )
        rules = {f["_rule"] for f in run_material_rules(extract_material_from_text(text))}
        assert rules == {
            "missing_appraisal_number",
            "scope_limitation_noted",
            "superseded_standard",
        }

    def test_clean_no_flags(self) -> None:
        text = "Product: Acme Cladding\nBRANZ Appraisal No. 1234.\n"
        assert run_material_rules(extract_material_from_text(text)) == []
