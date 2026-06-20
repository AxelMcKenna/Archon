"""Material / product datasheet extraction (deterministic, text-driven)."""

from __future__ import annotations

from app.extractors.material_text import extract_material_from_text


class TestLabelledFields:
    def test_product_and_manufacturer(self) -> None:
        ex = extract_material_from_text(
            "Product: Acme Cavity Cladding System\nManufacturer: Acme Building Products"
        )
        assert ex.product == "Acme Cavity Cladding System"
        assert ex.manufacturer == "Acme Building Products"

    def test_appraisal_holder_is_manufacturer(self) -> None:
        ex = extract_material_from_text("Appraisal Holder: Acme Ltd")
        assert ex.manufacturer == "Acme Ltd"


class TestAssurance:
    def test_numbered(self) -> None:
        ex = extract_material_from_text("Holds BRANZ Appraisal No. 1234.")
        assert ex.has_numbered_assurance is True

    def test_bare(self) -> None:
        ex = extract_material_from_text("This product carries a BRANZ Appraisal.")
        assert ex.assurance_refs and ex.assurance_refs[0].numbered is False
        assert ex.has_numbered_assurance is False


class TestScopeOfUse:
    def test_scope_detected(self) -> None:
        ex = extract_material_from_text(
            "Scope of use: suitable for very high wind zone, max 10m height."
        )
        assert len(ex.scope_of_use) == 1

    def test_no_scope(self) -> None:
        ex = extract_material_from_text("Colour: Ironsand. Thickness: 0.55mm.")
        assert ex.scope_of_use == []


class TestSystemsAndStandards:
    def test_system_token(self) -> None:
        ex = extract_material_from_text("A proprietary cavity cladding system.")
        assert "cladding_system" in ex.systems

    def test_standards(self) -> None:
        ex = extract_material_from_text("Tested to AS/NZS 4284 and NZS 3604:1999.")
        assert "NZS 3604:1999" in ex.standards

    def test_durability_and_weathertight(self) -> None:
        ex = extract_material_from_text(
            "Durability: 15 years serviceable life. Weathertightness to E2/AS1."
        )
        assert ex.durability_mentioned is True
        assert ex.weathertight_mentioned is True


class TestScannedGuard:
    def test_empty_looks_scanned(self) -> None:
        assert extract_material_from_text("", page_count=10).looks_scanned is True
