"""POST /classify/{letter_id} — run two-pronged classification on a stored RFI.

Loads the canonical JSON via RLS-scoped client, runs both prongs per item,
reconciles, and persists into classifications + reconciliation_log.
"""

from __future__ import annotations

import asyncio
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
    replace_letter_classifications,
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

    items = list(canonical.rfi_letter.items)

    # Rules prong is pure-python; run all up front.
    rules_preds = [rules.evaluate(item, _RULESET) for item in items]

    # AI prong is the slow part — gather all calls so they run concurrently
    # on the threadpool instead of serialising N×(10-60s) round-trips.
    ai_preds = await asyncio.gather(
        *(
            ai.classify_async(
                item,
                bca=bca,
                project_type=project_type,
                project_description=project_description,
            )
            for item in items
        )
    )

    prompt_version = ai_preds[0].prompt_version if ai_preds else None

    finals: list[FinalClassification] = [
        reconciler.reconcile(item.item_id, rules_pred, ai_pred)
        for item, rules_pred, ai_pred in zip(items, rules_preds, ai_preds, strict=True)
    ]

    # Batch the DB work: one DELETE + one bulk INSERT for classifications
    # + one bulk INSERT for reconciliation_log (3 round-trips, not 3N).
    finals_by_db_id: dict[str, FinalClassification] = {}
    ordered_db_ids: list[str] = []
    for item, final in zip(items, finals, strict=True):
        db_item_id = db_id_by_item.get(item.item_id)
        if db_item_id is None:
            continue
        ordered_db_ids.append(db_item_id)
        finals_by_db_id[db_item_id] = final

    replace_letter_classifications(
        db,
        letter_id=letter_id,
        item_db_ids=ordered_db_ids,
        finals_by_item=finals_by_db_id,
    )

    update_letter_status(db, letter_id, "classified")

    return ClassifyResponse(
        letter_id=letter_id,
        rules_version=_RULESET.version,
        prompt_version=prompt_version,
        classifications=finals,
    )


@router.post("/{letter_id}/full")
async def classify_and_draft(
    letter_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    """Ground against the linked plan, classify, then draft a response for each.

    Convenience endpoint for the inline upload flow: one round-trip turns an
    extracted letter into a populated review (grounded + classified + drafted)
    so the user lands on a page with content, not empty columns.
    """
    from app.grounding.runner import ground_letter
    from app.routes.drafts import generate_draft

    grounding = ground_letter(db, letter_id)
    classify_resp = await classify_letter(letter_id, db)

    items_rows = (
        db.table("rfi_items")
        .select("id, item_id")
        .eq("rfi_letter_id", letter_id)
        .execute()
        .data
        or []
    )
    db_id_by_item = {r["item_id"]: r["id"] for r in items_rows}

    drafted = 0
    failed: list[dict[str, str]] = []
    for cls in classify_resp.classifications:
        db_id = db_id_by_item.get(cls.rfi_item_id)
        if not db_id:
            continue
        try:
            await generate_draft(db_id, db)
            drafted += 1
        except HTTPException as e:
            failed.append({"item_id": cls.rfi_item_id, "reason": e.detail or str(e)})
        except Exception as e:  # noqa: BLE001 — surface as soft failure per-item
            failed.append({"item_id": cls.rfi_item_id, "reason": str(e)})

    return {
        "letter_id": letter_id,
        "grounding": grounding,
        "classified": len(classify_resp.classifications),
        "drafted": drafted,
        "failed": failed,
    }


@router.post("/{letter_id}/ground")
async def ground_only(
    letter_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    """Run Stage A grounding only (idempotent; safe to re-run)."""
    from app.grounding.runner import ground_letter

    return ground_letter(db, letter_id)


@router.get("/{letter_id}/render")
async def render_letter_payload(
    letter_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    """Return per-item suggested fixes + a markdown covering letter.

    Pure templating from grounding evidence — no LLM calls. Re-run any time;
    the output is a deterministic function of the evidence rows.
    """
    from app.grounding.render import fetch_letter_render_payload

    return fetch_letter_render_payload(db, letter_id)


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
