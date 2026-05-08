"""GET /letters/{id}, GET /letters/{id}/signed-url, PATCH /items/{id}.

Letter retrieval, signed URL for original-document preview, and the manual
correction endpoint (FR-1.8). Editing an item's raw_text re-runs the
deterministic entity extractor so downstream classification has fresh inputs.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.auth import CurrentUser, get_current_user, get_db_for, get_service_db
from app.extractors.entities import extract_entities
from app.persistence import fetch_items, fetch_letter, update_item_text
from app.storage import RFI_BUCKET, signed_url

router = APIRouter()


@router.get("/{letter_id}")
async def get_letter(
    letter_id: str,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    letter = fetch_letter(db, letter_id)
    if not letter:
        raise HTTPException(404, "letter not found")
    items = fetch_items(db, letter_id)
    return {"letter": letter, "items": items}


@router.get("/{letter_id}/signed-url")
async def get_signed_url(
    letter_id: str,
    db: Client = Depends(get_db_for),
    service_db: Client = Depends(get_service_db),
    _user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    # RLS check: read the letter as the user first to prove access.
    letter = fetch_letter(db, letter_id)
    if not letter:
        raise HTTPException(404, "letter not found")
    url = signed_url(service_db, bucket=RFI_BUCKET, path=letter["original_storage_path"])
    return {"url": url}


class ItemUpdate(BaseModel):
    raw_text: str


items_router = APIRouter()


@items_router.patch("/{item_id}")
async def update_item(
    item_id: str,
    body: ItemUpdate,
    db: Client = Depends(get_db_for),
) -> dict[str, Any]:
    """Edit an item's raw_text and re-run entity extraction (FR-1.8).

    Phase-3 hook: once classification is wired in, we'll mark the item's
    classifications as stale here so the user can re-classify.
    """
    new_extracted = extract_entities(body.raw_text)
    try:
        row = update_item_text(
            db,
            item_id=item_id,
            raw_text=body.raw_text,
            extracted=new_extracted.model_dump(mode="json"),
        )
    except LookupError as e:
        raise HTTPException(404, "item not found") from e
    return row
