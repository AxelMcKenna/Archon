"""Process-local SlowAPI limiter.

Keyed on the Authorization bearer token when present (so a single user
across IPs counts as one), otherwise the remote IP. Storage is in-memory
— fine for a single-worker deployment; swap for Redis if we scale out.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _key(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()[:64] or get_remote_address(request)
    return get_remote_address(request)


limiter = Limiter(key_func=_key, default_limits=["120/minute"])
