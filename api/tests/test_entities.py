from app.extractors.entities import extract_entities


def test_ps1_and_b1():
    e = extract_entities(
        "Please provide PS1 from a Chartered Professional Engineer (CPEng) to "
        "demonstrate compliance with Building Code clause B1."
    )
    assert "PS1" in e.document_references
    assert "CPEng" in e.professional_references
    assert "B1" in e.clause_references


def test_e2_as1():
    e = extract_entities("Show flashings to head, jamb and sill. Refer E2/AS1.")
    assert "E2" in e.clause_references


def test_nzs_standard():
    e = extract_entities("Bracing design shall comply with NZS 3604:2011.")
    standards = [s.upper().replace(" ", "") for s in e.standards_references]
    assert any("NZS3604" in s for s in standards)


def test_dimensions():
    e = extract_entities(
        "The proposed retaining wall is over 1.5m in height and requires PS1."
    )
    assert any(d.value == 1.5 and d.unit == "m" for d in e.dimensions)


def test_no_false_positive_clause():
    """Bare 'B1' without consent context should not be picked up."""
    e = extract_entities("Bedroom B1 has a window facing south.")
    assert "B1" not in e.clause_references
