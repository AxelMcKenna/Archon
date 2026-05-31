"""Shared cache-and-persist scaffolding for the analyse pipelines.

``plan_pipeline`` and ``value_engineering_pipeline`` follow the same lifecycle:
resolve a cache key, look for a prior ``analysed`` row to clone (instant,
cost-free re-trigger), otherwise insert an ``analysing`` row, run the analyser,
and update the row to ``analysed`` (or ``failed`` on error). This module owns
that control flow + the cache-key fingerprinting; the two pipelines supply only
their table-specific column shaping via callbacks.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from supabase import Client

from app.vision.core.prompts import load_prompt

# analyse() -> (payload, prompt_version, metrics, extras)
AnalyseFn = Callable[[], tuple[dict[str, Any], str, Any, dict[str, Any]]]


def prompt_fingerprint(base_version: str, prompt_names: tuple[str, ...]) -> str:
    """Cache-key version that invalidates on *any* prompt edit.

    A bare semantic version (e.g. ``"1.0.0"``) doesn't change when a prompt
    body is edited without bumping its frontmatter version, which would serve a
    stale cached analysis. Fold a fingerprint of the active prompt bodies (and
    their declared versions) into ``base_version`` so edits auto-invalidate.
    """
    parts: list[str] = []
    for name in prompt_names:
        body, version = load_prompt(name)
        parts.append(f"{name}:{version}:{body}")
    digest = hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{base_version}+{digest}"


def find_cached_row(
    db: Client,
    *,
    table: str,
    select: str,
    filters: dict[str, Any],
    newest_first: bool = False,
) -> dict[str, Any] | None:
    """Return one ``analysed`` row matching ``filters`` (a reusable result), or None."""
    q = db.table(table).select(select)
    for col, val in filters.items():
        q = q.eq(col, val)
    q = q.eq("status", "analysed")
    if newest_first:
        q = q.order("created_at", desc=True)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


@dataclass
class RunOutcome:
    """Result of ``run_and_persist`` — enough for the caller to build its own
    public result dataclass and run any post-write side effects."""

    cached: bool
    processing_ms: int
    cost_usd: float
    payload: dict[str, Any] | None  # fresh analyse() payload (None on cache hit)
    metrics: Any | None  # fresh Metrics (None on cache hit)


def run_and_persist(
    db: Client,
    *,
    table: str,
    row_id: str,
    base_row: dict[str, Any],
    cached_row: dict[str, Any] | None,
    analyse: AnalyseFn,
    clone_fields: Callable[[dict[str, Any]], dict[str, Any]],
    analysed_fields: Callable[[dict[str, Any], str, Any, dict[str, Any]], dict[str, Any]],
) -> RunOutcome:
    """Drive the insert/analyse/update lifecycle for one analysis row.

    - ``base_row`` is the common column set (id, foreign keys, cache key,
      provider/model) written on every insert.
    - On a cache hit, ``clone_fields(cached_row)`` supplies the analysis columns
      copied from the reusable row; the clone is written at ``cost_usd = 0``.
    - On a miss, ``analyse()`` runs; ``analysed_fields(payload, prompt_version,
      metrics, extras)`` supplies the analysis columns to write. Failures mark
      the row ``failed``.
    """
    if cached_row is not None:
        t0 = time.monotonic()
        insert = {
            **base_row,
            "status": "analysed",
            "cost_usd": 0,
            **clone_fields(cached_row),
        }
        ms = int((time.monotonic() - t0) * 1000)
        insert["processing_ms"] = ms
        db.table(table).insert(insert).execute()
        return RunOutcome(
            cached=True, processing_ms=ms, cost_usd=0.0, payload=None, metrics=None
        )

    db.table(table).insert({**base_row, "status": "analysing"}).execute()

    try:
        payload, prompt_version, metrics, extras = analyse()
    except Exception as e:
        db.table(table).update(
            {"status": "failed", "error": str(e)[:500]}
        ).eq("id", row_id).execute()
        raise

    cost_usd = round(metrics.cost_usd, 6)
    db.table(table).update(
        {
            "status": "analysed",
            "processing_ms": metrics.processing_ms,
            "cost_usd": cost_usd,
            **analysed_fields(payload, prompt_version, metrics, extras),
        }
    ).eq("id", row_id).execute()

    return RunOutcome(
        cached=False,
        processing_ms=metrics.processing_ms,
        cost_usd=cost_usd,
        payload=payload,
        metrics=metrics,
    )


def content_hash(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()
