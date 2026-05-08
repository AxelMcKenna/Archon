from uuid import uuid4

from app.risk import score_project

CORPUS = [
    {
        "id": str(uuid4()),
        "bca": "ccc",
        "project_type": None,
        "category": "building_code:B1",
        "severity": "must_resolve",
        "example_text": "Provide structural calculations demonstrating compliance with B1 for first-floor framing.",
        "trigger_description": "Multi-storey or non-trivial framing without engineer input",
        "resolution_hint": "Engineer-stamped calcs (PS1).",
    },
    {
        "id": str(uuid4()),
        "bca": "ccc",
        "project_type": None,
        "category": "building_code:E2",
        "severity": "must_resolve",
        "example_text": "Show flashings to head, jamb and sill at all window penetrations. Refer E2/AS1.",
        "trigger_description": "Window flashings not detailed",
        "resolution_hint": "E2/AS1 references with project-specific dimensions.",
    },
    {
        "id": str(uuid4()),
        "bca": "ccc",
        "project_type": None,
        "category": "documentation:fees",
        "severity": "must_resolve",
        "example_text": "Outstanding fee shortfall of $450 must be paid before processing continues.",
        "trigger_description": "Initial deposit insufficient",
        "resolution_hint": "Pay fee online.",
    },
    {
        "id": str(uuid4()),
        "bca": "selwyn",  # different BCA, must be filtered out
        "project_type": None,
        "category": "building_code:B1",
        "severity": "must_resolve",
        "example_text": "Bracing line layout per NZS 3604 required.",
        "trigger_description": "Schedule method bracing not shown",
        "resolution_hint": "Bracing schedule.",
    },
]


def test_b1_e2_dominate_when_description_hints_at_them():
    result = score_project(
        bca="ccc",
        project_type="new_dwelling",
        description=(
            "Two-storey new dwelling with steel beam over the garage opening "
            "and direct-fixed weatherboard cladding. Engineer to design the "
            "framing and bracing per Building Code clause B1."
        ),
        addressed_corpus_ids=[],
        corpus=CORPUS,
    )
    cats = [i.category for i in result.items]
    assert "building_code:B1" in cats
    assert "building_code:E2" in cats
    # Selwyn corpus row must be filtered out.
    assert all(c != "Bracing line layout per NZS 3604 required." for c in cats)
    assert result.band in ("medium", "high")


def test_addressed_items_drop_score():
    desc = (
        "Two-storey new dwelling with steel beam, weatherboard cladding, and "
        "Building Code clause B1 framing requirements."
    )
    full = score_project(
        bca="ccc",
        project_type="new_dwelling",
        description=desc,
        addressed_corpus_ids=[],
        corpus=CORPUS,
    )
    addressed = score_project(
        bca="ccc",
        project_type="new_dwelling",
        description=desc,
        addressed_corpus_ids=[CORPUS[0]["id"], CORPUS[1]["id"]],
        corpus=CORPUS,
    )
    assert addressed.score < full.score
    assert all(i.corpus_id not in {CORPUS[0]["id"], CORPUS[1]["id"]} for i in addressed.items)


def test_low_band_for_unrelated_description():
    result = score_project(
        bca="ccc",
        project_type="deck",
        description="Replacing the kitchen splashback. Internal fit-out only.",
        addressed_corpus_ids=[],
        corpus=CORPUS,
    )
    assert result.band == "low"
