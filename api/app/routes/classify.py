"""POST /classify/{letter_id} — run two-pronged classification on a stored RFI.

Loads the canonical JSON via RLS-scoped client, runs both prongs per item,
reconciles, and persists into classifications + reconciliation_log.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db_for
from app.classifier import ai, reconciler, rules
from app.models import CanonicalRfi, FinalClassification
from app.persistence import (
    fetch_letter_canonical,
    fetch_reconciliation_for_letter,
    insert_classification_results,
    resolve_reconciliation,
    update_letter_status,
)

router = APIRouter()
reconciliation_router = APIRouter()

_RULESET = rules.load_ruleset()


class ClassifyResponse(BaseModel):
    letter_id: str
    rules_version: str
    prompt_version: str | None
    classifications: list[FinalClassification]


def _project_context(letter: dict[str, Any]) -> tuple[str, str, str]:
    canonical = letter.get("canonical_json") or {}
    rfi_letter = canonical.get("rfi_letter") or {}
    bca = rfi_letter.get("bca", "")
    # We don't store project_type / description on the letter, but the
    # canonical JSON carries the BCA. project_type and description are
    # fetched separately via the linked project.
    return bca, "", ""


@router.post("/{letter_id}", response_model=ClassifyResponse)
async def classify_letter(
    letter_id: str,
    db: Client = Depends(get_db_for),
) -> ClassifyResponse:
    letter = fetch_letter_canonical(db, letter_id)
    if not letter or not letter.get("canonical_json"):
        raise HTTPException(404, "letter not found or not extracted")

    canonical = CanonicalRfi.model_validate(letter["canonical_json"])

    # Pull project context (BCA, project_type, description) from the linked project.
    proj = (
        db.table("rfi_letters")
        .select("project_id, projects(bca, project_type, description)")
        .eq("id", letter_id)
        .single()
        .execute()
        .data
    )
    project = proj.get("projects") if proj else None
    if not project:
        raise HTTPException(404, "project for letter not found")
    bca = project["bca"]
    project_type = project["project_type"]
    project_description = project.get("description") or ""

    # Need DB ids for items (canonical's item_id is letter-local).
    items_rows = (
        db.table("rfi_items")
        .select("id, item_id")
        .eq("rfi_letter_id", letter_id)
        .execute()
        .data
    )
    db_id_by_item = {r["item_id"]: r["id"] for r in items_rows}

    finals: list[FinalClassification] = []
    prompt_version: str | None = None

    for item in canonical.rfi_letter.items:
        rules_pred = rules.evaluate(item, _RULESET)
        ai_pred = ai.classify(
            item,
            bca=bca,
            project_type=project_type,
            project_description=project_description,
        )
        prompt_version = ai_pred.prompt_version
        final = reconciler.reconcile(item.item_id, rules_pred, ai_pred)
        finals.append(final)

        db_item_id = db_id_by_item.get(item.item_id)
        if db_item_id is None:
            continue
        # Replace any prior classifications for this item (idempotent re-run).
        db.table("classifications").delete().eq("rfi_item_id", db_item_id).execute()
        insert_classification_results(db, rfi_item_id=db_item_id, final=final)

    update_letter_status(db, letter_id, "classified")

    return ClassifyResponse(
        letter_id=letter_id,
        rules_version=_RULESET.version,
        prompt_version=prompt_version,
        classifications=finals,
    )


@router.get("/{letter_id}")
async def get_classifications(
    letter_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    """Persisted classifications and reconciliation log for a letter."""
    log = fetch_reconciliation_for_letter(db, letter_id)
    return {"reconciliation_log": log}


class ResolveRequest(BaseModel):
    user_choice: str


@reconciliation_router.post("/{log_id}/resolve")
async def resolve(
    log_id: str,
    body: ResolveRequest,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    try:
        return resolve_reconciliation(db, log_id=log_id, user_choice=body.user_choice)
    except LookupError as e:
        raise HTTPException(404, "reconciliation entry not found") from e


# Rules-only endpoint (cheap, no AI calls) preserved for testing.
class RulesOnlyRequest(BaseModel):
    canonical: CanonicalRfi


@router.post("/rules-only")
async def classify_rules_only(req: RulesOnlyRequest) -> dict[str, Any]:
    out = []
    for item in req.canonical.rfi_letter.items:
        pred = rules.evaluate(item, _RULESET)
        out.append({"item_id": item.item_id, "prediction": pred.model_dump()})
    return {"results": out, "rules_version": _RULESET.version}
