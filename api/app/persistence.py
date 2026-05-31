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
    plan_upload_id: str | None = None,
    cad_upload_id: str | None = None,
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
        "plan_upload_id": plan_upload_id,
        "cad_upload_id": cad_upload_id,
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
    meta = canonical.rfi_letter.extraction
    row: dict[str, Any] = {
        "rfi_letter_id": letter_id,
        "extractor": meta.extractor,
        "extractor_version": meta.extractor_version,
        "raw_output": canonical.model_dump(mode="json"),
        "processing_ms": metrics.processing_ms,
        "cost_usd": round(metrics.cost_usd, 6),
    }
    if meta.prompt_version is not None:
        row["prompt_version"] = meta.prompt_version
    client.table("rfi_extractions").insert(row).execute()


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


def replace_letter_classifications(
    client: Client,
    *,
    letter_id: str,
    item_db_ids: list[str],
    finals_by_item: dict[str, FinalClassification],
) -> dict[str, str]:
    """Idempotent batched replacement of a letter's classifications.

    Three round-trips total (vs. 3N for the per-item path):

      1. DELETE classifications for every item in this letter.
      2. INSERT all classifications rows (3 prongs × N items) in one call.
      3. INSERT all reconciliation_log rows (1 × N items) in one call.

    Returns {rfi_item_id: reconciliation_log_id}.
    """
    if not item_db_ids:
        return {}

    client.table("classifications").delete().in_("rfi_item_id", item_db_ids).execute()

    classification_rows: list[dict[str, Any]] = []
    log_rows: list[dict[str, Any]] = []

    for db_item_id in item_db_ids:
        final = finals_by_item.get(db_item_id)
        if final is None:
            continue
        rules = final.rules_output
        ai = final.ai_output
        rule_ids = [h.rule_id for h in rules.hits]
        rules_primary = rules.primary_category or "documentation:other"
        rules_severity = rules.hits[0].severity if rules.hits else "must_resolve"
        rules_confidence = rules.hits[0].confidence if rules.hits else "low"

        classification_rows.extend(
            [
                {
                    "rfi_item_id": db_item_id,
                    "prong": "rules",
                    "primary_category": rules_primary,
                    "severity": rules_severity,
                    "confidence": rules_confidence,
                    "rule_ids": rule_ids,
                    "rules_version": rules.rules_version,
                },
                {
                    "rfi_item_id": db_item_id,
                    "prong": "ai",
                    "primary_category": ai.primary_category,
                    "secondary_category": ai.secondary_category,
                    "severity": ai.severity,
                    "confidence": ai.confidence,
                    "reasoning": ai.reasoning,
                    "prompt_version": ai.prompt_version,
                },
                {
                    "rfi_item_id": db_item_id,
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
        )
        log_rows.append(
            {
                "rfi_item_id": db_item_id,
                "state": final.state,
                "rules_output": rules.model_dump(mode="json"),
                "ai_output": ai.model_dump(mode="json"),
                "final_category": final.primary_category,
                "final_severity": final.severity,
                "rules_version": rules.rules_version,
                "prompt_version": ai.prompt_version,
            }
        )

    if classification_rows:
        client.table("classifications").insert(classification_rows).execute()

    log_id_by_item: dict[str, str] = {}
    if log_rows:
        log_resp = client.table("reconciliation_log").insert(log_rows).execute()
        for row in log_resp.data or []:
            item_id = row.get("rfi_item_id")
            row_id = row.get("id")
            if item_id and row_id:
                log_id_by_item[item_id] = row_id
    return log_id_by_item


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


def upsert_response(
    client: Client,
    *,
    rfi_item_id: str,
    draft_text: str,
    prompt_version: str,
) -> dict[str, Any]:
    res = (
        client.table("responses")
        .upsert(
            {
                "rfi_item_id": rfi_item_id,
                "draft_text": draft_text,
                "prompt_version": prompt_version,
                "edited_text": None,
                "edit_distance": 0,
            },
            on_conflict="rfi_item_id",
        )
        .execute()
    )
    return res.data[0]


def update_response_edit(
    client: Client,
    *,
    rfi_item_id: str,
    edited_text: str,
    edit_distance: int,
) -> dict[str, Any]:
    res = (
        client.table("responses")
        .update({"edited_text": edited_text, "edit_distance": edit_distance})
        .eq("rfi_item_id", rfi_item_id)
        .execute()
    )
    if not res.data:
        raise LookupError(rfi_item_id)
    return res.data[0]


def fetch_response(client: Client, rfi_item_id: str) -> dict[str, Any] | None:
    res = (
        client.table("responses")
        .select("*")
        .eq("rfi_item_id", rfi_item_id)
        .maybe_single()
        .execute()
    )
    return res.data


def fetch_responses_for_letter(client: Client, letter_id: str) -> list[dict[str, Any]]:
    res = (
        client.table("responses")
        .select("*, rfi_items!inner(id, item_id, ordering, raw_number, raw_text, rfi_letter_id)")
        .eq("rfi_items.rfi_letter_id", letter_id)
        .execute()
    )
    return res.data or []


def fetch_classifications_final(
    client: Client, letter_id: str
) -> dict[str, dict[str, Any]]:
    """Final classification keyed by rfi_item_id."""
    res = (
        client.table("classifications")
        .select("*, rfi_items!inner(id, rfi_letter_id)")
        .eq("rfi_items.rfi_letter_id", letter_id)
        .eq("prong", "final")
        .execute()
    )
    return {r["rfi_item_id"]: r for r in (res.data or [])}


def insert_attachment(
    client: Client,
    *,
    rfi_item_id: str | None,
    project_id: str | None,
    filename: str,
    storage_path: str,
    mime_type: str,
    size_bytes: int,
) -> dict[str, Any]:
    res = (
        client.table("attachments")
        .insert(
            {
                "rfi_item_id": rfi_item_id,
                "project_id": project_id,
                "filename": filename,
                "storage_path": storage_path,
                "mime_type": mime_type,
                "size_bytes": size_bytes,
            }
        )
        .execute()
    )
    return res.data[0]


def fetch_attachments_for_letter(
    client: Client, letter_id: str
) -> dict[str, list[dict[str, Any]]]:
    """Attachments keyed by rfi_item_id."""
    res = (
        client.table("attachments")
        .select("*, rfi_items!inner(id, rfi_letter_id)")
        .eq("rfi_items.rfi_letter_id", letter_id)
        .execute()
    )
    out: dict[str, list[dict[str, Any]]] = {}
    for r in res.data or []:
        out.setdefault(r["rfi_item_id"], []).append(r)
    return out


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
