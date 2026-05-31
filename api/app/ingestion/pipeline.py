"""End-to-end orchestration for one ingestion run.

Glues scraping + persistence + extractor for every URL in a source kind.
This is the only module the CLI and the admin route call into.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.ingestion import persistence
from app.ingestion.extractors import get_extractor
from app.ingestion.models import IngestRunSummary, VeIngestDocument
from app.ingestion.scraping import fetcher
from app.ingestion.scraping.registry import SourceDoc, SourceKindConfig, get_kind

if TYPE_CHECKING:
    from supabase import Client

log = logging.getLogger(__name__)


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _process_one_doc(
    db: Client,
    *,
    kind_cfg: SourceKindConfig,
    doc_cfg: SourceDoc,
    summary: IngestRunSummary,
    force: bool,
    dry_run: bool,
) -> None:
    prior = persistence.find_latest_doc_for_source_key(
        db, source_key=doc_cfg.source_key
    )
    etag = prior.get("etag") if prior and not force else None
    last_modified = prior.get("last_modified") if prior and not force else None

    result = fetcher.fetch(
        doc_cfg.url,
        user_agent=kind_cfg.user_agent,
        rate_limit_seconds=kind_cfg.rate_limit_seconds,
        etag=etag,
        last_modified=last_modified,
    )

    if result.status == "unchanged":
        summary.unchanged += 1
        log.info("ingest: %s unchanged (304)", doc_cfg.source_key)
        return

    if result.status == "error":
        summary.errors.append(
            {
                "source_key": doc_cfg.source_key,
                "url": doc_cfg.url,
                "error": result.error or f"HTTP {result.http_status}",
            }
        )
        return

    # Fetched OK. If we've already seen these exact bytes, skip extraction
    # unless --force was passed.
    assert result.bytes is not None and result.content_hash is not None
    summary.fetched += 1

    if not force:
        existing = persistence.find_doc_by_hash(
            db,
            source_key=doc_cfg.source_key,
            content_hash=result.content_hash,
        )
        if existing:
            summary.unchanged += 1
            log.info(
                "ingest: %s same content_hash as prior fetch, skipping",
                doc_cfg.source_key,
            )
            return

    if dry_run:
        log.info(
            "ingest(dry-run): would persist %s bytes for %s (hash %s)",
            len(result.bytes),
            doc_cfg.source_key,
            result.content_hash[:12],
        )
        return

    content_type = result.content_type or doc_cfg.content_type
    storage_path = persistence.upload_raw(
        db,
        source_kind=kind_cfg.kind,
        content_hash=result.content_hash,
        content_type=content_type,
        data=result.bytes,
    )
    doc: VeIngestDocument = persistence.insert_ingest_document(
        db,
        source_kind=kind_cfg.kind,
        source_key=doc_cfg.source_key,
        source_url=doc_cfg.url,
        storage_path=storage_path,
        content_hash=result.content_hash,
        content_type=content_type,
        etag=result.etag,
        last_modified=result.last_modified,
        bytes_len=len(result.bytes),
    )

    try:
        extractor = get_extractor(kind_cfg.kind)
        candidates = extractor.extract(doc_bytes=result.bytes, doc=doc)
    except Exception as e:  # noqa: BLE001
        persistence.mark_extraction_status(
            db, doc_id=doc.id, status="failed", error=str(e)
        )
        summary.errors.append(
            {
                "source_key": doc_cfg.source_key,
                "url": doc_cfg.url,
                "error": f"extractor: {e}",
            }
        )
        return

    summary.extracted_candidates += len(candidates)
    inserted = 0
    for cand in candidates:
        kb_id = persistence.insert_kb_candidate(
            db, candidate=cand, ingest_document_id=doc.id
        )
        if kb_id:
            inserted += 1
    summary.inserted_kb_rows += inserted

    persistence.mark_extraction_status(
        db,
        doc_id=doc.id,
        status="extracted",
        extractor_name=getattr(extractor, "name", None),
        extractor_version=getattr(extractor, "version", None),
    )


def run_source(
    db: Client,
    *,
    source_kind: str,
    force: bool = False,
    dry_run: bool = False,
) -> IngestRunSummary:
    """Fetch + extract every document for one source_kind.

    Idempotent on (source_key, content_hash): a re-run that finds no
    changed bytes is a no-op apart from a few HEAD-equivalent requests.
    """
    kind_cfg = get_kind(source_kind)
    summary = IngestRunSummary(
        source_kind=source_kind, started_at=_utc_iso()
    )

    for doc_cfg in kind_cfg.documents:
        try:
            _process_one_doc(
                db,
                kind_cfg=kind_cfg,
                doc_cfg=doc_cfg,
                summary=summary,
                force=force,
                dry_run=dry_run,
            )
        except Exception as e:  # noqa: BLE001
            log.exception("ingest: unexpected failure on %s", doc_cfg.source_key)
            summary.errors.append(
                {
                    "source_key": doc_cfg.source_key,
                    "url": doc_cfg.url,
                    "error": f"unhandled: {e}",
                }
            )

    summary.finished_at = _utc_iso()
    return summary
