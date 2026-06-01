"""SQLite-backed materials/pricing store for the Bunnings crawl.

A single file (``api/data/bunnings_materials.db``) for durability +
resumability + ad-hoc SQL while building the VE engine. A later sync step
pushes the curated subset into Supabase.

Schema note vs ArchiPro: Bunnings publishes a per-unit comparison price
(``unit_price`` / ``unit_of_measure``) on top of the pack/length total in
``price`` — VE costs material substitutions per unit, so we keep those.

Resumability: ``needs_fetch_url`` skips products already stored, so a
re-run only adds new SKUs; pass ``force`` to refresh existing rows.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from app.ingestion.bunnings.extract import BunningsMaterialRecord

DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "bunnings_materials.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS materials (
    sku             TEXT PRIMARY KEY,
    url             TEXT NOT NULL,
    name            TEXT NOT NULL,
    brand           TEXT,
    description     TEXT,
    category        TEXT,
    subcategory     TEXT,
    category_path   TEXT,            -- " > "-joined breadcrumb
    price           REAL,            -- pack/length total; NULL = quote-only
    unit_price      REAL,            -- per-unit comparison price
    unit_of_measure TEXT,            -- e.g. "linear metre", "each", "m2"
    currency        TEXT,
    price_listed    INTEGER NOT NULL DEFAULT 0,
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bun_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_bun_materials_price_listed ON materials(price_listed);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    categories   INTEGER NOT NULL DEFAULT 0,
    discovered   INTEGER NOT NULL DEFAULT 0,
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

    def needs_fetch_url(self, *, url: str) -> bool:
        """True if no product with this URL is stored yet."""
        row = self._conn.execute(
            "SELECT 1 FROM materials WHERE url = ? LIMIT 1", (url,)
        ).fetchone()
        return row is None

    # -- writes ---------------------------------------------------------

    def upsert(self, rec: BunningsMaterialRecord, *, now_iso: str) -> None:
        path = " > ".join(rec.category_path) if rec.category_path else None
        with closing(self._conn.cursor()) as cur:
            cur.execute(
                """
                INSERT INTO materials (
                    sku, url, name, brand, description, category, subcategory,
                    category_path, price, unit_price, unit_of_measure,
                    currency, price_listed, first_seen, last_seen
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(sku) DO UPDATE SET
                    url=excluded.url,
                    name=excluded.name,
                    brand=excluded.brand,
                    description=excluded.description,
                    category=excluded.category,
                    subcategory=excluded.subcategory,
                    category_path=excluded.category_path,
                    price=excluded.price,
                    unit_price=excluded.unit_price,
                    unit_of_measure=excluded.unit_of_measure,
                    currency=excluded.currency,
                    price_listed=excluded.price_listed,
                    last_seen=excluded.last_seen
                """,
                (
                    rec.sku, rec.url, rec.name, rec.brand, rec.description,
                    rec.category, rec.subcategory, path, rec.price,
                    rec.unit_price, rec.unit_of_measure, rec.currency,
                    1 if rec.price_listed else 0, now_iso, now_iso,
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
        categories: int,
        discovered: int,
        skipped: int,
        upserted: int,
        priced: int,
        errors: int,
    ) -> None:
        self._conn.execute(
            """UPDATE crawl_runs SET finished_at=?, categories=?, discovered=?,
               skipped=?, upserted=?, priced=?, errors=? WHERE id=?""",
            (now_iso, categories, discovered, skipped, upserted, priced, errors, run_id),
        )
        self._conn.commit()

    # -- reads ----------------------------------------------------------

    def stats(self) -> StoreStats:
        c = self._conn.execute(
            """SELECT COUNT(*) AS total, SUM(price_listed) AS priced,
                      COUNT(DISTINCT category) AS cats FROM materials"""
        ).fetchone()
        return StoreStats(
            total=c["total"] or 0,
            priced=c["priced"] or 0,
            categories=c["cats"] or 0,
        )
