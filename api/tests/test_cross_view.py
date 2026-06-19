"""Cross-view reconciliation: classification, registration, reconcile, dedup."""

from __future__ import annotations

import app.plans.reconcile as reconcile_mod
from app.plans.reconcile import CROSS_VIEW_CATEGORY, reconcile_set
from app.plans.registration import build_comparison_sets
from app.plans.views import ViewRecord, build_view_record, seed_view_type
from app.plans.vote import dedup_cross_view
from app.vision.core.renderer import RenderedImage

# --- view classification ---------------------------------------------------


def test_seed_view_type_from_title():
    assert seed_view_type("A1.01", "Ground Floor Plan")[0] == "plan"
    assert seed_view_type("A3.01", "Section A-A")[0] == "section"
    assert seed_view_type("A2.01", "North Elevation")[0] == "elevation"
    assert seed_view_type("A1.00", "Site Plan")[0] == "site"
    assert seed_view_type("A5.01", "Window Schedule")[0] == "schedule"
    # Unknown / no title -> no guess, zero confidence.
    assert seed_view_type("X9.99", None) == (None, 0.0)


def test_build_view_record_merges_passes():
    rec = build_view_record(
        page=3,
        sheet_number="A1.01",
        title="Ground Floor Plan",
        view_payloads=[
            {
                "view_type": "plan",
                "level_id": "Ground Floor",
                "datums": [
                    {"label": "FFL", "value": "100.500", "verbatim_quote": "FFL 100.500"}
                ],
            },
            # Second pass repeats the datum (should dedupe) and omits view_type.
            {
                "datums": [
                    {"label": "FFL", "value": "100.500", "verbatim_quote": "FFL 100.500"}
                ],
            },
        ],
    )
    assert rec.view_type == "plan"
    assert rec.level_id == "Ground Floor"
    assert len(rec.datums) == 1


def test_build_view_record_falls_back_to_seed():
    rec = build_view_record(
        page=7, sheet_number="A3.01", title="Section A-A", view_payloads=[]
    )
    assert rec.view_type == "section"


# --- registration ----------------------------------------------------------


def _plan() -> ViewRecord:
    return ViewRecord(
        page=3,
        sheet_number="A1.01",
        title="Ground Floor Plan",
        view_type="plan",
        level_id="Ground Floor",
        datums=[{"label": "FFL", "value": "100.500", "verbatim_quote": "FFL 100.500"}],
        callouts=[{"marker": "A-A", "target_sheet": "A3.01", "verbatim_quote": "A-A"}],
    )


def _section() -> ViewRecord:
    return ViewRecord(
        page=7,
        sheet_number="A3.01",
        title="Section A-A",
        view_type="section",
        level_id="Ground Floor",
        datums=[{"label": "FFL", "value": "100.250", "verbatim_quote": "FFL 100.250"}],
    )


def test_registration_links_plan_and_section():
    sets = build_comparison_sets([_plan(), _section()])
    assert len(sets) == 1
    cs = sets[0]
    assert cs.pages == [3, 7]
    assert "callout" in cs.link_types  # plan callout resolves to A3.01
    assert "level" in cs.link_types  # both Ground Floor


def test_registration_ignores_unrelated_views():
    a = ViewRecord(page=1, sheet_number="A1.01", view_type="plan", level_id="Ground")
    b = ViewRecord(page=2, sheet_number="A1.02", view_type="plan", level_id="Level 1")
    assert build_comparison_sets([a, b]) == []


def test_registration_skips_set_without_datums():
    # Linked by level but neither view states a datum -> nothing to reconcile.
    a = ViewRecord(page=1, view_type="plan", level_id="Ground")
    b = ViewRecord(page=2, view_type="section", level_id="Ground")
    assert build_comparison_sets([a, b]) == []


# --- reconcile -------------------------------------------------------------


def _img(page: int) -> RenderedImage:
    return RenderedImage(page=page, tile="full", png=b"\x89PNG", dpi=150)


def _set():
    return build_comparison_sets([_plan(), _section()])[0]


def _patch_recon(monkeypatch, payload):
    monkeypatch.setattr(
        reconcile_mod, "run_tool_pass", lambda **kw: (payload, 10, 5)
    )


def test_reconcile_emits_cross_view_flag(monkeypatch):
    payload = {
        "discrepancies": [
            {
                "citation_a": {"page": 3, "verbatim_quote": "FFL 100.500"},
                "citation_b": {"page": 7, "verbatim_quote": "FFL 100.250"},
                "severity": "must_resolve",
                "confidence": "high",
                "reason": "Ground Floor FFL on plan disagrees with Section A-A.",
                "recommended_action": "Reconcile the FFL between plan and section.",
            }
        ]
    }
    _patch_recon(monkeypatch, payload)

    class _M:
        input_tokens = 0
        output_tokens = 0

    flags = reconcile_set(
        _set(), images_by_page={3: [_img(3)], 7: [_img(7)]}, metrics=_M()
    )
    assert len(flags) == 1
    f = flags[0]
    assert f["category"] == CROSS_VIEW_CATEGORY
    assert f["page"] == 3
    assert f["verbatim_quote"] == "FFL 100.500"
    assert f["cross_view"]["page_b"] == 7
    assert f["cross_view"]["verbatim_quote_b"] == "FFL 100.250"
    assert f["source"] == "cross_view"


def test_reconcile_drops_out_of_set_pages(monkeypatch):
    payload = {
        "discrepancies": [
            {
                "citation_a": {"page": 3, "verbatim_quote": "FFL 100.500"},
                "citation_b": {"page": 99, "verbatim_quote": "FFL 100.250"},
                "severity": "must_resolve",
                "confidence": "high",
                "reason": "cites a page not in the set",
                "recommended_action": "n/a",
            },
            {  # same-page citations -> dropped
                "citation_a": {"page": 3, "verbatim_quote": "FFL 100.500"},
                "citation_b": {"page": 3, "verbatim_quote": "FFL 100.250"},
                "severity": "must_resolve",
                "confidence": "high",
                "reason": "same page",
                "recommended_action": "n/a",
            },
        ]
    }
    _patch_recon(monkeypatch, payload)

    class _M:
        input_tokens = 0
        output_tokens = 0

    flags = reconcile_set(
        _set(), images_by_page={3: [_img(3)], 7: [_img(7)]}, metrics=_M()
    )
    assert flags == []


# --- dedup -----------------------------------------------------------------


def test_dedup_cross_view_collapses_swapped_citations():
    a = {
        "page": 3,
        "verbatim_quote": "FFL 100.500",
        "confidence": "medium",
        "cross_view": {"page_b": 7, "verbatim_quote_b": "FFL 100.250"},
    }
    b = {  # same conflict, citations swapped + higher confidence
        "page": 7,
        "verbatim_quote": "FFL 100.250",
        "confidence": "high",
        "cross_view": {"page_b": 3, "verbatim_quote_b": "FFL 100.500"},
    }
    out = dedup_cross_view([a, b])
    assert len(out) == 1
    assert out[0]["confidence"] == "high"
