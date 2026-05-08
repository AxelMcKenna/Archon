"""POST /classify — run two-pronged classification on a canonical RFI letter."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.classifier import ai, reconciler, rules
from app.models import CanonicalRfi, FinalClassification

router = APIRouter()

_RULESET = rules.load_ruleset()


class ClassifyRequest(BaseModel):
    canonical: CanonicalRfi
    bca: str
    project_type: str
    project_description: str = ""


class ClassifyResponse(BaseModel):
    classifications: list[FinalClassification]
    rules_version: str


@router.post("", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    out: list[FinalClassification] = []
    for item in req.canonical.rfi_letter.items:
        rules_pred = rules.evaluate(item, _RULESET)
        ai_pred = ai.classify(
            item,
            bca=req.bca,
            project_type=req.project_type,
            project_description=req.project_description,
        )
        final = reconciler.reconcile(item.item_id, rules_pred, ai_pred)
        out.append(final)
    return ClassifyResponse(classifications=out, rules_version=_RULESET.version)


class RulesOnlyRequest(BaseModel):
    canonical: CanonicalRfi


@router.post("/rules-only")
async def classify_rules_only(req: RulesOnlyRequest) -> dict[str, Any]:
    """Cheap endpoint for testing rules engine in isolation (no Claude calls)."""
    out = []
    for item in req.canonical.rfi_letter.items:
        pred = rules.evaluate(item, _RULESET)
        out.append({"item_id": item.item_id, "prediction": pred.model_dump()})
    return {"results": out, "rules_version": _RULESET.version}
