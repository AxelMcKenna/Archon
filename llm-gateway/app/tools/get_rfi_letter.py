"""get_rfi_letter: fetch a parsed RFI letter + its items via GET /letters/{id}."""

from __future__ import annotations

from typing import Any

from app.tools.api_client import api_request


def get_rfi_letter_schema() -> dict[str, Any]:
    return {
        "name": "get_rfi_letter",
        "description": (
            "Fetch a parsed RFI letter and all its line items. Use after "
            "read_tab(rfis) when the user asks about specific items, "
            "deadlines, or wants to draft a response."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "letter_id": {"type": "string", "description": "UUID of the rfi_letters row."},
            },
            "required": ["letter_id"],
        },
    }


async def get_rfi_letter_execute(args: dict[str, Any]) -> dict[str, Any]:
    return await api_request("GET", f"/letters/{args['letter_id']}", timeout=30.0)
