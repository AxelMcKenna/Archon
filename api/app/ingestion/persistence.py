"""Persistence helpers for the ingestion layer.

- Upload raw fetched bytes to the ``ve-ingest`` Supabase Storage bucket
- Upsert ``ve_ingest_documents`` rows (idempotent on source_key + content_hash)
- Look up prior fetch state for conditional requests
- Insert KB candidates into ``ve_knowledge_base`` with status='review'

All DB writes use the request/run-scoped Supabase client passed by the
caller, so RLS applies.
"""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client

from app.ingestion.models import KBCandidate, VeIngestDocument

log = logging.getLogger(__name__)

VE_INGEST_BUCKET = "ve-ingest"


def _ext_for(content_type: str | None) -> str:
    if not content_type:
        return "bin"
    ct = content_type.split(";", 1)[0].strip().lower()
    return {
        "application/pdf": "pdf",
        "text/html": "html",
        "text/plain": "txt",
        "application/json": "json",
        "application/xml": "xml",
        "text/xml": "xml",
    }.get(ct, "bin")


def storage_path_for(source_kind: str, content_hash: str, content_type: str | None) -> str:
    return f"{source_kind}/{content_hash}.{_ext_for(content_type)}"


def upload_raw(
    db: Client,
    *,
    source_kind: str,
    content_hash: str,
    content_type: str | None,
    data: bytes,
) -> str:
    """Upload bytes to the ve-ingest bucket. Idempotent — re-upload of the
    same hash is a no-op via upsert."""
    path = storage_path_for(source_kind, content_hash, content_type)
    db.storage.from_(VE_INGEST_BUCKET).upload(
        path,
        data,
        {"content-type": content_type or "application/octet-stream", "upsert": "true"},
    )
    return path


def find_latest_doc_for_source_key(
    db: Client, *, source_key: str
) -> dict[str, Any] | None:
    rows = (
        db.table("ve_ingest_documents")
        .select(
            "id, source_kind, source_key, source_url, storage_path, "
            "content_hash, content_type, etag, last_modified, bytes, "
            "extraction_status"
        )
        .eq("source_key", source_key)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def find_doc_by_hash(
    db: Client, *, source_key: str, content_hash: str
) -> dict[str, Any] | None:
    rows = (
        db.table("ve_ingest_documents")
        .select(
            "id, source_kind, source_key, source_url, storage_path, "
            "content_hash, content_type, etag, last_modified, bytes, "
            "extraction_status"
        )
        .eq("source_key", source_key)
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def insert_ingest_document(
    db: Client,
    *,
    source_kind: str,
    source_key: str,
    source_url: str,
    storage_path: str,
    content_hash: str,
    content_type: str | None,
    etag: str | None,
    last_modified: str | None,
    bytes_len: int,
) -> VeIngestDocument:
    row = {
        "source_kind": source_kind,
        "source_key": source_key,
        "source_url": source_url,
        "storage_path": storage_path,
        "content_hash": content_hash,
        "content_type": content_type,
        "etag": etag,
        "last_modified": last_modified,
        "bytes": bytes_len,
        "extraction_status": "pending",
    }
    res = db.table("ve_ingest_documents").insert(row).execute().data
    inserted = res[0] if res else {}
    return VeIngestDocument(
        id=str(inserted.get("id", "")),
        source_kind=source_kind,
        source_key=source_key,
        source_url=source_url,
        storage_path=storage_path,
        content_hash=content_hash,
        content_type=content_type,
        etag=etag,
        last_modified=last_modified,
        bytes=bytes_len,
        extraction_status="pending",
    )


def mark_extraction_status(
    db: Client,
    *,
    doc_id: str,
    status: str,
    extractor_name: str | None = None,
    extractor_version: str | None = None,
    error: str | None = None,
) -> None:
    patch: dict[str, Any] = {
        "extraction_status": status,
        "extraction_at": "now()",
    }
    if extractor_name is not None:
        patch["extractor_name"] = extractor_name
    if extractor_version is not None:
        patch["extractor_version"] = extractor_version
    if error is not None:
        patch["extraction_error"] = error[:500]
    db.table("ve_ingest_documents").update(patch).eq("id", doc_id).execute()


def insert_kb_candidate(
    db: Client, *, candidate: KBCandidate, ingest_document_id: str | None
) -> str | None:
    row = {
        "category": candidate.category,
        "subcategory": candidate.subcategory,
        "current_spec_patterns": candidate.current_spec_patterns,
        "proposed_alternative": candidate.proposed_alternative,
        "applicability_conditions": candidate.applicability_conditions,
        "code_references": candidate.code_references,
        "savings_band": candidate.savings_band,
        "savings_note": candidate.savings_note or candidate.rationale,
        "source": candidate.source,
        "source_url": candidate.source_url,
        "confidence": candidate.confidence,
        "status": "review",
        "bca_specific": candidate.bca_specific,
        "ingest_document_id": ingest_document_id,
        "extracted_clause": candidate.extracted_clause,
    }
    res = db.table("ve_knowledge_base").insert(row).execute().data
    if res:
        return str(res[0].get("id", "")) or None
    return None


__all__ = [
    "VE_INGEST_BUCKET",
    "find_doc_by_hash",
    "find_latest_doc_for_source_key",
    "insert_ingest_document",
    "insert_kb_candidate",
    "mark_extraction_status",
    "storage_path_for",
    "upload_raw",
]
