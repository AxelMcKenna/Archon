"""Tests for LLM retry/backoff and cross-provider fail-over."""

from __future__ import annotations

import httpx
import pytest

from app.llm.retry import TransientLLMError, call_with_retries, is_retryable


def test_retries_transient_then_succeeds():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise TransientLLMError("blip")
        return "ok"

    assert call_with_retries(flaky, label="t", max_attempts=3, base_delay=0) == "ok"
    assert calls["n"] == 3


def test_exhausts_attempts_and_reraises():
    calls = {"n": 0}

    def always_fail():
        calls["n"] += 1
        raise TransientLLMError("down")

    with pytest.raises(TransientLLMError):
        call_with_retries(always_fail, label="t", max_attempts=3, base_delay=0)
    assert calls["n"] == 3


def test_non_retryable_raises_immediately():
    calls = {"n": 0}

    def bad_request():
        calls["n"] += 1
        raise ValueError("malformed schema")

    with pytest.raises(ValueError):
        call_with_retries(bad_request, label="t", max_attempts=5, base_delay=0)
    assert calls["n"] == 1  # no retries on a non-transient error


def test_is_retryable_classification():
    assert is_retryable(TransientLLMError("x"))
    assert is_retryable(httpx.ConnectTimeout("x"))
    assert is_retryable(httpx.ReadError("x"))
    assert not is_retryable(RuntimeError("401 unauthorized"))
    assert not is_retryable(ValueError("nope"))


def test_status_code_attribute_is_retryable():
    """SDK-style errors that expose a numeric ``.code`` are classified by it."""

    class FakeSDKError(Exception):
        code = 503

    class FakeClientError(Exception):
        code = 400

    assert is_retryable(FakeSDKError())
    assert not is_retryable(FakeClientError())


def test_provider_fallback_used_on_primary_failure(monkeypatch):
    from app.vision.core import invoker

    monkeypatch.setattr(
        invoker, "_fallback_for", lambda provider, model: ("gemini", "g-model")
    )

    seen: list[str] = []

    def fake_dispatch(provider, model, **kw):
        seen.append(provider)
        if provider == "openrouter":
            raise TransientLLMError("primary down")
        return ({"flags": []}, 1, 2)

    monkeypatch.setattr(invoker, "_dispatch", fake_dispatch)

    provenance: dict = {}
    payload, _in, _out = invoker.invoke_tool(
        provider="openrouter",
        model="gpt-5",
        images=[b""],
        prompt="p",
        tool_name="t",
        tool_description="d",
        tool_parameters={},
        provenance=provenance,
    )
    assert payload == {"flags": []}
    assert seen == ["openrouter", "gemini"]  # tried primary, then failed over
    # The swap is recorded, not silent: provenance names the serving model.
    assert provenance["fallback"] is True
    assert provenance["provider"] == "gemini"
    assert provenance["model"] == "g-model"
    assert "primary down" in provenance["fallback_reason"]


def test_fallback_surfaces_original_error_when_both_fail(monkeypatch):
    from app.vision.core import invoker

    monkeypatch.setattr(
        invoker, "_fallback_for", lambda provider, model: ("gemini", "g-model")
    )

    def fake_dispatch(provider, model, **kw):
        raise TransientLLMError(f"{provider} down")

    monkeypatch.setattr(invoker, "_dispatch", fake_dispatch)

    with pytest.raises(TransientLLMError, match="openrouter down"):
        invoker.invoke_tool(
            provider="openrouter",
            model="gpt-5",
            images=[b""],
            prompt="p",
            tool_name="t",
            tool_description="d",
            tool_parameters={},
        )
