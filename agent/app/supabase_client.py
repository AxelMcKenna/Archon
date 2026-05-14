"""Per-request Supabase client for the agent service.

The chat route sets ``CURRENT_USER_TOKEN`` from the incoming Authorization
header before kicking off ``run_agent``; all tools that call ``get_supabase()``
get a client scoped to that JWT, so RLS policies apply.
"""

from __future__ import annotations

from contextvars import ContextVar

from fastapi import HTTPException, Request, status
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from app.config import get_settings

CURRENT_USER_TOKEN: ContextVar[str | None] = ContextVar("CURRENT_USER_TOKEN", default=None)


def extract_token(request: Request) -> str:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="empty bearer token",
        )
    return token


def get_supabase() -> Client:
    s = get_settings()
    if not s.supabase_url or not s.supabase_anon_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")

    token = CURRENT_USER_TOKEN.get()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="no user token in context",
        )

    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    client = create_client(s.supabase_url, s.supabase_anon_key, options=options)
    try:
        client.postgrest.auth(token)
    except Exception:
        pass
    return client
