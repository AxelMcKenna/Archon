"""Persistence helpers for MBIE clauses.

Idempotent replace-by-document_id: re-ingesting the same MBIE doc
(e.g. after a clause-extraction tweak) deletes existing rows for that
document and inserts the new set. Chunked inserts keep individual
statements small.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.ingestion.mbie.chunker import ClauseChunk

_INSERT_CHUNK = 500


def _chunk_to_row(
    chunk: ClauseChunk,
    *,
    document_id: str,
    code_clause: str,
    amendment_version: str | None,
    source_url: str | None,
    ingest_document_id: str | None,
) -> dict[str, Any]:
    return {
        "ingest_document_id": ingest_document_id,
        "document_id": document_id,
        "code_clause": code_clause,
        "clause_number": chunk.clause_number,
        "heading": chunk.heading[:500],
        "text": chunk.text,
        "page": chunk.page,
        "amendment_version": amendment_version,
        "source_url": source_url,
    }


def replace_clauses(
    db: Client,
    *,
    document_id: str,
    code_clause: str,
    chunks: list[ClauseChunk],
    amendment_version: str | None = None,
    source_url: str | None = None,
    ingest_document_id: str | None = None,
) -> int:
    """Replace all mbie_clauses rows for ``document_id`` with ``chunks``.

    Returns the number of rows inserted.
    """
    db.table("mbie_clauses").delete().eq("document_id", document_id).execute()

    if not chunks:
        return 0

    rows = [
        _chunk_to_row(
            c,
            document_id=document_id,
            code_clause=code_clause,
            amendment_version=amendment_version,
            source_url=source_url,
            ingest_document_id=ingest_document_id,
        )
        for c in chunks
    ]

    inserted = 0
    for i in range(0, len(rows), _INSERT_CHUNK):
        batch = rows[i : i + _INSERT_CHUNK]
        db.table("mbie_clauses").insert(batch).execute()
        inserted += len(batch)
    return inserted
