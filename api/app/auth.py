"""Single-user mode: a single service-role Supabase client.

Auth was removed in migration 20260508000004. All routes now use the same
service-role client. This file is kept (rather than renamed) so the existing
`from app.auth import ...` imports across routes keep working.
"""

from __future__ import annotations

from supabase import Client, create_client

from app.config import get_settings


def _client() -> Client:
    s = get_settings()
    # Prefer service role for writes; fall back to anon if the secret isn't set
    # (useful for read-only local dev).
    key = s.supabase_service_role_key or s.supabase_anon_key
    return create_client(s.supabase_url, key)


def get_db() -> Client:
    """Single shared Supabase client. RLS is disabled on user tables."""
    return _client()


# Aliases kept for backwards compatibility with existing route imports.
def get_db_for() -> Client:
    return _client()


def get_service_db() -> Client:
    return _client()
