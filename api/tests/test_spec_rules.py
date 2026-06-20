"""Deterministic spec rules — positive and negative cases per rule."""

from __future__ import annotations

from app.extractors.spec_rules import (
    flag_incomplete_assurance,
    flag_placeholder_language,
    flag_specified_system_without_standard,
    flag_superseded_standards,
    flag_unassured_products,
    run_spec_rules,
)
from app.extractors.spec_text import extract_spec_from_text


class TestIncompleteAssurance:
    def test_bare_reference_flags(self) -> None:
        ex = extract_spec_from_text("Cladding to carry a BRANZ Appraisal.")
        flags = flag_incomplete_assurance(ex)
        assert len(flags) == 1
        assert flags[0]["category"] == "documentation:product_assurance"
        assert flags[0]["confidence"] == "high"

    def test_numbered_reference_no_flag(self) -> None:
        ex = extract_spec_from_text("Cladding BRANZ Appraisal No. 1234.")
        assert flag_incomplete_assurance(ex) == []


class TestUnassuredProducts:
    def test_product_without_any_assurance_flags(self) -> None:
        ex = extract_spec_from_text("External cladding system: proprietary rainscreen.")
        flags = flag_unassured_products(ex)
        assert len(flags) == 1
        assert flags[0]["confidence"] == "medium"
        assert "cladding system" in flags[0]["reason"]

    def test_no_flag_when_assurance_present(self) -> None:
        ex = extract_spec_from_text(
            "Cladding system X with BRANZ Appraisal No. 555 throughout."
        )
        assert flag_unassured_products(ex) == []

    def test_no_flag_without_product_mentions(self) -> None:
        ex = extract_spec_from_text("Paint internal walls two coats.")
        assert flag_unassured_products(ex) == []


class TestPlaceholderLanguage:
    def test_hedge_flags_once_aggregated(self) -> None:
        ex = extract_spec_from_text(
            "Joinery or similar approved.\nRoof colour TBC.\nFlashings by others."
        )
        flags = flag_placeholder_language(ex)
        assert len(flags) == 1
        assert flags[0]["category"] == "documentation:specifications"

    def test_clean_spec_no_flag(self) -> None:
        ex = extract_spec_from_text("Joinery: APL aluminium, Ironsand.")
        assert flag_placeholder_language(ex) == []


class TestSpecifiedSystemWithoutStandard:
    def test_sprinkler_without_standard_flags(self) -> None:
        ex = extract_spec_from_text("A fire sprinkler system is provided.")
        flags = flag_specified_system_without_standard(ex)
        assert len(flags) == 1
        assert flags[0]["category"] == "documentation:specified_systems"
        assert "NZS 4541" in flags[0]["reason"]

    def test_sprinkler_with_standard_no_flag(self) -> None:
        ex = extract_spec_from_text("Sprinkler system installed to NZS 4541:2020.")
        assert flag_specified_system_without_standard(ex) == []

    def test_emergency_lighting_with_f6_clause_no_flag(self) -> None:
        ex = extract_spec_from_text("Emergency lighting to F6/AS1 on escape routes.")
        assert flag_specified_system_without_standard(ex) == []


class TestSupersededStandards:
    def test_superseded_flags(self) -> None:
        ex = extract_spec_from_text("Timber framing to NZS 3604:1999.")
        flags = flag_superseded_standards(ex)
        assert len(flags) == 1
        assert "NZS 3604:2011" in flags[0]["recommended_action"]
        assert flags[0]["severity"] == "nice_to_have"

    def test_current_standard_no_flag(self) -> None:
        ex = extract_spec_from_text("Timber framing to NZS 3604:2011.")
        assert flag_superseded_standards(ex) == []


class TestRunSpecRules:
    def test_combined_document(self) -> None:
        text = (
            "4511 ALUMINIUM WINDOWS\n"
            "Cladding system proprietary rainscreen, or similar approved.\n"
            "A fire sprinkler system is provided.\n"
            "Timber framing to NZS 3604:1999.\n"
        )
        ex = extract_spec_from_text(text)
        rules = {f["_rule"] for f in run_spec_rules(ex)}
        assert "unassured_products" in rules
        assert "placeholder_language" in rules
        assert "specified_system_without_standard" in rules
        assert "superseded_standard" in rules

    def test_clean_document_no_flags(self) -> None:
        text = (
            "Cladding system X with BRANZ Appraisal No. 555.\n"
            "Sprinkler system to NZS 4541:2020.\n"
            "Timber framing to NZS 3604:2011.\n"
        )
        ex = extract_spec_from_text(text)
        assert run_spec_rules(ex) == []
