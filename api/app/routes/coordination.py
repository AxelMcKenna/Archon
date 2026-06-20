"""Project coordination routes — on-demand re-check + (gated) deep cross-check.

Reads are served directly from Supabase by the frontend server component; these
endpoints only trigger work. The deterministic Tier-1 pass also runs
automatically at the end of every document pipeline, so ``/recheck`` is mostly
for a manual refresh after an out-of-band change.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from supabase import Client

from app.auth import get_db
from app.config import get_settings
from app.coordination.engine import run_project_coordination
from app.rate_limit import limiter

router = APIRouter()
log = logging.getLogger(__name__)


def _assert_project(db: Client, project_id: UUID) -> None:
    """RLS-enforced ownership check — a non-owner sees no row."""
    row = (
        db.table("projects")
        .select("id")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "project not found")


@router.post("/{project_id}/recheck")
@limiter.limit("20/minute")
async def recheck(
    request: Request,
    project_id: UUID,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Re-run the deterministic Tier-1 coordination pass for a project."""
    _assert_project(db, project_id)
    try:
        result = await asyncio.to_thread(
            run_project_coordination, db, str(project_id)
        )
    except Exception as e:
        log.exception("coordination recheck failed (project_id=%s)", project_id)
        raise HTTPException(500, "coordination failed") from e
    return {
        "project_id": result.project_id,
        "document_count": result.document_count,
        "flags_count": result.flags_count,
        "ran": result.ran,
    }


@router.post("/{project_id}/deep-check")
@limiter.limit("6/minute")
async def deep_check(
    request: Request,
    project_id: UUID,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Run the LLM Tier-2 reconciliation (S4). Gated until validated."""
    if not get_settings().spec_coordination_enabled:
        raise HTTPException(409, "deep cross-check is not enabled")
    _assert_project(db, project_id)
    # Tier 2 plugs into run_project_coordination via the settings gate; today the
    # gate is off, so this path is reserved. Running the same engine keeps the
    # behaviour correct (it will include Tier 2 once implemented).
    try:
        result = await asyncio.to_thread(
            run_project_coordination, db, str(project_id)
        )
    except Exception as e:
        log.exception("coordination deep-check failed (project_id=%s)", project_id)
        raise HTTPException(500, "coordination failed") from e
    return {
        "project_id": result.project_id,
        "document_count": result.document_count,
        "flags_count": result.flags_count,
        "ran": result.ran,
    }
