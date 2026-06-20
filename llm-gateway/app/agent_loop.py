"""Multi-turn llm-gateway loop: model → tool calls → tool results → model → …

Yields SSE-shaped event dicts that ``routes/chat.py`` re-streams to the
browser. Caps tool-iteration depth defensively.

The caller passes a mutable ``history`` list (NOT including the system
prompt — that's rebuilt per request from the active tab). The loop appends
each new assistant turn (with its tool_calls) and each tool-result message
into ``history`` so the route can persist it for the next user turn.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from app.history import trim_history
from app.llm.openrouter_chat import stream_chat
from app.prompts.system import build_system_messages
from app.tools import execute_tool, openai_tool_definitions

MAX_TOOL_ITERATIONS = 5


async def run_agent(
    *,
    history: list[dict[str, Any]],
    project_id: str,
    tab: str | None,
    route: str | None,
) -> AsyncIterator[dict[str, Any]]:
    """Drive the llm-gateway loop. Mutates ``history`` in place with new turns."""

    tools = openai_tool_definitions()

    for _iteration in range(MAX_TOOL_ITERATIONS):
        # Rebuild the wire payload each turn: fresh system prompt (tab can
        # change between user turns) + the persisted history. ``trim_history``
        # bounds the wire size — old fat tool results (200-flag blobs) are
        # shed so a long session doesn't grow the prompt without limit. The
        # persisted ``history`` itself is left intact.
        wire_messages = build_system_messages(
            project_id=project_id, tab=tab, route=route
        ) + trim_history(history)

        assistant_text_parts: list[str] = []
        completed_tool_calls: list[dict[str, Any]] = []
        bad_tool_calls: list[dict[str, Any]] = []
        seen_delta_keys: set[tuple[int, str]] = set()
        finish_reason = "stop"

        async for event in stream_chat(messages=wire_messages, tools=tools):
            etype = event["type"]
            if etype == "text_delta":
                assistant_text_parts.append(event["text"])
                yield {"type": "token", "text": event["text"]}
            elif etype == "tool_call_delta":
                key = (event["index"], event["name"])
                if key in seen_delta_keys:
                    continue
                seen_delta_keys.add(key)
                yield {
                    "type": "tool_call_delta",
                    "index": event["index"],
                    "id": event["id"],
                    "name": event["name"],
                }
            elif etype == "tool_call_complete":
                completed_tool_calls.append(event)
                yield {
                    "type": "tool_call",
                    "id": event["id"],
                    "name": event["name"],
                    "arguments": event["arguments"],
                }
            elif etype == "tool_call_error":
                bad_tool_calls.append(event)
                yield {
                    "type": "tool_error",
                    "id": event["id"],
                    "name": event["name"],
                    "error": event["error"],
                }
            elif etype == "message_complete":
                finish_reason = event["finish_reason"]

        # Persist the assistant turn into history so the next user turn
        # can reference its tool_calls.
        assistant_msg: dict[str, Any] = {
            "role": "assistant",
            "content": "".join(assistant_text_parts) or None,
        }
        if completed_tool_calls:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in completed_tool_calls
            ]
        history.append(assistant_msg)

        # Synthetic tool results for malformed tool calls — keeps the model
        # unblocked and lets it retry instead of hanging.
        for bad in bad_tool_calls:
            history.append(
                {
                    "role": "tool",
                    "tool_call_id": bad["id"],
                    "content": json.dumps({"error": bad["error"]}),
                }
            )

        if finish_reason != "tool_calls" or not completed_tool_calls:
            if bad_tool_calls:
                continue
            break

        for tc in completed_tool_calls:
            result = await execute_tool(tc["name"], tc["arguments"])
            yield {
                "type": "tool_result",
                "id": tc["id"],
                "name": tc["name"],
                "result": result,
            }
            history.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result, default=str),
                }
            )

    yield {"type": "done"}
