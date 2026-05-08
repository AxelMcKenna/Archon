"""Persist extraction artefacts to Supabase.

Uses the user-scoped client (RLS enforced) for all writes — every row this
module creates must be visible to the requesting user.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.extractors.metrics import Metrics
from app.models import CanonicalRfi, FinalClassification


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


def insert_classification_results(
    client: Client,
    *,
    rfi_item_id: str,
    final: FinalClassification,
) -> str:
    """Insert 3 classifications rows + 1 reconciliation_log row.

    Returns the reconciliation_log row id (used by the resolver UI).
    """
    rules = final.rules_output
    ai = final.ai_output
    rule_ids = [h.rule_id for h in rules.hits]
    rules_primary = rules.primary_category or "documentation:other"
    rules_severity = (
        rules.hits[0].severity if rules.hits else "must_resolve"
    )
    rules_confidence = (
        rules.hits[0].confidence if rules.hits else "low"
    )

    client.table("classifications").insert(
        [
            {
                "rfi_item_id": rfi_item_id,
                "prong": "rules",
                "primary_category": rules_primary,
                "severity": rules_severity,
                "confidence": rules_confidence,
                "rule_ids": rule_ids,
                "rules_version": rules.rules_version,
            },
            {
                "rfi_item_id": rfi_item_id,
                "prong": "ai",
                "primary_category": ai.primary_category,
                "secondary_category": ai.secondary_category,
                "severity": ai.severity,
                "confidence": ai.confidence,
                "reasoning": ai.reasoning,
                "prompt_version": ai.prompt_version,
            },
            {
                "rfi_item_id": rfi_item_id,
                "prong": "final",
                "primary_category": final.primary_category,
                "secondary_category": final.secondary_category,
                "severity": final.severity,
                "confidence": final.confidence,
                "reasoning": ai.reasoning,
                "rules_version": rules.rules_version,
                "prompt_version": ai.prompt_version,
            },
        ]
    ).execute()

    log = client.table("reconciliation_log").insert(
        {
            "rfi_item_id": rfi_item_id,
            "state": final.state,
            "rules_output": rules.model_dump(mode="json"),
            "ai_output": ai.model_dump(mode="json"),
            "final_category": final.primary_category,
            "final_severity": final.severity,
            "rules_version": rules.rules_version,
            "prompt_version": ai.prompt_version,
        }
    ).execute()
    return log.data[0]["id"]


def fetch_letter_canonical(client: Client, letter_id: str) -> dict[str, Any] | None:
    res = (
        client.table("rfi_letters")
        .select("canonical_json, status")
        .eq("id", letter_id)
        .single()
        .execute()
    )
    return res.data


def fetch_classifications(client: Client, letter_id: str) -> list[dict[str, Any]]:
    res = (
        client.table("classifications")
        .select("*, rfi_items!inner(id, item_id, rfi_letter_id)")
        .eq("rfi_items.rfi_letter_id", letter_id)
        .execute()
    )
    return res.data or []


def fetch_reconciliation_for_letter(
    client: Client, letter_id: str
) -> list[dict[str, Any]]:
    res = (
        client.table("reconciliation_log")
        .select("*, rfi_items!inner(id, item_id, ordering, rfi_letter_id)")
        .eq("rfi_items.rfi_letter_id", letter_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def resolve_reconciliation(
    client: Client,
    *,
    log_id: str,
    user_choice: str,
) -> dict[str, Any]:
    res = (
        client.table("reconciliation_log")
        .update(
            {
                "user_resolved_choice": user_choice,
                "user_resolved_at": "now()",
                "final_category": user_choice,
            }
        )
        .eq("id", log_id)
        .execute()
    )
    if not res.data:
        raise LookupError(log_id)
    log = res.data[0]
    # Sync the 'final' classification row.
    client.table("classifications").update(
        {"primary_category": user_choice}
    ).eq("rfi_item_id", log["rfi_item_id"]).eq("prong", "final").execute()
    return log


def update_letter_status(client: Client, letter_id: str, status: str) -> None:
    client.table("rfi_letters").update({"status": status}).eq("id", letter_id).execute()


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
