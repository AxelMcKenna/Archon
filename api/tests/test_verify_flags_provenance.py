"""verify_flags must attach clause provenance to every kept and dropped flag.

Provenance (`mbie_clauses_considered`) is the audit trail that makes an
AS-compliant *drop* — which silently removes a flag from the user's view —
explainable after the fact. These tests pin that it rides on both outcomes,
and that an AS-compliant drop is tagged with its reason.
"""

from __future__ import annotations

from app.extractors.metrics import Metrics
from app.vision.core.renderer import RenderedImage
import app.vision.plans.vision_pass as vp


def _run(monkeypatch, flags, verifications):
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
        [{"flag_id": 0, "verified": True, "as_compliant": True,
          "verification_note": "cavity shown"}],
    )
    assert not kept and len(drops) == 1
    d = drops[0]
    assert d["dropped_reason"] == "as_compliant"
    # The silent drop is now auditable back to the clause that justified it.
    assert d["mbie_clauses_considered"] == [
        {"document_id": "E2/AS1", "clause_number": "9.1.1"}
    ]


def test_ungrounded_drop_carries_provenance(monkeypatch):
    flags = [{"category": "building_code:E2", "verbatim_quote": "fabricated"}]
    kept, drops, _, _ = _run(
        monkeypatch, flags, [{"flag_id": 0, "verified": False}]
    )
    assert not kept and len(drops) == 1
    assert "mbie_clauses_considered" in drops[0]
