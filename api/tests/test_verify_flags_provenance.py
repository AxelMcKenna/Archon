"""verify_flags must attach clause provenance to every kept and dropped flag.

Provenance (`mbie_clauses_considered`) is the audit trail that makes an
AS-compliant *drop* — which silently removes a flag from the user's view —
explainable after the fact. These tests pin that it rides on both outcomes,
and that an AS-compliant drop is tagged with its reason.
"""

from __future__ import annotations

import app.vision.plans.vision_pass as vp
from app.extractors.metrics import Metrics
from app.vision.core.renderer import RenderedImage


def _run(monkeypatch, flags, verifications, *, prov=None):
    if prov is None:
        prov = [[{"document_id": "E2/AS1", "clause_number": "9.1.1"}] for _ in flags]
    monkeypatch.setattr(
        vp, "_retrieve_mbie_context", lambda f: (["clause text" for _ in f], prov)
    )
    monkeypatch.setattr(vp, "load_prompt", lambda key: ("tmpl {{flags_block}}", "v"))
    monkeypatch.setattr(vp, "fill", lambda t, **k: t)
    monkeypatch.setattr(vp, "caption_str", lambda img: "cap")
    monkeypatch.setattr(
        vp, "get_settings", lambda: type("S", (), {
            "plan_verifier_provider": "gemini",
            "openrouter_verifier_model": "m",
            "gemini_verifier_model": "m",
        })(),
    )
    monkeypatch.setattr(
        vp, "invoke_tool", lambda **kw: ({"verifications": verifications}, 1, 1)
    )
    images = [RenderedImage(page=1, tile="full", png=b"x", dpi=72)]
    return vp.verify_flags(images=images, flags=flags, metrics=Metrics())


def test_kept_flag_carries_provenance(monkeypatch):
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    kept, drops, status, _ = _run(
        monkeypatch, flags,
        [{"flag_id": 0, "verified": True, "as_compliant": False}],
    )
    assert status == "verified"
    assert len(kept) == 1 and not drops
    assert kept[0]["mbie_clauses_considered"] == [
        {"document_id": "E2/AS1", "clause_number": "9.1.1"}
    ]


def test_as_compliant_drop_carries_provenance_and_reason(monkeypatch):
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    kept, drops, _, _ = _run(
        monkeypatch, flags,
        # A grounded drop: the verifier quotes the visible detail and names a
        # clause that was actually retrieved (9.1.1).
        [{"flag_id": 0, "verified": True, "as_compliant": True,
          "as_compliant_quote": "35mm cavity", "as_compliant_clause": "9.1.1",
          "verification_note": "cavity shown"}],
    )
    assert not kept and len(drops) == 1
    d = drops[0]
    assert d["dropped_reason"] == "as_compliant"
    assert d["as_compliant_quote"] == "35mm cavity"
    assert d["as_compliant_clause"] == "9.1.1"
    # The silent drop is now auditable back to the clause that justified it.
    assert d["mbie_clauses_considered"] == [
        {"document_id": "E2/AS1", "clause_number": "9.1.1"}
    ]


def test_as_compliant_without_grounding_is_kept(monkeypatch):
    # Clauses were retrieved, but the verifier gave no quoted detail and no
    # satisfied clause — an unverifiable drop, so the flag must be kept.
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    kept, drops, _, _ = _run(
        monkeypatch, flags,
        [{"flag_id": 0, "verified": True, "as_compliant": True}],
    )
    assert not drops and len(kept) == 1
    note = kept[0].get("verification_note") or ""
    assert "no visible compliant detail quoted" in note


def test_as_compliant_with_unmatched_clause_is_kept(monkeypatch):
    # The verifier cites a clause that was never retrieved (8.2.2 vs 9.1.1) —
    # the drop is ungrounded, so the flag is kept.
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    kept, drops, _, _ = _run(
        monkeypatch, flags,
        [{"flag_id": 0, "verified": True, "as_compliant": True,
          "as_compliant_quote": "35mm cavity", "as_compliant_clause": "8.2.2"}],
    )
    assert not drops and len(kept) == 1
    assert "cited clause not among retrieved clauses" in (
        kept[0].get("verification_note") or ""
    )


def test_missing_verdict_is_kept_not_dropped(monkeypatch):
    # The verifier omitted this flag (e.g. truncated response). A missing
    # verdict is not evidence to drop on, so the flag is kept unverified.
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    kept, drops, _, _ = _run(monkeypatch, flags, [])
    assert not drops and len(kept) == 1
    assert "no verdict" in (kept[0].get("verification_note") or "")
    assert "mbie_clauses_considered" in kept[0]


def _run_voting(monkeypatch, flags, passes, *, n, threshold, prov=None):
    """Like ``_run`` but runs ``n`` verifier passes, returning the
    ``verifications`` list from ``passes`` in order (one per pass)."""
    if prov is None:
        prov = [[{"document_id": "E2/AS1", "clause_number": "9.1.1"}] for _ in flags]
    monkeypatch.setattr(
        vp, "_retrieve_mbie_context", lambda f: (["clause text" for _ in f], prov)
    )
    monkeypatch.setattr(vp, "load_prompt", lambda key: ("tmpl {{flags_block}}", "v"))
    monkeypatch.setattr(vp, "fill", lambda t, **k: t)
    monkeypatch.setattr(vp, "caption_str", lambda img: "cap")
    monkeypatch.setattr(
        vp, "get_settings", lambda: type("S", (), {
            "plan_verifier_provider": "gemini",
            "openrouter_verifier_model": "m",
            "gemini_verifier_model": "m",
            "plan_verifier_voting_n": n,
            "plan_verifier_voting_threshold": threshold,
        })(),
    )
    calls = iter(passes)
    monkeypatch.setattr(
        vp, "invoke_tool",
        lambda **kw: ({"verifications": next(calls)}, 1, 1),
    )
    images = [RenderedImage(page=1, tile="full", png=b"x", dpi=72)]
    return vp.verify_flags(images=images, flags=flags, metrics=Metrics())


def test_split_vote_keeps_flag(monkeypatch):
    # 3 passes, threshold 2: only one pass says drop (ungrounded). Below the
    # consensus threshold, so the flag is kept.
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    passes = [
        [{"flag_id": 0, "verified": True, "as_compliant": False}],
        [{"flag_id": 0, "verified": True, "as_compliant": False}],
        [{"flag_id": 0, "verified": False}],
    ]
    kept, drops, status, _ = _run_voting(monkeypatch, flags, passes, n=3, threshold=2)
    assert status == "verified"
    assert not drops and len(kept) == 1


def test_majority_vote_drops_flag(monkeypatch):
    # 3 passes, threshold 2: two passes say ungrounded → consensus drop.
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    passes = [
        [{"flag_id": 0, "verified": False}],
        [{"flag_id": 0, "verified": False}],
        [{"flag_id": 0, "verified": True, "as_compliant": False}],
    ]
    kept, drops, _, _ = _run_voting(monkeypatch, flags, passes, n=3, threshold=2)
    assert not kept and len(drops) == 1


def test_failed_passes_dont_count_toward_threshold(monkeypatch):
    # Two passes return verdicts (one drop, one keep), one pass omits the flag.
    # Threshold 2 over the two real votes → split → kept (fail-open).
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    passes = [
        [{"flag_id": 0, "verified": False}],
        [{"flag_id": 0, "verified": True, "as_compliant": False}],
        [],  # omitted this flag
    ]
    kept, drops, _, _ = _run_voting(monkeypatch, flags, passes, n=3, threshold=2)
    assert not drops and len(kept) == 1


def test_as_compliant_without_clauses_is_kept_not_dropped(monkeypatch):
    # The verifier claims compliance but no AS clause was retrieved — there is
    # nothing to be compliant against, so the flag must NOT be silently dropped.
    flags = [{"category": "building_code:E2", "verbatim_quote": "35mm cavity"}]
    kept, drops, _, _ = _run(
        monkeypatch, flags,
        [{"flag_id": 0, "verified": True, "as_compliant": True}],
        prov=[[]],
    )
    assert not drops and len(kept) == 1
    assert "no AS clause retrieved" in (kept[0].get("verification_note") or "")


def test_ungrounded_drop_carries_provenance(monkeypatch):
    flags = [{"category": "building_code:E2", "verbatim_quote": "fabricated"}]
    kept, drops, _, _ = _run(
        monkeypatch, flags, [{"flag_id": 0, "verified": False}]
    )
    assert not kept and len(drops) == 1
    assert "mbie_clauses_considered" in drops[0]
