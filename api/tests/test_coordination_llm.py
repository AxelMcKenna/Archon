"""Tier 2 — LLM spec↔drawing reconciliation. The provider call is mocked, so
these assert the mapping/grounding/fail-open behaviour, not the model."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.coordination import llm_reconcile
from app.coordination.llm_reconcile import (
    llm_flag_signature,
    reconcile_documents_llm,
)

_SETTINGS = SimpleNamespace(
    classifier_provider="gemini",
    gemini_model="gemini-x",
    openrouter_model="or-x",
)


def _specs() -> list[tuple[dict, dict]]:
    return [({"id": "spec-1", "filename": "spec.pdf"}, {"sections": []})]


def _drawings() -> list[tuple[dict, dict]]:
    return [({"id": "draw-1", "filename": "plans.pdf"}, {"title_blocks": []})]


def _patch_llm(monkeypatch, payload: dict) -> None:
    monkeypatch.setattr(
        llm_reconcile,
        "call_gemini_tool",
        lambda **kw: SimpleNamespace(payload=payload, input_tokens=1, output_tokens=1),
    )


def _discrepancy(**over) -> dict:
    base = {
        "area": "Sprinkler system mismatch",
        "severity": "must_resolve",
        "confidence": "high",
        "reason": "The spec specifies sprinklers but the fire plan shows none.",
        "recommended_action": "Reconcile the two.",
        "spec_ref": "spec-1",
        "spec_quote": "sprinkler system to NZS 4541",
        "drawing_ref": "draw-1",
        "drawing_quote": "no sprinkler shown",
    }
    base.update(over)
    return base


class TestReconcile:
    def test_maps_discrepancy_to_two_citation_flag(self, monkeypatch) -> None:
        _patch_llm(monkeypatch, {"discrepancies": [_discrepancy()]})
        flags = reconcile_documents_llm(
            specs=_specs(), drawings=_drawings(), settings=_SETTINGS
        )
        assert len(flags) == 1
        f = flags[0]
        assert f["tier"] == "llm"
        assert f["category"] == "documentation:plans:design_coordination"
        kinds = {c["source_kind"]: c["source_id"] for c in f["citations"]}
        assert kinds == {"spec": "spec-1", "drawing": "draw-1"}

    def test_drops_ungrounded_ref(self, monkeypatch) -> None:
        _patch_llm(monkeypatch, {"discrepancies": [_discrepancy(spec_ref="ghost")]})
        assert reconcile_documents_llm(
            specs=_specs(), drawings=_drawings(), settings=_SETTINGS
        ) == []

    def test_drops_missing_quote(self, monkeypatch) -> None:
        _patch_llm(monkeypatch, {"discrepancies": [_discrepancy(drawing_quote="")]})
        assert reconcile_documents_llm(
            specs=_specs(), drawings=_drawings(), settings=_SETTINGS
        ) == []

    def test_no_specs_or_drawings_short_circuits(self) -> None:
        # Must not even attempt an LLM call (no monkeypatch needed).
        assert reconcile_documents_llm(specs=[], drawings=_drawings(), settings=_SETTINGS) == []
        assert reconcile_documents_llm(specs=_specs(), drawings=[], settings=_SETTINGS) == []

    def test_fail_open_on_provider_error(self, monkeypatch) -> None:
        def _boom(**kw):
            raise RuntimeError("provider down")

        monkeypatch.setattr(llm_reconcile, "call_gemini_tool", _boom)
        assert reconcile_documents_llm(
            specs=_specs(), drawings=_drawings(), settings=_SETTINGS
        ) == []

    def test_project_context_threads_into_prompt(self, monkeypatch) -> None:
        captured: dict = {}

        def _cap(**kw):
            captured.update(kw)
            return SimpleNamespace(payload={"discrepancies": []})

        monkeypatch.setattr(llm_reconcile, "call_gemini_tool", _cap)
        reconcile_documents_llm(
            specs=_specs(),
            drawings=_drawings(),
            settings=_SETTINGS,
            project_context={"project_type": "commercial_office", "estimated_floor_area_m2": 1200},
        )
        assert "commercial_office" in captured["prompt"]
        assert "1200" in captured["prompt"]

    def test_openrouter_branch(self, monkeypatch) -> None:
        called = {}

        def _or(**kw):
            called["hit"] = True
            return SimpleNamespace(payload={"discrepancies": [_discrepancy()]})

        monkeypatch.setattr(llm_reconcile, "call_openrouter_tool", _or)
        settings = SimpleNamespace(
            classifier_provider="openrouter", gemini_model="g", openrouter_model="or"
        )
        flags = reconcile_documents_llm(
            specs=_specs(), drawings=_drawings(), settings=settings
        )
        assert called.get("hit") is True
        assert len(flags) == 1


class TestSignature:
    def test_stable_and_pair_sensitive(self) -> None:
        a = {
            "area": "Sprinkler mismatch",
            "citations": [
                {"source_id": "spec-1"},
                {"source_id": "draw-1"},
            ],
        }
        b = {
            "area": "Sprinkler  MISMATCH!!",  # normalizes to the same token
            "citations": [{"source_id": "draw-1"}, {"source_id": "spec-1"}],
        }
        assert llm_flag_signature(a) == llm_flag_signature(b)

    def test_different_docs_differ(self) -> None:
        a = {"area": "x", "citations": [{"source_id": "spec-1"}, {"source_id": "draw-1"}]}
        b = {"area": "x", "citations": [{"source_id": "spec-2"}, {"source_id": "draw-1"}]}
        assert llm_flag_signature(a) != llm_flag_signature(b)


@pytest.mark.parametrize("provider", ["gemini", "openrouter"])
def test_empty_discrepancies(monkeypatch, provider: str) -> None:
    target = "call_gemini_tool" if provider == "gemini" else "call_openrouter_tool"
    monkeypatch.setattr(
        llm_reconcile, target, lambda **kw: SimpleNamespace(payload={"discrepancies": []})
    )
    settings = SimpleNamespace(
        classifier_provider=provider, gemini_model="g", openrouter_model="or"
    )
    assert reconcile_documents_llm(
        specs=_specs(), drawings=_drawings(), settings=settings
    ) == []
