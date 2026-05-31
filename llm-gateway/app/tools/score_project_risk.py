"""score_project_risk: pre-lodgement risk score via POST /risk/score."""

from __future__ import annotations

from typing import Any

from app.tools.api_client import api_request


def score_project_risk_schema() -> dict[str, Any]:
    return {
        "name": "score_project_risk",
        "description": (
            "Compute a pre-lodgement risk score for the current project. "
            "First call read_tab(overview) to obtain bca, project_type and "
            "description, then pass them here."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "bca": {
                    "type": "string",
                    "description": "BCA id (e.g. 'ccc', 'selwyn', 'waimakariri').",
                },
                "project_type": {
                    "type": "string",
                    "description": "Project type (e.g. 'new_dwelling', 'extension').",
                },
                "description": {
                    "type": "string",
                    "description": "Free-text project description from the project record.",
                },
                "addressed_corpus_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: corpus item ids the user has already addressed.",
                },
            },
            "required": ["bca", "project_type", "description"],
        },
    }


async def score_project_risk_execute(args: dict[str, Any]) -> dict[str, Any]:
    body = {
        "bca": args["bca"],
        "project_type": args["project_type"],
        "description": args.get("description", ""),
        "addressed_corpus_ids": args.get("addressed_corpus_ids", []),
    }
    return await api_request("POST", "/risk/score", json=body, timeout=120.0)
