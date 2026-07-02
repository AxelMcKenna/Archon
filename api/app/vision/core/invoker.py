"""Provider dispatch for a single forced tool call.

Collapses the ``if provider == "openrouter": ... else: ...`` block that
otherwise appears at every vision call site, and adds cross-provider
fail-over on top of each provider's internal retries.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import get_settings
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool

log = logging.getLogger(__name__)


def analyser_provider_model(settings: Any) -> tuple[str, str]:
    """Resolve ``(provider, model)`` for the plan-analyser tier from settings.

    Both the RFI and VE vision passes (and their service-layer cache keys) pick
    the provider/model the same way; centralised here so they can't drift.
    """
    provider = settings.plan_analyser_provider
    model = (
        settings.openrouter_model
        if provider == "openrouter"
        else settings.gemini_model
    )
    return provider, model


def secondary_analyser_provider_model(settings: Any) -> tuple[str, str] | None:
    """The *other* provider's analyser-tier (provider, model), or None when its
    API key isn't configured. Used by the ensemble mechanism
    (``plan_analyser_ensemble``) to run voting passes on both model families.
    """
    primary, _ = analyser_provider_model(settings)
    if primary == "gemini":
        if settings.openrouter_api_key:
            return "openrouter", settings.openrouter_model
        return None
    if settings.gemini_api_key:
        return "gemini", settings.gemini_model
    return None


def run_tool_pass(
    *,
    settings: Any,
    schema: dict[str, Any],
    images: list[bytes],
    captions: list[str] | None,
    prompt: str,
    max_output_tokens: int = 6000,
    temperature: float = 0.0,
    seed: int | None = None,
    provenance: dict[str, Any] | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> tuple[dict[str, Any], int, int]:
    """Run one analyser-tier tool call from a ``{name, description,
    input_schema}`` schema dict. Returns (payload, input_tokens, output_tokens).

    Shared by the RFI and VE vision passes — they differ only in which schema
    and token budget they hand in. ``seed`` and ``provenance`` are forwarded
    for best-effort reproducibility / fallback auditing (see ``invoke_tool``).
    ``provider``/``model`` override the settings-resolved analyser pair (both
    must be given together) — the ensemble uses this to route passes to the
    secondary provider.
    """
    if provider is None or model is None:
        provider, model = analyser_provider_model(settings)
    return invoke_tool(
        provider=provider,
        model=model,
        images=images,
        image_captions=captions,
        prompt=prompt,
        tool_name=schema["name"],
        tool_description=schema["description"],
        tool_parameters=schema["input_schema"],
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        seed=seed,
        provenance=provenance,
    )


def _dispatch(provider: str, model: str, **kw: Any) -> tuple[dict[str, Any], int, int]:
    if provider == "openrouter":
        r = call_openrouter_tool(model=model, **kw)
    else:
        r = call_gemini_tool(model=model, **kw)
    return r.payload, r.input_tokens, r.output_tokens


def _fallback_for(provider: str, model: str) -> tuple[str, str] | None:
    """Return (provider, model) to fail over to, or None if unavailable.

    Outage-survival that stays in the same capability tier: a verifier-tier
    model fails over to the other provider's verifier model, everything else
    to the other provider's analyser default — so a transient 429 never swaps
    an analyser-tier model in for the verifier (or vice versa).
    """
    s = get_settings()
    if provider == "openrouter" and s.gemini_api_key:
        if model == s.openrouter_verifier_model:
            return "gemini", s.gemini_verifier_model
        return "gemini", s.gemini_model
    if provider == "gemini" and s.openrouter_api_key:
        if model == s.gemini_verifier_model:
            return "openrouter", s.openrouter_verifier_model
        return "openrouter", s.openrouter_model
    return None


def invoke_tool(
    *,
    provider: str,
    model: str,
    images: list[bytes],
    prompt: str,
    tool_name: str,
    tool_description: str,
    tool_parameters: dict[str, Any],
    image_captions: list[str] | None = None,
    max_output_tokens: int = 6000,
    temperature: float = 0.0,
    seed: int | None = None,
    provenance: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], int, int]:
    """Run one vision tool call. Returns (payload, input_tokens, output_tokens).

    Each provider call already retries transient failures internally; if it
    still fails and ``llm_provider_fallback`` is enabled, we fail over to the
    other provider once before surfacing the original error.

    ``seed`` is passed to whichever provider serves the call (including the
    fail-over provider) for best-effort reproducible sampling.

    ``provenance``, if given, is filled in-place with which provider/model
    actually answered (``{"provider", "model", "fallback", "fallback_reason"?}``)
    so a silent cross-provider swap is auditable after the fact.
    """
    kw: dict[str, Any] = dict(
        images=images,
        image_captions=image_captions,
        prompt=prompt,
        tool_name=tool_name,
        tool_description=tool_description,
        tool_parameters=tool_parameters,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        seed=seed,
    )
    try:
        result = _dispatch(provider, model, **kw)
        if provenance is not None:
            provenance.update(provider=provider, model=model, fallback=False)
        return result
    except Exception as primary_exc:
        fb = (
            _fallback_for(provider, model)
            if get_settings().llm_provider_fallback
            else None
        )
        if not fb:
            raise
        fb_provider, fb_model = fb
        log.warning(
            "provider %s/%s failed (%s); failing over to %s/%s",
            provider,
            model,
            primary_exc,
            fb_provider,
            fb_model,
        )
        try:
            result = _dispatch(fb_provider, fb_model, **kw)
        except Exception:
            # Fallback also failed — surface the original (more informative) error
            # and drop the fallback's traceback to keep the chain readable.
            raise primary_exc from None
        if provenance is not None:
            provenance.update(
                provider=fb_provider,
                model=fb_model,
                fallback=True,
                fallback_reason=str(primary_exc),
            )
        return result
