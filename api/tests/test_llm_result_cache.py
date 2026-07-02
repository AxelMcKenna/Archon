"""Shared write-once LLM result cache (wiki/issues/0007).

Pins the semantics that make classification/draft answers stable across
workers: first persisted answer wins globally, later writers adopt it, and
any cache failure degrades to local behaviour without breaking the pipeline.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import app.classifier.ai as ai
from app.llm import result_cache
from app.models import AiPrediction, ExtractedEntities, RfiItem


class _FakeTable:
    def __init__(self, store: dict[str, Any]) -> None:
        self.store = store
        self._mode = ""
        self._key: str | None = None
        self._row: dict[str, Any] | None = None

    def select(self, cols: str) -> _FakeTable:
        self._mode = "select"
        return self

    def eq(self, col: str, val: str) -> _FakeTable:
        self._key = val
        return self

    def limit(self, n: int) -> _FakeTable:
        return self

    def upsert(self, row: dict[str, Any], **kw: Any) -> _FakeTable:
        assert kw.get("ignore_duplicates") is True  # write-once, never overwrite
        self._mode = "upsert"
        self._row = row
        return self

    def execute(self) -> SimpleNamespace:
        if self._mode == "select":
            assert self._key is not None
            hit = self.store.get(self._key)
            return SimpleNamespace(data=[{"value": hit}] if hit is not None else [])
        assert self._row is not None
        self.store.setdefault(self._row["key"], self._row["value"])
        return SimpleNamespace(data=[])


class _FakeDB:
    def __init__(self) -> None:
        self.store: dict[str, Any] = {}

    def table(self, name: str) -> _FakeTable:
        assert name == "llm_cache"
        return _FakeTable(self.store)


def test_put_then_get_roundtrip(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(result_cache, "get_service_db", lambda: db)
    won = result_cache.put("draft", "k1", {"draft_text": "hello"})
    assert won == {"draft_text": "hello"}
    assert result_cache.get("draft", "k1") == {"draft_text": "hello"}


def test_first_writer_wins_globally(monkeypatch):
    # Another worker already published for this key — our put must return
    # THEIR value so every worker converges on one answer.
    db = _FakeDB()
    db.store["k1"] = {"draft_text": "first worker's answer"}
    monkeypatch.setattr(result_cache, "get_service_db", lambda: db)
    won = result_cache.put("draft", "k1", {"draft_text": "our later answer"})
    assert won == {"draft_text": "first worker's answer"}


def test_cache_failure_degrades_to_local(monkeypatch):
    def _boom() -> Any:
        raise RuntimeError("db down")

    monkeypatch.setattr(result_cache, "get_service_db", _boom)
    assert result_cache.get("draft", "k1") is None
    assert result_cache.put("draft", "k1", {"draft_text": "x"}) == {"draft_text": "x"}


def _item() -> RfiItem:
    return RfiItem(
        item_id="i1",
        raw_text="Provide smoke alarm locations",
        extracted=ExtractedEntities(),
    )


def test_classifier_serves_shared_cache_without_model_call(monkeypatch):
    monkeypatch.setattr(ai, "_AI_CACHE", {})
    cached = AiPrediction(
        primary_category="fire_safety",
        severity="must_resolve",
        confidence="high",
        reasoning="cached by another worker",
        prompt_version="1.0",
    )
    monkeypatch.setattr(
        ai.result_cache, "get", lambda kind, key: cached.model_dump(mode="json")
    )

    def _no_model_call(**kw: Any) -> Any:
        raise AssertionError("model must not be called on a shared-cache hit")

    monkeypatch.setattr(ai, "call_gemini_tool", _no_model_call)
    monkeypatch.setattr(ai, "call_openrouter_tool", _no_model_call)

    pred = ai.classify(
        _item(), bca="Auckland", project_type="new_dwelling", project_description=""
    )
    assert pred.reasoning == "cached by another worker"


def test_classifier_adopts_race_winner_on_publish(monkeypatch):
    # Our model call produced one answer, but another worker published first:
    # classify must return (and L1-cache) the winner, not our local roll.
    monkeypatch.setattr(ai, "_AI_CACHE", {})
    monkeypatch.setattr(ai.result_cache, "get", lambda kind, key: None)
    winner = {
        "primary_category": "fire_safety",
        "secondary_category": None,
        "severity": "must_resolve",
        "confidence": "high",
        "reasoning": "the winning roll",
        "prompt_version": "1.0",
    }
    monkeypatch.setattr(ai.result_cache, "put", lambda kind, key, value, **kw: winner)
    monkeypatch.setattr(
        ai,
        "call_gemini_tool",
        lambda **kw: SimpleNamespace(
            payload={
                "primary_category": "fire_safety",
                "severity": "must_resolve",
                "confidence": "medium",
                "reasoning": "our local roll",
            },
            input_tokens=1,
            output_tokens=1,
        ),
    )
    pred = ai.classify(
        _item(), bca="Auckland", project_type="new_dwelling", project_description=""
    )
    assert pred.reasoning == "the winning roll"
