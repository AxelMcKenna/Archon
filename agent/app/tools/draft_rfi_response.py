"""draft_rfi_response: generate an AI draft for one RFI item via POST /draft/{item_id}.

Item must already be classified — drafter returns 409 otherwise; we surface
that as a structured error so the agent can tell the user to classify first.
"""

from __future__ import annotations

from typing import Any

from app.tools.api_client import api_request


def draft_rfi_response_schema() -> dict[str, Any]:
    return {
        "name": "draft_rfi_response",
        "description": (
            "Generate (or regenerate) an AI draft response for one RFI item. "
            "Returns the draft text. The item must have been classified first."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "item_id": {"type": "string", "description": "UUID of the rfi_items row."},
            },
            "required": ["item_id"],
        },
    }


async def draft_rfi_response_execute(args: dict[str, Any]) -> dict[str, Any]:
    return await api_request("POST", f"/draft/{args['item_id']}", timeout=180.0)
