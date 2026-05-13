"""Streaming chat-completions wrapper for OpenRouter with auto tool-use.

Different from `api/app/llm/openrouter.py` (which forces a single tool call).
This module yields incremental events so the agent loop can re-stream them
as SSE to the browser, and supports the standard tool_call → tool_result
→ next-turn loop.

Yields events of the form:
    {"type": "text_delta", "text": "..."}
    {"type": "tool_call_delta", "index": 0, "id": "...", "name": "...", "arguments_delta": "..."}
    {"type": "tool_call_complete", "index": 0, "id": "...", "name": "...", "arguments": {...}}
    {"type": "message_complete", "finish_reason": "stop|tool_calls", "usage": {...}}
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import get_settings

_OR_BASE_URL = "https://openrouter.ai/api/v1"


async def stream_chat(
    *,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
    max_output_tokens: int = 4000,
    temperature: float = 0.2,
) -> AsyncIterator[dict[str, Any]]:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    body: dict[str, Any] = {
        "model": model or settings.agent_orchestrator_model,
        "messages": messages,
        "max_tokens": max_output_tokens,
        "temperature": temperature,
        "stream": True,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "HTTP-Referer": settings.openrouter_referer or "https://atlas.local",
        "X-Title": "ATLAS-Agent",
    }

    # Accumulators across deltas in a single response.
    tool_calls: dict[int, dict[str, Any]] = {}
    finish_reason: str | None = None
    usage: dict[str, Any] = {}

    async with (
        httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client,
        client.stream(
            "POST",
            f"{_OR_BASE_URL}/chat/completions",
            headers=headers,
            json=body,
        ) as resp,
    ):
        if resp.status_code >= 400:
            err = (await resp.aread()).decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"OpenRouter stream failed ({resp.status_code}): {err}")

        async for line in resp.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue

            # Some providers (or OpenRouter's own keepalives) ship comments.
            if not chunk.get("choices"):
                if chunk.get("usage"):
                    usage = chunk["usage"]
                continue

            choice = chunk["choices"][0]
            delta = choice.get("delta") or {}
            content_piece = delta.get("content")
            if content_piece:
                yield {"type": "text_delta", "text": content_piece}

            for tc_delta in delta.get("tool_calls") or []:
                idx = tc_delta.get("index", 0)
                slot = tool_calls.setdefault(
                    idx,
                    {"id": "", "name": "", "arguments": ""},
                )
                if tc_delta.get("id"):
                    slot["id"] = tc_delta["id"]
                fn = tc_delta.get("function") or {}
                if fn.get("name"):
                    slot["name"] = fn["name"]
                if fn.get("arguments"):
                    slot["arguments"] += fn["arguments"]
                    yield {
                        "type": "tool_call_delta",
                        "index": idx,
                        "id": slot["id"],
                        "name": slot["name"],
                        "arguments_delta": fn["arguments"],
                    }

            if choice.get("finish_reason"):
                finish_reason = choice["finish_reason"]

            if chunk.get("usage"):
                usage = chunk["usage"]

    # Emit completed tool-call objects (parsed args) so the loop can execute them.
    for idx in sorted(tool_calls.keys()):
        slot = tool_calls[idx]
        try:
            args = json.loads(slot["arguments"]) if slot["arguments"] else {}
        except json.JSONDecodeError as exc:
            yield {
                "type": "tool_call_error",
                "index": idx,
                "id": slot["id"],
                "name": slot["name"],
                "error": f"invalid JSON arguments: {exc}",
                "raw": slot["arguments"][:500],
            }
            continue
        yield {
            "type": "tool_call_complete",
            "index": idx,
            "id": slot["id"],
            "name": slot["name"],
            "arguments": args,
        }

    yield {
        "type": "message_complete",
        "finish_reason": finish_reason or "stop",
        "usage": usage,
    }
