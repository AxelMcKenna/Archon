"""Tests for conversation-history trimming (wire-payload size bounding)."""

from __future__ import annotations

import json
from typing import Any

from app.history import (
    KEEP_RECENT_TURNS,
    MAX_HISTORY_CHARS,
    OLD_TOOL_RESULT_CAP,
    trim_history,
)


def _user(text: str) -> dict[str, Any]:
    return {"role": "user", "content": text}


def _assistant_tool_call(call_id: str, name: str) -> dict[str, Any]:
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": "{}"},
            }
        ],
    }


def _tool_result(call_id: str, content: str) -> dict[str, Any]:
    return {"role": "tool", "tool_call_id": call_id, "content": content}


def _assistant_text(text: str) -> dict[str, Any]:
    return {"role": "assistant", "content": text}


def _turn(idx: int, *, tool_content: str) -> list[dict[str, Any]]:
    """A full turn: user → assistant(tool_call) → tool result → assistant text."""
    return [
        _user(f"question {idx}"),
        _assistant_tool_call(f"call_{idx}", "get_plan_flags"),
        _tool_result(f"call_{idx}", tool_content),
        _assistant_text(f"answer {idx}"),
    ]


def _tool_call_ids(messages: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for m in messages:
        for tc in m.get("tool_calls") or []:
            ids.add(tc["id"])
    return ids


def _tool_result_ids(messages: list[dict[str, Any]]) -> set[str]:
    return {m["tool_call_id"] for m in messages if m.get("role") == "tool"}


def _assert_protocol_valid(messages: list[dict[str, Any]]) -> None:
    """Every assistant tool_call must have a matching tool result, and vice versa."""
    assert _tool_call_ids(messages) == _tool_result_ids(messages)


def test_empty_and_single_turn_passthrough() -> None:
    assert trim_history([]) == []
    one = _turn(0, tool_content="x")
    # A single turn is never trimmed (nothing older to shed).
    assert trim_history(one) == one


def test_does_not_mutate_input() -> None:
    big = "F" * (OLD_TOOL_RESULT_CAP + 5000)
    history = _turn(0, tool_content=big)
    for i in range(1, KEEP_RECENT_TURNS + 2):
        history += _turn(i, tool_content="small")
    snapshot = json.dumps(history)
    trim_history(history)
    assert json.dumps(history) == snapshot  # original untouched


def test_old_fat_tool_results_are_truncated() -> None:
    big = "F" * (OLD_TOOL_RESULT_CAP + 10_000)
    history: list[dict[str, Any]] = _turn(0, tool_content=big)
    for i in range(1, KEEP_RECENT_TURNS + 1):
        history += _turn(i, tool_content="recent")
    out = trim_history(history)

    # The oldest tool result is shrunk...
    old_tool = next(m for m in out if m.get("role") == "tool")
    assert len(old_tool["content"]) < len(big)
    assert "trimmed" in old_tool["content"]
    # ...protocol stays intact.
    _assert_protocol_valid(out)


def test_recent_turns_kept_verbatim() -> None:
    big = "R" * (OLD_TOOL_RESULT_CAP + 10_000)
    history: list[dict[str, Any]] = []
    for i in range(KEEP_RECENT_TURNS + 2):
        history += _turn(i, tool_content="old" if i < 2 else big)
    out = trim_history(history)

    # The most recent turn's fat tool result is preserved in full.
    recent_tool_contents = [
        m["content"] for m in out if m.get("role") == "tool" and m["content"] == big
    ]
    assert recent_tool_contents, "recent fat tool result should survive verbatim"


def test_over_budget_drops_whole_oldest_turns() -> None:
    # Many old turns each with a sizable (but individually capped) tool result,
    # enough that even after truncation the block blows the budget.
    chunk = "Z" * (OLD_TOOL_RESULT_CAP - 1)
    n = (MAX_HISTORY_CHARS // OLD_TOOL_RESULT_CAP) + 20
    history: list[dict[str, Any]] = []
    for i in range(n + KEEP_RECENT_TURNS):
        history += _turn(i, tool_content=chunk)

    out = trim_history(history)

    # Came in under budget by dropping whole oldest turns.
    total = sum(len(m.get("content") or "") for m in out)
    assert total <= MAX_HISTORY_CHARS + (KEEP_RECENT_TURNS * OLD_TOOL_RESULT_CAP)
    # Fewer messages than we started with.
    assert len(out) < len(history)
    # Recent turns survive and protocol is intact.
    _assert_protocol_valid(out)
    assert any(m.get("content") == f"answer {n + KEEP_RECENT_TURNS - 1}" for m in out)


def test_multi_iteration_turn_groups_stay_together() -> None:
    # A single user turn that did two tool round-trips before answering.
    history: list[dict[str, Any]] = [
        _user("complex question"),
        _assistant_tool_call("call_a", "get_project_workflow"),
        _tool_result("call_a", "A" * (OLD_TOOL_RESULT_CAP + 5000)),
        _assistant_tool_call("call_b", "get_plan_flags"),
        _tool_result("call_b", "B" * (OLD_TOOL_RESULT_CAP + 5000)),
        _assistant_text("final answer"),
    ]
    # Add recent turns so the complex turn becomes "old".
    for i in range(KEEP_RECENT_TURNS):
        history += _turn(100 + i, tool_content="recent")

    out = trim_history(history)
    # Both tool calls of the old multi-iteration turn keep their results.
    _assert_protocol_valid(out)
