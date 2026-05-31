"""classify_rfi_letter: run two-pronged classification on a letter.

POST /classify/{letter_id}. Returns the per-item final classifications.
"""

from __future__ import annotations

from typing import Any

from app.tools.api_client import api_request


def classify_rfi_letter_schema() -> dict[str, Any]:
    return {
        "name": "classify_rfi_letter",
        "description": (
            "Run AI classification on every item in a parsed RFI letter. "
            "Required before drafting responses. Returns per-item categories "
            "and severities."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "letter_id": {"type": "string", "description": "UUID of the rfi_letters row."},
            },
            "required": ["letter_id"],
        },
    }


async def classify_rfi_letter_execute(args: dict[str, Any]) -> dict[str, Any]:
    return await api_request("POST", f"/classify/{args['letter_id']}", timeout=180.0)
