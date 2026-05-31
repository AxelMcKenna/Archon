"""Thin async httpx wrapper for calling the existing FastAPI service.

All Phase-2 tools that wrap an AI endpoint go through here so we get one
place to set timeouts, error formatting, and the base URL.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings
from app.supabase_client import CURRENT_USER_TOKEN


async def api_request(
    method: str,
    path: str,
    *,
    json: Any | None = None,
    timeout: float = 180.0,
) -> dict[str, Any]:
    base = get_settings().api_base_url.rstrip("/")
    url = f"{base}{path}"
    headers: dict[str, str] = {}
    token = CURRENT_USER_TOKEN.get()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(method, url, json=json, headers=headers)
    if resp.status_code >= 400:
        text = resp.text[:600]
        return {
            "error": f"{method} {path} failed ({resp.status_code})",
            "detail": text,
        }
    try:
        return resp.json()
    except ValueError:
        return {"raw": resp.text[:1000]}
