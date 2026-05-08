"""POST /risk/score — pre-lodgement risk score."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db_for
from app.risk import score_project

router = APIRouter()


class ScoreRequest(BaseModel):
    bca: str
    project_type: str
    description: str
    addressed_corpus_ids: list[str] = []


@router.post("/score")
async def score(
    req: ScoreRequest,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    corpus = (
        db.table("bca_corpus")
        .select("id, bca, project_type, category, severity, example_text, trigger_description, resolution_hint")
        .eq("bca", req.bca)
        .execute()
        .data
        or []
    )
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
