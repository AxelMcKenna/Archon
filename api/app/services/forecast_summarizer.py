from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_OR_BASE_URL = "https://openrouter.ai/api/v1"

_SYSTEM = (
    "You are a senior NZ building consent advisor. Given a structured forecast "
    "(costs, duration, risk) for a single project, write a concise plain-English "
    "summary for the applicant. Three short sentences max. Lead with the bottom "
    "line (likely cost + likely duration), then the single biggest risk driver "
    "and the most useful next action. No headings, no bullet points, no markdown, "
    "no disclaimers — the UI already shows those. Use NZD with thousands separators "
    "and quote durations in calendar weeks."
)


def summarize_forecast(forecast: dict[str, Any]) -> tuple[str | None, str | None]:
    """Returns (summary, error). Exactly one is set."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        msg = "OPENROUTER_API_KEY is not configured on the API service"
        logger.warning("forecast_summarizer: %s", msg)
        return None, msg

    body = {
        "model": settings.openrouter_model,
        "max_tokens": 400,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": (
                    "Forecast JSON:\n```json\n"
                    + json.dumps(forecast, indent=2)
                    + "\n```"
                ),
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_referer or "https://archon.local",
        "X-Title": "ARCHON",
    }

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{_OR_BASE_URL}/chat/completions", headers=headers, json=body
            )
    except Exception as e:
        logger.exception("forecast_summarizer: OpenRouter request failed")
        return None, f"OpenRouter request failed: {type(e).__name__}: {e}"

    if resp.status_code >= 400:
        msg = f"OpenRouter HTTP {resp.status_code}: {resp.text[:300]}"
        logger.warning("forecast_summarizer: %s", msg)
        return None, msg

    try:
        data = resp.json()
        text = (data["choices"][0]["message"]["content"] or "").strip()
    except Exception as e:
        logger.exception("forecast_summarizer: bad OpenRouter response shape")
        return None, f"Bad OpenRouter response: {type(e).__name__}: {e}"

    if not text:
        return None, "OpenRouter returned an empty response"
    return text, None
