"""POST /risk/score — pre-lodgement risk score."""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from supabase import Client

from app.auth import get_db_for
from app.risk import score_project

router = APIRouter()
logger = logging.getLogger(__name__)


class ScoreRequest(BaseModel):
    bca: str
    project_type: str
    description: str
    addressed_corpus_ids: list[str] = Field(default_factory=list)


@router.post("/score")
async def score(
    req: ScoreRequest,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    try:
        corpus = (
            db.table("bca_corpus")
            .select(
                "id, bca, project_type, category, severity, "
                "example_text, trigger_description, resolution_hint"
            )
            .eq("bca", req.bca)
            .execute()
            .data
            or []
        )
    except APIError as exc:
        # Common local-dev pitfall: expired/invalid SUPABASE_*_KEY causes PGRST301.
        logger.exception("risk score corpus fetch failed bca=%r", req.bca)
        code = getattr(exc, "code", None)
        if code == "PGRST301":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Supabase authentication failed for risk corpus fetch. "
                    "Check SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in api/.env.local "
                    "(keys may be invalid, expired, or from a different project)."
                ),
            ) from exc
        raise HTTPException(status_code=502, detail=f"Risk corpus query failed: {exc}") from exc

    result = score_project(
        bca=req.bca,
        project_type=req.project_type,
        description=req.description,
        addressed_corpus_ids=req.addressed_corpus_ids,
        corpus=corpus,
    )
    return {
        "score": result.score,
        "band": result.band,
        "bca": result.bca,
        "project_type": result.project_type,
        "items": [asdict(i) for i in result.items],
    }
