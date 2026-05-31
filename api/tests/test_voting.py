"""Self-consistency voting (cross-run flag dedup with threshold)."""

from __future__ import annotations

from typing import Any

from app.plans.vote import vote_flags as _vote_flags


def _f(area: str, *, page: int = 1, category: str = "cat", confidence: str = "medium",
       quote: str | None = None,
       extra: dict[str, Any] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "page": page, "area": area, "category": category, "confidence": confidence
    }
    if quote is not None:
        out["verbatim_quote"] = quote
    if extra:
        out.update(extra)
    return out


def test_empty() -> None:
    assert _vote_flags([], threshold=2) == []
    assert _vote_flags([[], [], []], threshold=2) == []


def test_threshold_one_is_union_dedup() -> None:
    runs = [[_f("kitchen")], [_f("kitchen"), _f("garage")]]
    out = _vote_flags(runs, threshold=1)
    areas = sorted(f["area"] for f in out)
    assert areas == ["garage", "kitchen"]


def test_all_agree() -> None:
    f = _f("kitchen")
    out = _vote_flags([[f], [f], [f]], threshold=2)
    assert len(out) == 1
    assert out[0]["area"] == "kitchen"


def test_all_unique_drops_everything() -> None:
    runs = [[_f("kitchen")], [_f("garage")], [_f("bedroom")]]
    assert _vote_flags(runs, threshold=2) == []


def test_two_shared_one_unique_keeps_only_shared() -> None:
    runs = [
        [_f("kitchen"), _f("garage"), _f("logfire")],   # logfire only here
        [_f("kitchen"), _f("garage")],
        [_f("kitchen"), _f("garage")],
    ]
    out = _vote_flags(runs, threshold=2)
    areas = sorted(f["area"] for f in out)
    assert areas == ["garage", "kitchen"]


def test_confidence_tiebreak_keeps_highest() -> None:
    low = _f("kitchen", confidence="low", extra={"reason": "low one"})
    high = _f("kitchen", confidence="high", extra={"reason": "high one"})
    out = _vote_flags([[low], [high]], threshold=2)
    assert len(out) == 1
    assert out[0]["confidence"] == "high"
    assert out[0]["reason"] == "high one"


def test_within_run_duplicates_count_once() -> None:
    # A single hyperactive run that lists "kitchen" 3× shouldn't push it
    # over a 2-of-3 threshold by itself.
    runs = [
        [_f("kitchen"), _f("kitchen"), _f("kitchen")],
        [_f("garage")],
        [_f("garage")],
    ]
    out = _vote_flags(runs, threshold=2)
    areas = sorted(f["area"] for f in out)
    assert areas == ["garage"]


def test_normalised_area_is_loose_match() -> None:
    # "Kitchen Area" vs "  kitchen   area  " should bucket together.
    runs = [[_f("Kitchen Area")], [_f("  kitchen   area  ")]]
    out = _vote_flags(runs, threshold=2)
    assert len(out) == 1


def test_different_pages_do_not_merge() -> None:
    runs = [[_f("kitchen", page=1)], [_f("kitchen", page=2)]]
    assert _vote_flags(runs, threshold=2) == []


def test_threshold_clamps_to_runs_in_caller() -> None:
    # _vote_flags itself trusts the threshold; analyse_plan clamps it.
    # Here just verify the arithmetic is honest: threshold=4 with 3 runs
    # means nothing survives.
    runs = [[_f("kitchen")], [_f("kitchen")], [_f("kitchen")]]
    assert _vote_flags(runs, threshold=4) == []


def test_same_area_different_categories_merges() -> None:
    # The model labels the same observation differently across runs
    # (e.g. Garage flagged for C in one run, F in another). The voting
    # key is (page, area) so these merge into one consensus flag.
    runs = [
        [_f("kitchen", category="building_code:G4")],
        [_f("kitchen", category="building_code:G13")],
        [_f("kitchen", category="building_code:G4")],
    ]
    out = _vote_flags(runs, threshold=2)
    assert len(out) == 1
    # Tie on confidence (all medium) → most-common category wins.
    assert out[0]["category"] == "building_code:G4"


def test_confidence_beats_category_frequency() -> None:
    # A single high-confidence hit beats two medium-confidence hits at
    # the same area, regardless of which category is more frequent.
    runs = [
        [_f("kitchen", category="A", confidence="high")],
        [_f("kitchen", category="B", confidence="medium")],
        [_f("kitchen", category="B", confidence="medium")],
    ]
    out = _vote_flags(runs, threshold=2)
    assert len(out) == 1
    assert out[0]["confidence"] == "high"
    assert out[0]["category"] == "A"


def test_category_frequency_breaks_confidence_ties() -> None:
    runs = [
        [_f("kitchen", category="A", confidence="medium")],
        [_f("kitchen", category="B", confidence="medium")],
        [_f("kitchen", category="B", confidence="medium")],
    ]
    out = _vote_flags(runs, threshold=2)
    assert out[0]["category"] == "B"


# ---------------------------------------------------------------------------
# Quote-based bucketing — primary key when verbatim_quote is present.
# ---------------------------------------------------------------------------


def test_same_quote_different_area_prose_merges() -> None:
    # The model labels the same observation with totally different `area`
    # text across runs but quotes the same drawing label. The quote-based
    # bucket key catches this; an area-only key would split the vote.
    runs = [
        [_f("Kitchen and living areas",      quote="Kitchen 4,050 x 2,900")],
        [_f("Kitchen 4,050 x 2,900 zone",    quote="Kitchen 4.050 x 2.900")],
        [_f("Internal moisture risk areas",  quote="Kitchen 4,050 x 2,900")],
    ]
    out = _vote_flags(runs, threshold=2)
    assert len(out) == 1


def test_quote_signature_normalises_punctuation() -> None:
    # "4,050 x 2,900", "4.050 x 2.900", "4 050  ×  2 900" should all bucket.
    runs = [
        [_f("a", quote="Kitchen 4,050 x 2,900")],
        [_f("b", quote="Kitchen 4.050 x 2.900")],
    ]
    out = _vote_flags(runs, threshold=2)
    assert len(out) == 1


def test_missing_quote_falls_back_to_area() -> None:
    # No verbatim_quote → bucket by area so unquoted flags don't all
    # collapse into one bucket.
    runs = [
        [_f("kitchen"), _f("garage")],
        [_f("kitchen"), _f("garage")],
    ]
    out = _vote_flags(runs, threshold=2)
    areas = sorted(f["area"] for f in out)
    assert areas == ["garage", "kitchen"]


def test_quoted_and_unquoted_do_not_merge_even_at_same_area() -> None:
    # An unquoted flag uses area-fallback; a quoted one uses quote.
    # They land in different buckets even if the area string matches.
    runs = [
        [_f("kitchen", quote="Kitchen 4.050 x 2.900")],
        [_f("kitchen")],
    ]
    out = _vote_flags(runs, threshold=2)
    assert out == []
