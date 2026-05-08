"""Persist extraction artefacts to Supabase.

Uses the user-scoped client (RLS enforced) for all writes — every row this
module creates must be visible to the requesting user.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.extractors.metrics import Metrics
from app.models import CanonicalRfi


def insert_letter(
    client: Client,
    *,
    project_id: str,
    storage_path: str,
    canonical: CanonicalRfi,
    rendered_markdown: str,
) -> str:
    """Insert rfi_letters + rfi_items rows. Returns the rfi_letters.id."""
    letter = canonical.rfi_letter
    letter_row = {
        "project_id": project_id,
        "rfi_number": letter.rfi_number,
        "issue_date": letter.issue_date.isoformat() if letter.issue_date else None,
        "response_deadline": (
            letter.response_deadline.isoformat() if letter.response_deadline else None
        ),
        "officer_name": letter.officer_name,
        "original_storage_path": storage_path,
        "canonical_json": canonical.model_dump(mode="json"),
        "rendered_markdown": rendered_markdown,
        "extraction_metadata": letter.extraction.model_dump(mode="json"),
        "status": "extracted",
    }
    inserted = (
        client.table("rfi_letters").insert(letter_row).execute()
    )
    letter_id = inserted.data[0]["id"]

    item_rows: list[dict[str, Any]] = []
    for ordering, item in enumerate(letter.items):
        item_rows.append(
            {
                "rfi_letter_id": letter_id,
                "item_id": item.item_id,
                "raw_number": item.raw_number,
                "raw_text": item.raw_text,
                "page": item.page,
                "bbox": list(item.bbox) if item.bbox else None,
                "extracted": item.extracted.model_dump(mode="json"),
                "ordering": ordering,
            }
        )
    if item_rows:
        client.table("rfi_items").insert(item_rows).execute()
    return letter_id


def insert_extraction_audit(
    client: Client,
    *,
    letter_id: str,
    canonical: CanonicalRfi,
    metrics: Metrics,
) -> None:
    extractor = canonical.rfi_letter.extraction.extractor
    version = canonical.rfi_letter.extraction.extractor_version
    client.table("rfi_extractions").insert(
        {
            "rfi_letter_id": letter_id,
            "extractor": extractor,
            "extractor_version": version,
            "raw_output": canonical.model_dump(mode="json"),
            "processing_ms": metrics.processing_ms,
            "cost_usd": round(metrics.cost_usd, 6),
        }
    ).execute()


def fetch_letter(client: Client, letter_id: str) -> dict[str, Any] | None:
    res = (
        client.table("rfi_letters")
        .select("*")
        .eq("id", letter_id)
        .single()
        .execute()
    )
    return res.data


def fetch_items(client: Client, letter_id: str) -> list[dict[str, Any]]:
    res = (
        client.table("rfi_items")
        .select("*")
        .eq("rfi_letter_id", letter_id)
        .order("ordering")
        .execute()
    )
    return res.data or []


def update_item_text(
    client: Client,
    *,
    item_id: str,
    raw_text: str,
    extracted: dict[str, Any],
) -> dict[str, Any]:
    res = (
        client.table("rfi_items")
        .update({"raw_text": raw_text, "extracted": extracted})
        .eq("id", item_id)
        .execute()
    )
    if not res.data:
        raise LookupError(item_id)
    return res.data[0]
