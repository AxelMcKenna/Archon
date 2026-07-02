"""Accuracy mechanisms (spike/accuracy-mechanisms) — all config-gated,
default OFF until validated on a labelled real-plan eval set.

Pins the behaviour of each mechanism:
- low-confidence voting buckets need one extra vote (plan_low_confidence_extra_vote);
- high-confidence sub-threshold buckets are rescued into verification and are
  fail-CLOSED there (plan_singleton_rescue);
- building_code flags with no retrieved MBIE clause are annotated/demoted
  (plan_ungrounded_code_demotion);
- flags whose verbatim_quote neither the text layer nor OCR could locate are
  annotated/demoted (plan_unlocated_quote_demotion);
- the ensemble runs voting passes per model family, votes them separately and
  unions the survivors by vote_key (plan_analyser_ensemble).
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import app.plans.analyzer as analyzer
import app.vision.plans.vision_pass as vp
from app.extractors.metrics import Metrics
from app.plans.vote import dedup_by_vote_key, rescue_singletons, vote_flags
from app.vision.core.renderer import RenderedImage, RenderedSheet

# --- voting: low-confidence extra vote ----------------------------------------


def _flag(quote: str, *, confidence: str = "medium", **kw: Any) -> dict[str, Any]:
    # Distinct area per quote — dedup_flags collapses same (page, area,
    # category), and these fixtures represent distinct findings.
    return {
        "page": 1,
        "area": kw.pop("area", f"area for {quote}"),
        "category": "building_code:E2",
        "confidence": confidence,
        "verbatim_quote": quote,
        **kw,
    }


def test_low_confidence_bucket_needs_extra_vote():
    low = _flag("q-low", confidence="low")
    med = _flag("q-med", confidence="medium")
    runs = [[low, med], [low, med], [med]]
    # Off: both pass 2-of-3.
    kept = vote_flags(runs, threshold=2)
    assert {f["verbatim_quote"] for f in kept} == {"q-low", "q-med"}
    # On: the low bucket now needs 3 votes; the medium one still needs 2.
    kept = vote_flags(runs, threshold=2, low_confidence_extra_vote=True)
    assert {f["verbatim_quote"] for f in kept} == {"q-med"}
    # A low bucket that clears the raised bar survives.
    kept = vote_flags(
        [[low], [low], [low]], threshold=2, low_confidence_extra_vote=True
    )
    assert {f["verbatim_quote"] for f in kept} == {"q-low"}


def test_low_confidence_extra_vote_clamps_to_run_count():
    # 2 runs, threshold 2: the raised bar (3) clamps to 2 — a unanimous low
    # bucket is not asked for more votes than passes exist.
    low = _flag("q-low", confidence="low")
    kept = vote_flags([[low], [low]], threshold=2, low_confidence_extra_vote=True)
    assert len(kept) == 1


def test_bucket_confidence_is_best_hit():
    # One low + one high hit in the same bucket → judged as high, no extra vote.
    hits = [_flag("q", confidence="low"), _flag("q", confidence="high")]
    kept = vote_flags([[hits[0]], [hits[1]]], threshold=2, low_confidence_extra_vote=True)
    assert len(kept) == 1 and kept[0]["confidence"] == "high"


# --- voting: singleton rescue ---------------------------------------------------


def test_rescue_returns_only_high_confidence_sub_threshold_buckets():
    high_single = _flag("q-high", confidence="high")
    med_single = _flag("q-med", confidence="medium")
    voted_in = _flag("q-voted", confidence="low")
    runs = [[high_single, voted_in], [voted_in], [med_single]]
    rescued = rescue_singletons(runs, threshold=2)
    assert [f["verbatim_quote"] for f in rescued] == ["q-high"]
    assert all(f["singleton_rescue"] is True for f in rescued)


def test_dedup_by_vote_key_unions_cross_provider_duplicates():
    # Same quote, different area phrasing (flag_key would miss this).
    a = _flag("Kitchen 4,050 x 2,900", confidence="medium", area="kitchen north")
    b = _flag("Kitchen 4.050 x 2.900", confidence="high", area="kitchen, north wall")
    out = dedup_by_vote_key([a, b])
    assert len(out) == 1 and out[0]["confidence"] == "high"
    c = _flag("different quote entirely")
    assert len(dedup_by_vote_key([a, b, c])) == 2


# --- verifier: ungrounded building_code demotion --------------------------------


def _verify_settings(**overrides: Any):
    base = {
        "plan_verifier_provider": "gemini",
        "openrouter_verifier_model": "m",
        "gemini_verifier_model": "m",
        "plan_verifier_voting_n": 1,
        "plan_verifier_voting_threshold": 2,
        "plan_verifier_flags_per_call": 10,
        "plan_ungrounded_code_demotion": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _run_verify(monkeypatch, *, flags, provenance_for, settings):
    monkeypatch.setattr(
        vp,
        "_retrieve_mbie_context",
        lambda f, risk_group="": (
            ["" for _ in f],
            [provenance_for(x) for x in f],
        ),
    )
    monkeypatch.setattr(vp, "load_prompt", lambda key: ("{{flags_block}}", "v"))
    monkeypatch.setattr(vp, "caption_str", lambda img: "cap")
    monkeypatch.setattr(vp, "get_settings", lambda: settings)

    def fake_invoke(**kw):
        entries = json.loads(kw["prompt"])
        return (
            {
                "verifications": [
                    {"flag_id": e["flag_id"], "verified": True, "as_compliant": False}
                    for e in entries
                ]
            },
            1,
            1,
        )

    monkeypatch.setattr(vp, "invoke_tool", fake_invoke)
    images = [RenderedImage(page=1, tile="full", png=b"x", dpi=72)]
    kept, drops, status, _ = vp.verify_flags(images=images, flags=flags, metrics=Metrics())
    return kept, drops, status


def test_ungrounded_building_code_flag_is_annotated_and_demoted(monkeypatch):
    code_flag = _flag("q-code", confidence="high")
    doc_flag = {**_flag("q-doc", confidence="high"), "category": "documentation:missing_sheets"}

    def provenance_for(f):
        return []  # nothing retrieved for anyone

    kept, _, _ = _run_verify(
        monkeypatch,
        flags=[code_flag, doc_flag],
        provenance_for=provenance_for,
        settings=_verify_settings(plan_ungrounded_code_demotion=True),
    )
    by_quote = {f["verbatim_quote"]: f for f in kept}
    demoted = by_quote["q-code"]
    assert demoted["mbie_grounding"] == "none"
    assert demoted["confidence"] == "low"
    assert demoted["confidence_before_demotion"] == "high"
    # Non-building_code flags are untouched even with empty retrieval.
    assert by_quote["q-doc"].get("mbie_grounding") is None
    assert by_quote["q-doc"]["confidence"] == "high"


def test_grounded_flag_and_disabled_toggle_are_not_demoted(monkeypatch):
    code_flag = _flag("q-code", confidence="high")
    kept, _, _ = _run_verify(
        monkeypatch,
        flags=[code_flag],
        provenance_for=lambda f: [{"clause_number": "E2/AS1 9.1"}],
        settings=_verify_settings(plan_ungrounded_code_demotion=True),
    )
    assert kept[0].get("mbie_grounding") is None
    assert kept[0]["confidence"] == "high"

    kept, _, _ = _run_verify(
        monkeypatch,
        flags=[code_flag],
        provenance_for=lambda f: [],
        settings=_verify_settings(plan_ungrounded_code_demotion=False),
    )
    # Annotated (free signal) but not demoted.
    assert kept[0]["mbie_grounding"] == "none"
    assert kept[0]["confidence"] == "high"


# --- analyzer: quote-location annotation ----------------------------------------


def _quote_settings(demote: bool):
    return SimpleNamespace(
        plan_ocr_refiner_enabled=True,
        plan_unlocated_quote_demotion=demote,
    )


def test_quote_location_annotation_and_demotion(monkeypatch):
    monkeypatch.setattr(analyzer, "ocr_available", lambda: True)
    flags = [
        {**_flag("located quote", confidence="high"), "bbox_source": "text_layer"},
        {**_flag("ocr located quote", confidence="high"), "bbox_source": "ocr"},
        {**_flag("nowhere to be found", confidence="high"), "bbox_source": "model"},
        {**_flag("rule flag quote", confidence="high"), "_rule": "missing_sheets"},
        {**_flag("hi", confidence="high"), "bbox_source": "model"},  # too short
    ]
    out = analyzer._annotate_quote_location(
        flags, media_type="application/pdf", settings=_quote_settings(demote=True)
    )
    assert out[0]["quote_located"] is True and out[0]["confidence"] == "high"
    assert out[1]["quote_located"] is True
    assert out[2]["quote_located"] is False
    assert out[2]["confidence"] == "low"
    assert out[2]["confidence_before_demotion"] == "high"
    # Rule flags and sub-locatable quotes pass through untouched.
    assert "quote_located" not in out[3] and out[3]["confidence"] == "high"
    assert "quote_located" not in out[4] and out[4]["confidence"] == "high"


def test_quote_location_skips_when_ocr_unavailable(monkeypatch):
    # A missing OCR wheel must not demote every vector-label flag.
    monkeypatch.setattr(analyzer, "ocr_available", lambda: False)
    flags = [{**_flag("nowhere to be found", confidence="high"), "bbox_source": "model"}]
    out = analyzer._annotate_quote_location(
        flags, media_type="application/pdf", settings=_quote_settings(demote=True)
    )
    assert out == flags


def test_quote_location_annotates_without_demoting_when_off(monkeypatch):
    monkeypatch.setattr(analyzer, "ocr_available", lambda: True)
    flags = [{**_flag("nowhere to be found", confidence="high"), "bbox_source": "model"}]
    out = analyzer._annotate_quote_location(
        flags, media_type="application/pdf", settings=_quote_settings(demote=False)
    )
    assert out[0]["quote_located"] is False
    assert out[0]["confidence"] == "high"


# --- analyzer: ensemble + rescue wiring ------------------------------------------


def _analyzer_settings(**overrides: Any):
    base = {
        "plan_analyser_temperature": 0.5,
        "plan_analyser_ensemble": False,
        "plan_low_confidence_extra_vote": False,
        "plan_singleton_rescue": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _sheet() -> RenderedSheet:
    return RenderedSheet(
        page=1,
        sheet_index=0,
        images=[RenderedImage(page=1, tile="full", png=b"x", dpi=72)],
        classification="standard",
    )


def _run_analyzer(monkeypatch, *, settings, pass_payloads, verify=None):
    """Drive _run_sheets_parallel over one sheet with a scripted analyser.

    ``pass_payloads(provider, pass_idx)`` returns the payload for that call.
    ``verify`` defaults to keep-everything.
    """
    monkeypatch.setattr(analyzer, "get_settings", lambda: settings)
    monkeypatch.setattr(
        analyzer, "secondary_analyser_provider_model", lambda s: ("openrouter", "m2")
    )
    monkeypatch.setattr(analyzer, "caption_str", lambda img: "cap")
    monkeypatch.setattr(analyzer, "attach_page_bbox", lambda flags: flags)

    calls: list[tuple[str, int]] = []

    def fake_pass(**kw):
        provider = kw.get("provider") or "default"
        seed = kw.get("seed") or 0
        calls.append((provider, seed))
        return pass_payloads(provider, seed), 1, 1

    monkeypatch.setattr(analyzer, "run_single_vision_pass", fake_pass)

    if verify is None:

        def verify(**kw):
            return list(kw["flags"]), [], "verified", "v"

    monkeypatch.setattr(analyzer, "verify_flags", verify)

    results = analyzer._run_sheets_parallel(
        sheets=[_sheet()],
        prompt="p",
        voting_n=2,
        voting_threshold=2,
        concurrency=1,
        metrics=Metrics(),
    )
    return results[0], calls


def test_ensemble_runs_both_providers_and_unions_survivors(monkeypatch):
    shared = _flag("both providers see this")
    gem_only = _flag("gemini only finding")
    or_only = _flag("openrouter only finding")

    def payloads(provider, seed):
        flags = [shared, gem_only] if provider == "default" else [shared, or_only]
        return {"flags": flags, "summary": f"s-{provider}"}

    result, calls = _run_analyzer(
        monkeypatch,
        settings=_analyzer_settings(plan_analyser_ensemble=True),
        pass_payloads=payloads,
    )
    # 2 passes per provider, seeds repeat per family.
    assert calls == [("default", 0), ("default", 1), ("openrouter", 0), ("openrouter", 1)]
    kept_quotes = {f["verbatim_quote"] for f in result["kept"]}
    # Each provider's 2/2 findings survive; the shared one appears once.
    assert kept_quotes == {
        "both providers see this",
        "gemini only finding",
        "openrouter only finding",
    }
    assert len(result["kept"]) == 3
    providers = {r["provider"] for r in result["runs_debug"]}
    assert providers == {"default", "openrouter"}


def test_ensemble_votes_providers_separately(monkeypatch):
    # A flag seen once per provider (1+1) must NOT pass a 2-vote threshold by
    # pooling families.
    flaky = _flag("seen once per provider")

    def payloads(provider, seed):
        return {"flags": [flaky] if seed == 0 else []}

    result, _ = _run_analyzer(
        monkeypatch,
        settings=_analyzer_settings(plan_analyser_ensemble=True),
        pass_payloads=payloads,
    )
    assert result["kept"] == []


def test_singleton_rescue_is_fail_closed(monkeypatch):
    rescued_src = _flag("high conf singleton", confidence="high")
    voted_src = _flag("normal voted flag")

    def payloads(provider, seed):
        return {"flags": [voted_src, rescued_src] if seed == 0 else [voted_src]}

    def verify_positive(**kw):
        return list(kw["flags"]), [], "verified", "v"

    def verify_no_verdict(**kw):
        return (
            [
                {**f, "kept_unverified": True} if f.get("singleton_rescue") else f
                for f in kw["flags"]
            ],
            [],
            "verified",
            "v",
        )

    # Positively verified → the rescued flag survives.
    result, _ = _run_analyzer(
        monkeypatch,
        settings=_analyzer_settings(plan_singleton_rescue=True),
        pass_payloads=payloads,
        verify=verify_positive,
    )
    kept_quotes = {f["verbatim_quote"] for f in result["kept"]}
    assert kept_quotes == {"normal voted flag", "high conf singleton"}

    # No verdict → fail-closed: rescued drops, the voted flag stays (fail-open).
    result, _ = _run_analyzer(
        monkeypatch,
        settings=_analyzer_settings(plan_singleton_rescue=True),
        pass_payloads=payloads,
        verify=verify_no_verdict,
    )
    kept_quotes = {f["verbatim_quote"] for f in result["kept"]}
    assert kept_quotes == {"normal voted flag"}


def test_rescue_off_discards_singletons(monkeypatch):
    rescued_src = _flag("high conf singleton", confidence="high")

    def payloads(provider, seed):
        return {"flags": [rescued_src] if seed == 0 else []}

    result, _ = _run_analyzer(
        monkeypatch,
        settings=_analyzer_settings(plan_singleton_rescue=False),
        pass_payloads=payloads,
    )
    assert result["kept"] == []
