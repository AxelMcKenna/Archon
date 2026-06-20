"""Spec/product document text extraction (deterministic, no PDF fixture needed —
driven through extract_spec_from_text)."""

from __future__ import annotations

from app.extractors.spec_text import extract_spec_from_text


class TestSections:
    def test_masterspec_section_heading(self) -> None:
        ex = extract_spec_from_text("4511 ALUMINIUM WINDOWS\nGeneral notes follow.")
        assert len(ex.sections) == 1
        assert ex.sections[0].code == "4511"
        assert ex.sections[0].heading == "ALUMINIUM WINDOWS"

    def test_prose_line_is_not_a_section(self) -> None:
        ex = extract_spec_from_text("The windows shall be aluminium joinery.")
        assert ex.sections == []


class TestAssuranceRefs:
    def test_numbered_branz_is_numbered(self) -> None:
        ex = extract_spec_from_text("Cladding has BRANZ Appraisal No. 1234.")
        assert len(ex.assurance_refs) == 1
        assert ex.assurance_refs[0].numbered is True
        assert ex.has_any_assurance_ref is True

    def test_numbered_codemark(self) -> None:
        ex = extract_spec_from_text("System holds CodeMark CM40123.")
        assert ex.assurance_refs and ex.assurance_refs[0].numbered is True

    def test_bare_assurance_word_is_unnumbered(self) -> None:
        ex = extract_spec_from_text("Membrane to carry a BRANZ Appraisal.")
        assert len(ex.assurance_refs) == 1
        assert ex.assurance_refs[0].numbered is False
        assert ex.has_any_assurance_ref is False


class TestProductMentions:
    def test_cladding_mention_captured(self) -> None:
        ex = extract_spec_from_text("External cladding system to be proprietary weatherboard.")
        assert ex.product_mentions
        assert ex.product_mentions[0].keyword == "cladding system"
        assert ex.product_mentions[0].has_assurance_on_line is False

    def test_assurance_on_same_line_is_flagged(self) -> None:
        ex = extract_spec_from_text("Membrane: XYZ with BRANZ Appraisal No. 999.")
        assert ex.product_mentions
        assert ex.product_mentions[0].has_assurance_on_line is True

    def test_plain_line_no_mention(self) -> None:
        ex = extract_spec_from_text("Paint all internal walls two coats.")
        assert ex.product_mentions == []


class TestHedgeLanguage:
    def test_or_similar_approved(self) -> None:
        ex = extract_spec_from_text("Joinery aluminium, colour grey, or similar approved.")
        assert len(ex.hedge_phrases) == 1
        assert ex.hedge_phrases[0].phrase == "or similar approved"

    def test_tbc_token(self) -> None:
        ex = extract_spec_from_text("Roof colour: TBC.")
        assert any(h.phrase == "tbc" for h in ex.hedge_phrases)

    def test_no_hedge_in_clean_line(self) -> None:
        ex = extract_spec_from_text("Roof colour: Colorsteel Ironsand.")
        assert ex.hedge_phrases == []


class TestSpecifiedSystems:
    def test_sprinkler_cue(self) -> None:
        ex = extract_spec_from_text("A fire sprinkler system is installed throughout.")
        assert any(c.system == "sprinklers" for c in ex.specified_systems)

    def test_emergency_lighting_cue(self) -> None:
        ex = extract_spec_from_text("Emergency lighting provided to all escape routes.")
        cues = {c.system: c.expected_standard for c in ex.specified_systems}
        assert cues.get("emergency_lighting") == "F6"

    def test_system_deduped(self) -> None:
        ex = extract_spec_from_text("Sprinkler heads.\nSprinkler valves.\nSprinkler main.")
        assert sum(1 for c in ex.specified_systems if c.system == "sprinklers") == 1


class TestStandardsAndClauses:
    def test_standards_extracted(self) -> None:
        ex = extract_spec_from_text("Sprinklers to NZS 4541:2020 and AS/NZS 1668.")
        assert "NZS 4541:2020" in ex.standards

    def test_superseded_year_captured(self) -> None:
        ex = extract_spec_from_text("Timber framing to NZS 3604:1999.")
        assert "NZS 3604:1999" in ex.standards


class TestScannedGuard:
    def test_empty_text_looks_scanned(self) -> None:
        ex = extract_spec_from_text("", page_count=20)
        assert ex.looks_scanned is True

    def test_dense_text_not_scanned(self) -> None:
        ex = extract_spec_from_text("word " * 100, page_count=1)
        assert ex.looks_scanned is False
