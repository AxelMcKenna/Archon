"""Supabase-backed materials store — the Bunnings crawl's production sink.

Writes into ``public.bunnings_materials`` in the ARCHON project via the
service-role client. Mirrors :class:`MaterialsStore` so the crawler is
storage-agnostic:

* **Resumability without a per-URL round-trip** — preload every existing
  product URL into memory on construction.
* **Batched upserts** — buffer rows and flush in batches
  (``ON CONFLICT(sku)`` via Supabase upsert).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.ingestion.bunnings.extract import BunningsMaterialRecord
from app.ingestion.bunnings.store import StoreStats

if TYPE_CHECKING:
    from supabase import Client

log = logging.getLogger(__name__)

MATERIALS_TABLE = "bunnings_materials"
RUNS_TABLE = "bunnings_crawl_runs"


class SupabaseMaterialsStore:
    def __init__(self, db: Client, *, batch_size: int = 200) -> None:
        self._db = db
        self._batch_size = batch_size
        self._buffer: list[dict] = []
        self._seen: set[str] = set()
        self._preload_seen()

    def _preload_seen(self) -> None:
        """Page through existing rows so resumability checks are in-memory."""
        page = 0
        size = 1000
        while True:
            rows = (
                self._db.table(MATERIALS_TABLE)
                .select("url")
                .range(page * size, page * size + size - 1)
                .execute()
                .data
            )
            if not rows:
                break
            for r in rows:
                self._seen.add(r["url"])
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

    def needs_fetch_url(self, *, url: str) -> bool:
        return url not in self._seen

    # -- writes ---------------------------------------------------------

    def upsert(self, rec: BunningsMaterialRecord, *, now_iso: str) -> None:
        path = " > ".join(rec.category_path) if rec.category_path else None
        self._buffer.append(
            {
                "sku": rec.sku,
                "url": rec.url,
                "name": rec.name,
                "brand": rec.brand,
                "description": rec.description,
                "category": rec.category,
                "subcategory": rec.subcategory,
                "category_path": path,
                "price": rec.price,
                "unit_price": rec.unit_price,
                "unit_of_measure": rec.unit_of_measure,
                "currency": rec.currency,
                "price_listed": rec.price_listed,
                "last_seen": now_iso,
            }
        )
        self._seen.add(rec.url)
        if len(self._buffer) >= self._batch_size:
            self.flush()

    def flush(self) -> None:
        if not self._buffer:
            return
        # on_conflict makes this an idempotent upsert keyed on sku.
        self._db.table(MATERIALS_TABLE).upsert(
            self._buffer, on_conflict="sku"
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
        categories: int,
        discovered: int,
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
                "categories": categories,
                "discovered": discovered,
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
            .select("sku", count="exact")
            .limit(1)
            .execute()
            .count
            or 0
        )
        priced = (
            self._db.table(MATERIALS_TABLE)
            .select("sku", count="exact")
            .eq("price_listed", True)
            .limit(1)
            .execute()
            .count
            or 0
        )
        return StoreStats(total=total, priced=priced, categories=0)
