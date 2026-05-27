"""Admin HTTP routes for the VE ingestion layer.

Guarded by a shared ``X-Admin-Token`` header read from
``settings.admin_ingest_token``. This is intentionally lightweight for
the current single-user / permissive-RLS phase of the project; replace
with a real auth check when multi-user lands.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query

from app.auth import get_service_db
from app.config import get_settings
from app.ingestion.pipeline import run_source
from app.ingestion.registry import known_kinds

router = APIRouter()


def _require_admin_token(token: str | None) -> None:
    expected = get_settings().admin_ingest_token
    if not expected:
        raise HTTPException(
            500,
            "admin_ingest_token is not configured on the server",
        )
    if not token or token != expected:
        raise HTTPException(401, "invalid or missing X-Admin-Token")


@router.get("/sources")
def list_sources(
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin_token(x_admin_token)
    return {"sources": known_kinds()}


@router.post("/{source_kind}")
def trigger_ingest(
    source_kind: str,
    force: bool = Query(False),
    dry_run: bool = Query(False),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin_token(x_admin_token)
    if source_kind not in known_kinds():
        raise HTTPException(
            404,
            f"unknown source kind {source_kind!r}; "
            f"known: {known_kinds()}",
        )
    db = get_service_db()
    summary = run_source(
        db, source_kind=source_kind, force=force, dry_run=dry_run
    )
    return asdict(summary)
