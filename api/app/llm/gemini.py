"""Thin Gemini wrapper that mirrors our Claude tool-use pattern.

Both touchpoints (plan analyser, plan verifier, RFI extractor) share the
same shape: send images + a text prompt, force a single function call,
return the parsed payload. This module hides the SDK differences so the
caller code stays identical to the Claude path.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import types

from app.config import get_settings
from app.llm.retry import TransientLLMError, call_with_retries


@dataclass
class GeminiResult:
    payload: dict[str, Any]
    input_tokens: int
    output_tokens: int


_STRIP_KEYS = {
    "$schema",
    "additionalProperties",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "format",
    "pattern",
    "default",
    "examples",
    "title",
    "description",
}


def _strip_unsupported_keys(schema: Any) -> Any:
    """Gemini's function-declaration schema is JSONSchema-ish but stricter
    on state-space complexity. Drop bounds + descriptive keys that Claude
    accepts but Gemini rejects (or that blow up the state count when an
    array/enum sits inside another array).
    """
    if isinstance(schema, dict):
        out: dict[str, Any] = {}
        for k, v in schema.items():
            if k in _STRIP_KEYS:
                continue
            out[k] = _strip_unsupported_keys(v)
        if "enum" in out and "type" not in out:
            out["type"] = "string"
        return out
    if isinstance(schema, list):
        return [_strip_unsupported_keys(x) for x in schema]
    return schema


def call_gemini_tool(
    *,
    images: list[bytes],
    prompt: str,
    tool_name: str,
    tool_description: str,
    tool_parameters: dict[str, Any],
    image_captions: list[str] | None = None,
    max_output_tokens: int = 6000,
    model: str | None = None,
    temperature: float = 0.0,
    seed: int | None = None,
) -> GeminiResult:
    """Run a single Gemini call with a forced function call.

    Returns the parsed function-call args (same shape Claude's tool_use
    payload would have) plus token usage.

    ``seed`` pins Gemini's sampler for best-effort reproducibility. Note this
    only bites at ``temperature > 0`` (greedy decoding has no sampling RNG to
    seed); at ``temperature == 0`` residual jitter comes from batch/MoE
    non-determinism the seed can't control. Left ``None`` the field is unset.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=settings.gemini_api_key)
    model_id = model or settings.gemini_model

    parts: list[Any] = []
    captions = image_captions or []
    for idx, png in enumerate(images):
        parts.append(types.Part.from_bytes(data=png, mime_type="image/png"))
        if idx < len(captions) and captions[idx]:
            parts.append(types.Part.from_text(text=captions[idx]))
    parts.append(types.Part.from_text(text=prompt))

    fn = types.FunctionDeclaration(
        name=tool_name,
        description=tool_description,
        parameters=_strip_unsupported_keys(tool_parameters),
    )
    config = types.GenerateContentConfig(
        tools=[types.Tool(function_declarations=[fn])],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode="ANY",
                allowed_function_names=[tool_name],
            )
        ),
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        seed=seed,
        # Pinned so a provider-default change can't alter sampling behaviour
        # under us, and so both providers sample the same way (a fallback swap
        # doesn't also change the sampling shape). With a seed at
        # temperature > 0 this keeps each pass best-effort reproducible
        # (wiki/issues/0001).
        top_p=1.0,
    )

    def _once() -> GeminiResult:
        response = client.models.generate_content(
            model=model_id,
            contents=[types.Content(role="user", parts=parts)],
            config=config,
        )

        payload: dict[str, Any] = {}
        candidates = response.candidates or []
        if candidates and candidates[0].content and candidates[0].content.parts:
            for part in candidates[0].content.parts:
                fc = getattr(part, "function_call", None)
                if fc and fc.name == tool_name:
                    payload = dict(fc.args or {})
                    break
        if not payload:
            # Empty/flaky completion (often a transient safety-block or
            # truncation) — worth another attempt.
            raise TransientLLMError(
                f"Gemini did not return a function call for {tool_name}"
            )

        usage = response.usage_metadata
        return GeminiResult(
            payload=payload,
            input_tokens=int(getattr(usage, "prompt_token_count", 0) or 0),
            output_tokens=int(getattr(usage, "candidates_token_count", 0) or 0),
        )

    return call_with_retries(
        _once, label=f"gemini:{model_id}", max_attempts=settings.llm_max_attempts
    )


async def call_gemini_tool_async(
    *,
    images: list[bytes],
    prompt: str,
    tool_name: str,
    tool_description: str,
    tool_parameters: dict[str, Any],
    image_captions: list[str] | None = None,
    max_output_tokens: int = 6000,
    model: str | None = None,
    temperature: float = 0.0,
    seed: int | None = None,
) -> GeminiResult:
    """Awaitable variant. Offloads the sync call onto a worker thread."""
    return await asyncio.to_thread(
        call_gemini_tool,
        images=images,
        prompt=prompt,
        tool_name=tool_name,
        tool_description=tool_description,
        tool_parameters=tool_parameters,
        image_captions=image_captions,
        max_output_tokens=max_output_tokens,
        model=model,
        temperature=temperature,
        seed=seed,
    )
