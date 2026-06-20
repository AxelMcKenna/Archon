"""Shared retry/backoff for LLM provider calls.

Transient provider failures — rate limits, 5xx, network blips, and the
occasional "model returned no tool call" — are the dominant failure mode
in production. We retry them with exponential backoff + jitter so a
single blip doesn't drop a vision run (and silently shrink the voting
pool). Non-transient errors (auth, malformed request, quota exhausted)
raise immediately so they surface fast.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable

import httpx

log = logging.getLogger(__name__)


class TransientLLMError(RuntimeError):
    """A provider error worth retrying (rate limit / 5xx / flaky tool call)."""


# 429 = rate limited; 408/425 = timeout/too-early; 409 = transient conflict;
# 5xx = provider-side. All worth another attempt.
_RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


def _status_of(exc: BaseException) -> int | None:
    """Best-effort HTTP status extraction across httpx and the genai SDK."""
    resp = getattr(exc, "response", None)
    code = getattr(resp, "status_code", None)
    if isinstance(code, int):
        return code
    # google-genai errors expose `.code`
    code = getattr(exc, "code", None)
    return code if isinstance(code, int) else None


def is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, TransientLLMError):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    return _status_of(exc) in _RETRYABLE_STATUS


def call_with_retries[T](
    fn: Callable[[], T],
    *,
    label: str,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 20.0,
) -> T:
    """Call ``fn`` with exponential backoff on transient failures.

    Re-raises the last exception once attempts are exhausted or the error
    is not retryable.
    """
    attempt = 0
    while True:
        attempt += 1
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - re-raised below when not retryable
            if attempt >= max_attempts or not is_retryable(exc):
                raise
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            delay += random.uniform(0.0, delay * 0.25)  # jitter to avoid thundering herd
            log.warning(
                "LLM call %s failed (attempt %d/%d): %s — retrying in %.1fs",
                label,
                attempt,
                max_attempts,
                exc,
                delay,
            )
            time.sleep(delay)
