"""User-scoped Supabase access for FastAPI routes.

Each request carries the caller's Supabase JWT in the `Authorization: Bearer …`
header (set by the Next.js proxy). We build a per-request Supabase client that
runs as that user, so RLS policies on `projects.user_id = auth.uid()` apply
automatically. Routes that need to bypass RLS for trusted system work can use
`get_service_db()`.
"""

from __future__ import annotations

import contextlib

from fastapi import Depends, HTTPException, Request, status
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from app.config import get_settings


def _normalize_key(raw: str) -> str:
    key = (raw or "").strip().strip("\"'")
    if key.lower().startswith("bearer "):
        key = key[7:].strip()
    return key


def _extract_token(request: Request) -> str:
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


def get_db(request: Request) -> Client:
    """Per-request Supabase client scoped to the caller's JWT. Enforces RLS."""
    s = get_settings()
    token = _extract_token(request)
    anon = _normalize_key(s.supabase_anon_key)
    if not s.supabase_url or not anon:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="supabase not configured",
        )
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    client = create_client(s.supabase_url, anon, options=options)
    # PostgREST also needs the user JWT explicitly so auth.uid() resolves.
    with contextlib.suppress(Exception):
        client.postgrest.auth(token)
    return client


# Alias kept for compatibility with existing imports.
def get_db_for(request: Request) -> Client:
    return get_db(request)


def get_service_db() -> Client:
    """Service-role client (bypasses RLS). Use only for trusted system work."""
    s = get_settings()
    key = _normalize_key(s.supabase_service_role_key)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="service-role key not configured",
        )
    return create_client(s.supabase_url, key)


def current_user_id(request: Request, db: Client = Depends(get_db)) -> str:
    """Returns the caller's auth.users.id by asking Supabase to validate the JWT."""
    token = _extract_token(request)
    try:
        user = db.auth.get_user(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token: {exc}",
        ) from exc
    if not user or not user.user or not user.user.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")
    return user.user.id
