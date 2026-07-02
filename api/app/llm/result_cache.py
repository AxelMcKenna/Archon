"""Shared, write-once LLM result cache backed by Postgres (wiki/issues/0007).

The classifier and drafter keep process-local dicts as an L1, but a
process-local cache freezes "whatever this worker's first roll of the dice
was" — different workers (and the same worker after a restart) disagree.
This module gives every worker the same durable answer per key: on a miss the
caller computes the result, then publishes it with insert-on-conflict-do-
nothing and adopts whichever row won the race.

Every function is failure-tolerant by design: a broken/absent DB degrades to
the caller's local behaviour. The cache must never break the pipeline.
"""

from __future__ import annotations

import logging
from typing import Any

from app.auth import get_service_db

log = logging.getLogger(__name__)

_TABLE = "llm_cache"


def get(kind: str, key: str) -> dict[str, Any] | None:
    """Return the globally cached value for ``key``, or None on miss/failure."""
    try:
        db = get_service_db()
        res = db.table(_TABLE).select("value").eq("key", key).limit(1).execute()
        rows = res.data or []
        return rows[0]["value"] if rows else None
    except Exception as exc:  # noqa: BLE001
        log.warning("llm_cache read failed for %s (%s) — treating as miss", kind, exc)
        return None


def put(
    kind: str,
    key: str,
    value: dict[str, Any],
    *,
    prompt_version: str | None = None,
) -> dict[str, Any]:
    """Publish ``value`` write-once; return the value that won.

    If another worker published first, *their* value comes back — the caller
    should adopt it so every worker converges on one answer per key.
    """
    try:
        db = get_service_db()
        db.table(_TABLE).upsert(
            {
                "key": key,
                "kind": kind,
                "value": value,
                "prompt_version": prompt_version,
            },
            on_conflict="key",
            ignore_duplicates=True,  # INSERT ... ON CONFLICT DO NOTHING
        ).execute()
        winner = get(kind, key)
        return winner if winner is not None else value
    except Exception as exc:  # noqa: BLE001
        log.warning("llm_cache write failed for %s (%s) — using local result", kind, exc)
        return value
