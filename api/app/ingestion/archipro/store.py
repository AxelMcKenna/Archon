"""SQLite-backed materials/pricing store for the ArchiPro crawl.

Why SQLite and not Supabase: the catalogue is ~28k rows that we want to
crawl over hours, resume after interruption, and query offline while
building the VE engine. A single file (``api/data/archipro_materials.db``)
is the least-moving-parts way to get durability + resumability + ad-hoc
SQL. A later sync step can push the curated subset into Supabase.

Resumability model: every product carries the sitemap ``lastmod``. The
crawler asks :meth:`needs_fetch` before hitting the network — a product
already stored with the same ``source_lastmod`` is skipped, so a re-run
naturally continues where it stopped and only refetches changed pages.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from app.ingestion.archipro.extract import MaterialRecord

DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "archipro_materials.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS materials (
    product_id      TEXT PRIMARY KEY,
    url             TEXT NOT NULL,
    name            TEXT NOT NULL,
    brand           TEXT,
    description     TEXT,
    category        TEXT,
    subcategory     TEXT,
    category_path   TEXT,            -- " > "-joined breadcrumb
    price           REAL,            -- NULL = quote-only / not listed
    currency        TEXT,
    price_listed    INTEGER NOT NULL DEFAULT 0,
    availability    TEXT,
    image           TEXT,
    source_lastmod  TEXT,            -- from the sitemap <lastmod>
    content_hash    TEXT,            -- sha256 of the fetched page
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_materials_brand ON materials(brand);
CREATE INDEX IF NOT EXISTS idx_materials_price_listed ON materials(price_listed);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    discovered   INTEGER NOT NULL DEFAULT 0,
    fetched      INTEGER NOT NULL DEFAULT 0,
    skipped      INTEGER NOT NULL DEFAULT 0,
    upserted     INTEGER NOT NULL DEFAULT 0,
    priced       INTEGER NOT NULL DEFAULT 0,
    errors       INTEGER NOT NULL DEFAULT 0,
    notes        TEXT
);
"""


@dataclass
class StoreStats:
    total: int
    priced: int
    categories: int
    brands: int


class MaterialsStore:
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path))
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> MaterialsStore:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- resumability ---------------------------------------------------

    def needs_fetch(self, *, product_id: str, source_lastmod: str | None) -> bool:
        """True if this product is unseen or its sitemap lastmod changed.

        A product keyed by URL slug (no productID yet) is identified the
        same way the extractor would, but the crawler usually only knows
        the URL up front — so callers normally pass the URL-derived key
        AND fall back to a URL lookup; see :meth:`needs_fetch_url`."""
        row = self._conn.execute(
            "SELECT source_lastmod FROM materials WHERE product_id = ?",
            (product_id,),
        ).fetchone()
        if row is None:
            return True
        if source_lastmod is None:
            return False  # already have it, no newer signal
        return row["source_lastmod"] != source_lastmod

    def needs_fetch_url(self, *, url: str, source_lastmod: str | None) -> bool:
        """Resumability check keyed on URL — used before we've fetched the
        page and therefore don't yet know the productID."""
        row = self._conn.execute(
            "SELECT source_lastmod FROM materials WHERE url = ?",
            (url,),
        ).fetchone()
        if row is None:
            return True
        if source_lastmod is None:
            return False
        return row["source_lastmod"] != source_lastmod

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
        with closing(self._conn.cursor()) as cur:
            cur.execute(
                """
                INSERT INTO materials (
                    product_id, url, name, brand, description, category,
                    subcategory, category_path, price, currency, price_listed,
                    availability, image, source_lastmod, content_hash,
                    first_seen, last_seen
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(product_id) DO UPDATE SET
                    url=excluded.url,
                    name=excluded.name,
                    brand=excluded.brand,
                    description=excluded.description,
                    category=excluded.category,
                    subcategory=excluded.subcategory,
                    category_path=excluded.category_path,
                    price=excluded.price,
                    currency=excluded.currency,
                    price_listed=excluded.price_listed,
                    availability=excluded.availability,
                    image=excluded.image,
                    source_lastmod=excluded.source_lastmod,
                    content_hash=excluded.content_hash,
                    last_seen=excluded.last_seen
                """,
                (
                    rec.product_id, rec.url, rec.name, rec.brand, rec.description,
                    rec.category, rec.subcategory, path, rec.price, rec.currency,
                    1 if rec.price_listed else 0, rec.availability, rec.image,
                    source_lastmod, content_hash, now_iso, now_iso,
                ),
            )
        self._conn.commit()

    # -- crawl-run bookkeeping -----------------------------------------

    def start_run(self, *, now_iso: str, notes: str | None = None) -> int:
        cur = self._conn.execute(
            "INSERT INTO crawl_runs (started_at, notes) VALUES (?, ?)",
            (now_iso, notes),
        )
        self._conn.commit()
        return int(cur.lastrowid)

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
        self._conn.execute(
            """UPDATE crawl_runs SET finished_at=?, discovered=?, fetched=?,
               skipped=?, upserted=?, priced=?, errors=? WHERE id=?""",
            (now_iso, discovered, fetched, skipped, upserted, priced, errors, run_id),
        )
        self._conn.commit()

    # -- reads ----------------------------------------------------------

    def stats(self) -> StoreStats:
        c = self._conn.execute(
            """SELECT
                 COUNT(*) AS total,
                 SUM(price_listed) AS priced,
                 COUNT(DISTINCT category) AS cats,
                 COUNT(DISTINCT brand) AS brands
               FROM materials"""
        ).fetchone()
        return StoreStats(
            total=c["total"] or 0,
            priced=c["priced"] or 0,
            categories=c["cats"] or 0,
            brands=c["brands"] or 0,
        )
