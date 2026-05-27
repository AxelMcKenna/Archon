"""HTTP fetcher with conditional-request caching and per-host rate limits.

Single responsibility: turn a URL into bytes, politely. Knows nothing
about DB rows or storage buckets — the caller passes in any prior
ETag/Last-Modified and decides what to do with the result.

We never crawl. Every URL we fetch must be explicitly listed in
``sources.yaml``; that file is our allowlist. This is deliberately
stricter than parsing robots.txt at runtime — it makes the set of URLs
we touch reviewable.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

import httpx

log = logging.getLogger(__name__)

FetchStatus = Literal["fetched", "unchanged", "error"]


@dataclass
class FetchResult:
    status: FetchStatus
    bytes: bytes | None
    content_hash: str | None
    content_type: str | None
    etag: str | None
    last_modified: str | None
    http_status: int
    error: str | None = None


_HOST_LAST_FETCH: dict[str, float] = {}
_HOST_LOCK = threading.Lock()


def _wait_for_host(host: str, rate_limit_seconds: float) -> None:
    """Sleep until ``rate_limit_seconds`` have passed since the last fetch
    to this host. Process-local — across multiple workers we may exceed
    the rate, accepted as a v1 tradeoff."""
    if rate_limit_seconds <= 0:
        return
    with _HOST_LOCK:
        last = _HOST_LAST_FETCH.get(host, 0.0)
        now = time.monotonic()
        elapsed = now - last
        wait = rate_limit_seconds - elapsed if elapsed < rate_limit_seconds else 0.0
        _HOST_LAST_FETCH[host] = now + wait
    if wait > 0:
        time.sleep(wait)


def fetch(
    url: str,
    *,
    user_agent: str,
    rate_limit_seconds: float,
    etag: str | None = None,
    last_modified: str | None = None,
    timeout_seconds: float = 30.0,
) -> FetchResult:
    """Fetch a URL, sending conditional headers when prior values are passed.

    Returns a FetchResult; never raises on HTTP errors — the caller
    decides whether to record the error or surface it.
    """
    host = urlparse(url).hostname or ""
    _wait_for_host(host, rate_limit_seconds)

    headers: dict[str, str] = {"User-Agent": user_agent}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    try:
        with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
            resp = client.get(url, headers=headers)
    except httpx.HTTPError as e:
        return FetchResult(
            status="error",
            bytes=None,
            content_hash=None,
            content_type=None,
            etag=None,
            last_modified=None,
            http_status=0,
            error=str(e)[:500],
        )

    if resp.status_code == 304:
        return FetchResult(
            status="unchanged",
            bytes=None,
            content_hash=None,
            content_type=None,
            etag=etag,
            last_modified=last_modified,
            http_status=304,
        )

    if resp.status_code >= 400:
        return FetchResult(
            status="error",
            bytes=None,
            content_hash=None,
            content_type=resp.headers.get("Content-Type"),
            etag=resp.headers.get("ETag"),
            last_modified=resp.headers.get("Last-Modified"),
            http_status=resp.status_code,
            error=f"HTTP {resp.status_code}",
        )

    data = resp.content
    content_hash = hashlib.sha256(data).hexdigest()
    return FetchResult(
        status="fetched",
        bytes=data,
        content_hash=content_hash,
        content_type=resp.headers.get("Content-Type"),
        etag=resp.headers.get("ETag"),
        last_modified=resp.headers.get("Last-Modified"),
        http_status=resp.status_code,
    )
