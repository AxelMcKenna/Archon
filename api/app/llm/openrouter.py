"""OpenRouter wrapper that mirrors the Gemini/Claude tool-use pattern.

OpenRouter speaks the OpenAI Chat Completions schema, so we can talk to
GPT-5 vision, Qwen2.5-VL, Llama 4 vision, and Claude/Gemini variants
with one HTTP client. We always force a single tool call so the parsed
payload shape stays identical to the other providers.

Two entrypoints:

  - ``call_openrouter_tool``        — sync (kept for sync callers like
    the plan analyser's ThreadPoolExecutor pool).
  - ``call_openrouter_tool_async``  — awaitable wrapper for use from
    FastAPI handlers; runs the sync function on a worker thread so the
    event loop stays free for other requests.
"""

from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings
from app.llm.retry import TransientLLMError, call_with_retries

_OR_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass
class OpenRouterResult:
    payload: dict[str, Any]
    input_tokens: int
    output_tokens: int
    model: str


def call_openrouter_tool(
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
) -> OpenRouterResult:
    """Run a single OpenRouter call with a forced tool call.

    `tool_parameters` is a JSONSchema input_schema (same as we hand to
    Anthropic). OpenAI-compatible tool calling accepts JSONSchema
    natively, so unlike Gemini we don't need to strip keys.
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    model_id = model or settings.openrouter_model

    user_content: list[dict[str, Any]] = []
    captions = image_captions or []
    for idx, png in enumerate(images):
        b64 = base64.b64encode(png).decode("ascii")
        user_content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            }
        )
        if idx < len(captions) and captions[idx]:
            user_content.append({"type": "text", "text": captions[idx]})
    user_content.append({"type": "text", "text": prompt})

    body = {
        "model": model_id,
        "max_tokens": max_output_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": user_content}],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": tool_name,
                    "description": tool_description,
                    "parameters": tool_parameters,
                },
            }
        ],
        "tool_choice": {
            "type": "function",
            "function": {"name": tool_name},
        },
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        # OpenRouter asks for a referer/title for usage analytics; harmless
        # but useful when reading their dashboard.
        "HTTP-Referer": settings.openrouter_referer or "https://atlas.local",
        "X-Title": "ATLAS",
    }

    def _once() -> OpenRouterResult:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                f"{_OR_BASE_URL}/chat/completions", headers=headers, json=body
            )
        if resp.status_code >= 400:
            # 429/5xx are provider-transient; let the retry layer see them.
            err = (
                TransientLLMError
                if resp.status_code in {408, 409, 425, 429} or resp.status_code >= 500
                else RuntimeError
            )
            raise err(
                f"OpenRouter call failed ({resp.status_code}): {resp.text[:500]}"
            )
        data = resp.json()

        choices = data.get("choices") or []
        if not choices:
            # Empty/flaky completion — worth another shot.
            raise TransientLLMError(f"OpenRouter returned no choices: {data}")
        msg = choices[0].get("message") or {}
        tool_calls = msg.get("tool_calls") or []
        target = next(
            (
                tc
                for tc in tool_calls
                if tc.get("function", {}).get("name") == tool_name
            ),
            None,
        )
        if target is None:
            raise TransientLLMError(
                f"OpenRouter did not return a tool call for {tool_name}: {msg}"
            )
        raw_args = target["function"].get("arguments") or "{}"
        try:
            payload = (
                raw_args
                if isinstance(raw_args, dict)
                else json.loads(raw_args)
            )
        except json.JSONDecodeError as e:
            raise RuntimeError(f"OpenRouter tool args were not valid JSON: {e}") from e

        usage = data.get("usage") or {}
        return OpenRouterResult(
            payload=payload,
            input_tokens=int(usage.get("prompt_tokens", 0) or 0),
            output_tokens=int(usage.get("completion_tokens", 0) or 0),
            model=str(data.get("model") or model_id),
        )

    return call_with_retries(
        _once, label=f"openrouter:{model_id}", max_attempts=settings.llm_max_attempts
    )


async def call_openrouter_tool_async(
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
) -> OpenRouterResult:
    """Awaitable variant. Offloads the sync call onto a worker thread."""
    return await asyncio.to_thread(
        call_openrouter_tool,
        images=images,
        prompt=prompt,
        tool_name=tool_name,
        tool_description=tool_description,
        tool_parameters=tool_parameters,
        image_captions=image_captions,
        max_output_tokens=max_output_tokens,
        model=model,
        temperature=temperature,
    )
