"""Conversation-history trimming for the agent wire payload.

The agent loop persists the *full* message list (assistant turns with
tool_calls + ``role: tool`` results) so a conversation has its prior tool
outputs available. But fat tool results — ``get_plan_flags`` inlines up to
200 flags, ``get_project_workflow`` aggregates four domains — get replayed on
every subsequent turn, so a long session's prompt grows without bound.

``trim_history`` produces a *shrunken copy* for the wire payload only; the
stored history is left intact (the in-memory store already bounds itself by
conversation count + TTL). The trim is structure-preserving: it never breaks
the OpenAI tool-call protocol (an assistant message carrying ``tool_calls``
must be followed by a ``role: tool`` message for each call), because it only
ever (a) shrinks an old tool result's ``content`` in place, or (b) drops a
whole turn — the user message, its assistant turns, and their tool results
together.

Tunables are deliberately generous: the goal is to cap pathological growth,
not to aggressively prune normal conversations.
"""

from __future__ import annotations

import json
from typing import Any

# Most recent turns kept verbatim (full-fidelity tool results). A "turn" is a
# user message and everything the assistant produced in reply, up to the next
# user message.
KEEP_RECENT_TURNS = 3

# Older ``role: tool`` results are truncated to this many characters. Enough to
# keep the gist (the model already acted on them when they were fresh); the
# 200-flag JSON blobs are what we're shedding.
OLD_TOOL_RESULT_CAP = 800

# Soft ceiling on total history characters (~15k tokens). Once exceeded, whole
# oldest turns are dropped until under budget — but the recent window is always
# kept, so a single huge recent turn can still exceed this.
MAX_HISTORY_CHARS = 60_000

_ELISION = "\n…[older tool result trimmed to save context]"


def _content_len(msg: dict[str, Any]) -> int:
    content = msg.get("content")
    n = len(content) if isinstance(content, str) else 0
    for tc in msg.get("tool_calls") or []:
        n += len(json.dumps(tc.get("function", {}).get("arguments", "")))
    return n


def _total_chars(messages: list[dict[str, Any]]) -> int:
    return sum(_content_len(m) for m in messages)


def _split_turns(history: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group messages into turns delimited by ``role: user`` messages.

    Any leading non-user messages (shouldn't happen, but be defensive) form a
    turn of their own so nothing is silently dropped.
    """
    turns: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for msg in history:
        if msg.get("role") == "user" and current:
            turns.append(current)
            current = []
        current.append(msg)
    if current:
        turns.append(current)
    return turns


def _shrink_old_tool_results(turn: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a copy of ``turn`` with oversized tool results truncated."""
    out: list[dict[str, Any]] = []
    for msg in turn:
        content = msg.get("content")
        if (
            msg.get("role") == "tool"
            and isinstance(content, str)
            and len(content) > OLD_TOOL_RESULT_CAP
        ):
            shrunk = dict(msg)
            shrunk["content"] = content[:OLD_TOOL_RESULT_CAP] + _ELISION
            out.append(shrunk)
        else:
            out.append(msg)
    return out


def trim_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a wire-safe, size-bounded copy of ``history``.

    Recent turns are kept verbatim; older turns have their fat tool results
    truncated; if still over budget, whole oldest turns are dropped. The
    original list is never mutated.
    """
    if not history:
        return history

    turns = _split_turns(history)
    if len(turns) <= 1:
        return history

    split = max(0, len(turns) - KEEP_RECENT_TURNS)
    old_turns = [_shrink_old_tool_results(t) for t in turns[:split]]
    recent_turns = turns[split:]

    # Drop whole oldest turns while the (already-shrunk) older block keeps the
    # total over budget. Recent turns are never dropped.
    while old_turns and (
        _total_chars([m for t in old_turns for m in t])
        + _total_chars([m for t in recent_turns for m in t])
        > MAX_HISTORY_CHARS
    ):
        old_turns.pop(0)

    return [m for t in (old_turns + recent_turns) for m in t]
