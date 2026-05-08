"""Supabase JWT verification for FastAPI routes.

The web app passes the user's Supabase access token in the Authorization
header. We verify it server-side via the Supabase auth service so we can:
  - Identify the user (auth.uid())
  - Mint a per-request Postgres connection that respects RLS by binding the
    user's JWT (use the supabase-py client with the user token).

Service-role operations (writes that bypass RLS) use a separate client.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

from app.config import get_settings


@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    email: str | None
    access_token: str


def _service_client() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def _user_client(access_token: str) -> Client:
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    s = get_settings()
    anon = create_client(s.supabase_url, s.supabase_anon_key)
    try:
        user_resp = anon.auth.get_user(token)
    except Exception as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {e}") from e
    if not user_resp or not user_resp.user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    return CurrentUser(
        user_id=user_resp.user.id,
        email=user_resp.user.email,
        access_token=token,
    )


def get_db_for(user: CurrentUser = Depends(get_current_user)) -> Client:
    """User-scoped Postgrest client: queries hit RLS as the user."""
    return _user_client(user.access_token)


def get_service_db() -> Client:
    """Service-role client for storage uploads and writes that span tables."""
    return _service_client()
