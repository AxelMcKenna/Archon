"""Orchestrate the ArchiPro materials crawl and expose a CLI.

    python -m app.ingestion.archipro.crawl --limit 500 -v
    python -m app.ingestion.archipro.crawl --sitemaps 1,2 --rate 1.5
    python -m app.ingestion.archipro.crawl            # full crawl, resumable

Pipeline per URL: resumability check -> polite fetch (conditional) ->
JSON-LD extract -> SQLite upsert. Safe to Ctrl-C and re-run: each product
commits independently and is skipped on the next run while its sitemap
lastmod is unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.ingestion.archipro import discovery
from app.ingestion.archipro.extract import extract_material
from app.ingestion.archipro.store import DEFAULT_DB_PATH, MaterialsStore
from app.ingestion.scraping import fetcher

log = logging.getLogger(__name__)

USER_AGENT = "Atlas-VE-Ingest/0.1 (+contact: axel.mckenna7@gmail.com)"
DEFAULT_RATE_SECONDS = 1.5


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class CrawlSummary:
    discovered: int = 0
    fetched: int = 0
    skipped: int = 0
    upserted: int = 0
    priced: int = 0
    not_product: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)


def crawl(
    *,
    store: MaterialsStore,
    rate_limit_seconds: float = DEFAULT_RATE_SECONDS,
    limit: int | None = None,
    sitemap_indices: list[int] | None = None,
    force: bool = False,
    user_agent: str = USER_AGENT,
) -> CrawlSummary:
    summary = CrawlSummary()
    run_id = store.start_run(
        now_iso=_utc_iso(),
        notes=f"limit={limit} sitemaps={sitemap_indices} force={force}",
    )

    discovered = discovery.discover_products(
        user_agent=user_agent,
        rate_limit_seconds=rate_limit_seconds,
        sitemap_indices=sitemap_indices,
    )
    summary.discovered = len(discovered)
    log.info("crawl: discovered %d product urls", summary.discovered)

    processed = 0
    for d in discovered:
        if limit is not None and processed >= limit:
            break

        if not force and not store.needs_fetch_url(url=d.url, source_lastmod=d.lastmod):
            summary.skipped += 1
            continue

        processed += 1
        res = fetcher.fetch(
            d.url, user_agent=user_agent, rate_limit_seconds=rate_limit_seconds
        )
        if res.status == "unchanged":
            summary.skipped += 1
            continue
        if res.status == "error" or res.bytes is None:
            summary.errors.append({"url": d.url, "error": res.error or f"HTTP {res.http_status}"})
            continue

        summary.fetched += 1
        html = res.bytes.decode("utf-8", errors="replace")
        rec = extract_material(html=html, url=d.url)
        if rec is None:
            summary.not_product += 1
            log.warning("crawl: no Product JSON-LD at %s", d.url)
            continue

        content_hash = res.content_hash or hashlib.sha256(res.bytes).hexdigest()
        store.upsert(
            rec, now_iso=_utc_iso(), source_lastmod=d.lastmod, content_hash=content_hash
        )
        summary.upserted += 1
        if rec.price_listed:
            summary.priced += 1

        if summary.upserted % 100 == 0:
            log.info(
                "crawl: %d upserted (%d priced), %d skipped, %d errors",
                summary.upserted,
                summary.priced,
                summary.skipped,
                len(summary.errors),
            )

    store.finish_run(
        run_id,
        now_iso=_utc_iso(),
        discovered=summary.discovered,
        fetched=summary.fetched,
        skipped=summary.skipped,
        upserted=summary.upserted,
        priced=summary.priced,
        errors=len(summary.errors),
    )
    return summary


def _parse_sitemaps(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    return [int(x) for x in raw.split(",") if x.strip()]


def _open_store(args: argparse.Namespace):
    """Build the storage backend selected on the CLI."""
    if args.backend == "sqlite":
        return MaterialsStore(args.db)
    from app.auth import get_service_db
    from app.ingestion.archipro.store_supabase import SupabaseMaterialsStore

    return SupabaseMaterialsStore(get_service_db())


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m app.ingestion.archipro.crawl",
        description="Crawl ArchiPro product pages into the materials/pricing SQLite DB.",
    )
    p.add_argument(
        "--backend",
        choices=("supabase", "sqlite"),
        default="supabase",
        help="where to write materials (default: supabase ATLAS project)",
    )
    p.add_argument(
        "--db",
        default=str(DEFAULT_DB_PATH),
        help="SQLite DB path (only used with --backend sqlite)",
    )
    p.add_argument("--limit", type=int, default=None, help="max NEW products to fetch this run")
    p.add_argument(
        "--sitemaps", default=None, help="comma-separated 1-based sitemap indices, e.g. 1,2"
    )
    p.add_argument(
        "--rate",
        type=float,
        default=DEFAULT_RATE_SECONDS,
        help="seconds between requests to archipro.co.nz",
    )
    p.add_argument("--force", action="store_true", help="refetch even if lastmod is unchanged")
    p.add_argument("-v", "--verbose", action="store_true", help="enable INFO logging")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    with _open_store(args) as store:
        try:
            summary = crawl(
                store=store,
                rate_limit_seconds=args.rate,
                limit=args.limit,
                sitemap_indices=_parse_sitemaps(args.sitemaps),
                force=args.force,
            )
        except KeyboardInterrupt:
            # The context manager's __exit__ flushes any buffered rows.
            print("\ninterrupted — progress saved, re-run to resume", file=sys.stderr)
            return 130
        stats = store.stats()

    print(
        "crawl done: "
        f"discovered={summary.discovered} fetched={summary.fetched} "
        f"upserted={summary.upserted} priced={summary.priced} "
        f"skipped={summary.skipped} not_product={summary.not_product} "
        f"errors={len(summary.errors)}"
    )
    print(
        f"DB totals: {stats.total} materials, {stats.priced} with listed price, "
        f"{stats.categories} categories, {stats.brands} brands"
    )
    if summary.errors:
        for e in summary.errors[:10]:
            print(f"  error: {e['url']} -> {e['error']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
