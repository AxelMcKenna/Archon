"""Supabase-backed materials store — the crawl's production sink.

Writes straight into ``public.archipro_materials`` in the ARRO project
via the service-role client (same client the rest of the ingestion layer
uses). Mirrors the :class:`MaterialsStore` interface so the crawler is
storage-agnostic.

Two design choices for crawling ~28k rows over hours:

* **Resumability without a per-URL round-trip.** On construction we
  preload ``{url: source_lastmod}`` for every existing row into memory.
  ``needs_fetch_url`` is then an in-memory check — a re-run skips
  unchanged products instantly and only refetches changed lastmods.
* **Batched upserts.** ``upsert`` buffers rows and flushes in batches
  (``ON CONFLICT(product_id)`` via Supabase upsert), so we make one DB
  write per ~200 products instead of per product.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.ingestion.archipro.extract import MaterialRecord
from app.ingestion.archipro.store import StoreStats

if TYPE_CHECKING:
    from supabase import Client

log = logging.getLogger(__name__)

MATERIALS_TABLE = "archipro_materials"
RUNS_TABLE = "archipro_crawl_runs"


class SupabaseMaterialsStore:
    def __init__(self, db: Client, *, batch_size: int = 200) -> None:
        self._db = db
        self._batch_size = batch_size
        self._buffer: list[dict] = []
        self._priced_flushed = 0
        self._seen: dict[str, str | None] = {}
        self._preload_seen()

    def _preload_seen(self) -> None:
        """Page through existing rows so resumability checks are in-memory."""
        page = 0
        size = 1000
        while True:
            rows = (
                self._db.table(MATERIALS_TABLE)
                .select("url, source_lastmod")
                .range(page * size, page * size + size - 1)
                .execute()
                .data
            )
            if not rows:
                break
            for r in rows:
                self._seen[r["url"]] = r.get("source_lastmod")
            if len(rows) < size:
                break
            page += 1
        log.info("supabase store: preloaded %d existing materials", len(self._seen))

    def __enter__(self) -> SupabaseMaterialsStore:
        return self

    def __exit__(self, *exc: object) -> None:
        self.flush()

    def close(self) -> None:
        self.flush()

    # -- resumability ---------------------------------------------------

    def needs_fetch_url(self, *, url: str, source_lastmod: str | None) -> bool:
        if url not in self._seen:
            return True
        if source_lastmod is None:
            return False
        return self._seen[url] != source_lastmod

    # -- writes ---------------------------------------------------------

    def upsert(
        self,
        rec: MaterialRecord,
        *,
        now_iso: str,
        source_lastmod: str | None,
        content_hash: str | None,
    ) -> None:
        path = " > ".join(rec.category_path) if rec.category_path else None
        self._buffer.append(
            {
                "product_id": rec.product_id,
                "url": rec.url,
                "name": rec.name,
                "brand": rec.brand,
                "description": rec.description,
                "category": rec.category,
                "subcategory": rec.subcategory,
                "category_path": path,
                "price": rec.price,
                "currency": rec.currency,
                "price_listed": rec.price_listed,
                "availability": rec.availability,
                "image": rec.image,
                "source_lastmod": source_lastmod,
                "content_hash": content_hash,
                "last_seen": now_iso,
            }
        )
        self._seen[rec.url] = source_lastmod
        if len(self._buffer) >= self._batch_size:
            self.flush()

    def flush(self) -> None:
        if not self._buffer:
            return
        # on_conflict makes this an idempotent upsert keyed on product_id.
        self._db.table(MATERIALS_TABLE).upsert(
            self._buffer, on_conflict="product_id"
        ).execute()
        log.info("supabase store: flushed %d materials", len(self._buffer))
        self._buffer.clear()

    # -- crawl-run bookkeeping -----------------------------------------

    def start_run(self, *, now_iso: str, notes: str | None = None) -> int:
        res = (
            self._db.table(RUNS_TABLE)
            .insert({"started_at": now_iso, "notes": notes})
            .execute()
            .data
        )
        return int(res[0]["id"]) if res else 0

    def finish_run(
        self,
        run_id: int,
        *,
        now_iso: str,
        discovered: int,
        fetched: int,
        skipped: int,
        upserted: int,
        priced: int,
        errors: int,
    ) -> None:
        self.flush()
        if not run_id:
            return
        self._db.table(RUNS_TABLE).update(
            {
                "finished_at": now_iso,
                "discovered": discovered,
                "fetched": fetched,
                "skipped": skipped,
                "upserted": upserted,
                "priced": priced,
                "errors": errors,
            }
        ).eq("id", run_id).execute()

    # -- reads ----------------------------------------------------------

    def stats(self) -> StoreStats:
        total = (
            self._db.table(MATERIALS_TABLE)
            .select("product_id", count="exact")
            .limit(1)
            .execute()
            .count
            or 0
        )
        priced = (
            self._db.table(MATERIALS_TABLE)
            .select("product_id", count="exact")
            .eq("price_listed", True)
            .limit(1)
            .execute()
            .count
            or 0
        )
        # Distinct category/brand counts aren't cheap via PostgREST; left at 0
        # here — use the MCP / SQL for exact breakdowns.
        return StoreStats(total=total, priced=priced, categories=0, brands=0)
