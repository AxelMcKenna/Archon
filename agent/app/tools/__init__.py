"""Tool registry for the agent loop.

Each tool is exposed as an OpenAI-style function definition (``schema``)
and an async ``execute`` callable. Read tools query Supabase directly;
AI tools POST to existing FastAPI endpoints via ``api_client``.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.tools.classify_rfi_letter import (
    classify_rfi_letter_execute,
    classify_rfi_letter_schema,
)
from app.tools.draft_rfi_response import (
    draft_rfi_response_execute,
    draft_rfi_response_schema,
)
from app.tools.get_plan_flags import get_plan_flags_execute, get_plan_flags_schema
from app.tools.get_project_workflow import (
    get_project_workflow_execute,
    get_project_workflow_schema,
)
from app.tools.get_rfi_letter import get_rfi_letter_execute, get_rfi_letter_schema
from app.tools.read_tab import read_tab_execute, read_tab_schema
from app.tools.score_project_risk import (
    score_project_risk_execute,
    score_project_risk_schema,
)

ToolExecute = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


TOOLS: dict[str, dict[str, Any]] = {
    "read_tab": {"schema": read_tab_schema(), "execute": read_tab_execute},
    "get_plan_flags": {
        "schema": get_plan_flags_schema(),
        "execute": get_plan_flags_execute,
    },
    "get_project_workflow": {
        "schema": get_project_workflow_schema(),
        "execute": get_project_workflow_execute,
    },
    "get_rfi_letter": {
        "schema": get_rfi_letter_schema(),
        "execute": get_rfi_letter_execute,
    },
    "classify_rfi_letter": {
        "schema": classify_rfi_letter_schema(),
        "execute": classify_rfi_letter_execute,
    },
    "draft_rfi_response": {
        "schema": draft_rfi_response_schema(),
        "execute": draft_rfi_response_execute,
    },
    "score_project_risk": {
        "schema": score_project_risk_schema(),
        "execute": score_project_risk_execute,
    },
}


def openai_tool_definitions() -> list[dict[str, Any]]:
    return [{"type": "function", "function": t["schema"]} for t in TOOLS.values()]


async def execute_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"unknown tool: {name}"}
    try:
        return await tool["execute"](arguments)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}
