"""Re-chunk MBIE clauses from already-fetched bytes — no network, no LLM.

The full pipeline (``app.ingestion.run``) couples clause chunking to the
expensive VE-candidate LLM pass and re-fetches from building.govt.nz
(rate-limited, WAF-guarded). When all we need is to (re)populate
``mbie_clauses`` — after a chunker/OCR change, or for a doc that was
fetched but never extracted — that's wasteful.

This backfill pulls each document's stored PDF from the ``ve-ingest``
bucket, runs the native-first + OCR-fallback extractor, and replaces the
clause rows. It applies the same zero-clause guard as the main extractor:
a document with real text that yields no clauses is logged loudly and left
untouched rather than wiping good rows.

    python -m app.ingestion.mbie.backfill --all
    python -m app.ingestion.mbie.backfill --source-key mbie:c_as1 -v
"""

from __future__ import annotations

import argparse
import contextlib
import logging
import sys
from dataclasses import dataclass

from supabase import Client

from app.ingestion import persistence
from app.ingestion.extractors.mbie_acceptable_solution import (
    _code_clause_from_document_id,
    _document_id_from_source_key,
)
from app.ingestion.mbie import (
    extract_clauses_robust,
    has_substantial_text,
    page_texts_native,
    replace_clauses,
)
from app.ingestion.scraping.registry import get_kind

log = logging.getLogger(__name__)

_KIND = "mbie_acceptable_solution"


@dataclass
class BackfillResult:
    source_key: str
    document_id: str
    status: str  # "ok" | "skipped" | "failed"
    clauses: int
    method: str  # "native" | "ocr" | ""
    note: str = ""


def backfill_source_key(db: Client, source_key: str) -> BackfillResult:
    document_id = _document_id_from_source_key(source_key)
    doc = persistence.find_latest_doc_for_source_key(db, source_key=source_key)
    if not doc:
        return BackfillResult(source_key, document_id, "skipped", 0, "",
                              "no fetched document on record")

    storage_path = doc.get("storage_path")
    if not storage_path:
        return BackfillResult(source_key, document_id, "skipped", 0, "",
                              "document row has no storage_path")

    try:
        data = db.storage.from_(persistence.VE_INGEST_BUCKET).download(storage_path)
    except Exception as e:  # noqa: BLE001
        return BackfillResult(source_key, document_id, "failed", 0, "",
                              f"download failed: {e}")

    chunks, method = extract_clauses_robust(data)

    if not chunks:
        substantial = False
        with contextlib.suppress(Exception):
            substantial = has_substantial_text(page_texts_native(data))
        note = ("0 clauses despite substantial text — parse failure"
                if substantial else "0 clauses (no body text?)")
        # Don't persist an empty set: preserve any rows a prior run got right.
        return BackfillResult(source_key, document_id, "failed", 0, method, note)

    n = replace_clauses(
        db,
        document_id=document_id,
        code_clause=_code_clause_from_document_id(document_id),
        chunks=chunks,
        source_url=doc.get("source_url"),
        ingest_document_id=doc.get("id"),
    )
    if doc.get("id"):
        persistence.mark_extraction_status(
            db, doc_id=doc["id"], status="extracted",
            extractor_name="mbie_clause_backfill", extractor_version="1",
        )
    return BackfillResult(source_key, document_id, "ok", n, method)


def backfill(db: Client, source_keys: list[str] | None = None) -> list[BackfillResult]:
    keys = source_keys or [d.source_key for d in get_kind(_KIND).documents]
    results: list[BackfillResult] = []
    for key in keys:
        res = backfill_source_key(db, key)
        results.append(res)
        log.info("backfill %s -> %s (%d clauses, %s) %s",
                 res.source_key, res.status, res.clauses, res.method, res.note)
    return results


def _vec_literal(vec: list[float]) -> str:
    """pgvector text input form: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{x:.7g}" for x in vec) + "]"


def _clause_embed_text(row: dict) -> str:
    parts = [row.get("clause_number") or "", row.get("heading") or "",
             row.get("text") or ""]
    return " ".join(p for p in parts if p).strip()


def embed_missing(db: Client, *, document_id: str | None = None, page: int = 400) -> int:
    """Populate `embedding` for mbie_clauses rows that lack one (dense, via
    OpenRouter). Re-querying `embedding is null` naturally paginates as we
    fill them. Returns the number embedded."""
    from app.llm.embeddings import embed_texts

    total = 0
    while True:
        q = (
            db.table("mbie_clauses")
            .select("id,clause_number,heading,text")
            .is_("embedding", "null")
        )
        if document_id:
            q = q.eq("document_id", document_id)
        rows = q.limit(page).execute().data or []
        if not rows:
            break
        vecs = embed_texts([_clause_embed_text(r) for r in rows])
        for r, v in zip(rows, vecs, strict=True):
            db.table("mbie_clauses").update({"embedding": _vec_literal(v)}).eq(
                "id", r["id"]
            ).execute()
        total += len(rows)
        log.info("embed_missing: embedded %d (running %d)", len(rows), total)
    return total


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m app.ingestion.mbie.backfill",
        description="Re-chunk and/or embed mbie_clauses (no full pipeline run).",
    )
    p.add_argument("--source-key", action="append", dest="source_keys",
                   help="re-chunk this source_key from stored bytes (repeatable)")
    p.add_argument("--all", action="store_true",
                   help="re-chunk every configured mbie_acceptable_solution doc")
    p.add_argument("--embed", action="store_true",
                   help="populate dense embeddings for clauses missing one")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if not (args.all or args.source_keys or args.embed):
        print("nothing to do: pass --all, --source-key, and/or --embed",
              file=sys.stderr)
        return 2
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    from app.auth import get_service_db

    try:
        db = get_service_db()
    except Exception as e:  # noqa: BLE001
        print(f"failed to build supabase client: {e}", file=sys.stderr)
        return 2

    failed: list[BackfillResult] = []
    if args.all or args.source_keys:
        results = backfill(db, None if args.all else args.source_keys)
        failed = [r for r in results if r.status == "failed"]
        for r in results:
            print(f"  {r.status:7} {r.document_id:12} {r.clauses:4} clauses "
                  f"[{r.method or '-'}] {r.note}")
        print(f"\n{len(results)} docs: "
              f"{sum(1 for r in results if r.status=='ok')} ok, "
              f"{sum(1 for r in results if r.status=='skipped')} skipped, "
              f"{len(failed)} failed")

    if args.embed:
        n = embed_missing(db)
        print(f"embedded {n} clause(s)")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
