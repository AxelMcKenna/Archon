"""get_forecast: fetch the cost / duration / risk forecast for a project.

Reads the project's persisted `forecast_context` payload from
`consent_assessments`, then POSTs it to the existing `/api/forecast`
FastAPI endpoint. Returns the structured forecast so the agent can
answer questions like "what does this project cost", "how long is the
P90 timeline", or "which risk dimension is highest" without us baking
those summaries into the UI.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.supabase_client import get_supabase
from app.tools.api_client import api_request


def get_forecast_schema() -> dict[str, Any]:
    return {
        "name": "get_forecast",
        "description": (
            "Fetch the project's cost / duration / risk forecast — council "
            "fees, MBIE levies, P50 and P90 calendar weeks, RFI probability, "
            "and a five-dimension risk profile (overall, consent complexity, "
            "cost overrun, timeline, site risk) with factors and mitigations. "
            "Use whenever the user asks about cost, duration, timeline, or "
            "risk for a specific project. Requires the project's consent "
            "assessment to have been saved at least once."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "UUID of the project (provided in system context).",
                },
            },
            "required": ["project_id"],
        },
    }


async def get_forecast_execute(args: dict[str, Any]) -> dict[str, Any]:
    project_id = args["project_id"]
    payload = await asyncio.to_thread(_load_forecast_context, project_id)
    if payload is None:
        return {
            "error": (
                "No forecast context for this project yet — the consent "
                "assessment hasn't been saved. Have the user open Consent "
                "Assessment and save once before requesting a forecast."
            ),
        }
    forecast = await api_request("POST", "/api/forecast", json=payload)
    if "error" in forecast:
        return forecast
    return _trim_forecast(forecast)


def _load_forecast_context(project_id: str) -> dict[str, Any] | None:
    sb = get_supabase()
    row = (
        sb.table("consent_assessments")
        .select("forecast_context")
        .eq("project_id", project_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        return None
    ctx = row.data.get("forecast_context")
    return ctx if isinstance(ctx, dict) else None


def _trim_forecast(forecast: dict[str, Any]) -> dict[str, Any]:
    """Strip fields the agent doesn't need (raw freshness timestamp, full
    breakdown duplication) while keeping every actionable signal."""
    trimmed: dict[str, Any] = {
        "councilName": forecast.get("councilName"),
        "costs": forecast.get("costs"),
        "duration": forecast.get("duration"),
        "risk": forecast.get("risk"),
        "disclaimer": forecast.get("disclaimer"),
    }
    notes = forecast.get("notes")
    if notes:
        trimmed["notes"] = notes
    return trimmed
