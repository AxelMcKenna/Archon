"""Orchestrate the Bunnings VE-materials crawl and expose a CLI.

    python -m app.ingestion.bunnings.crawl -v
    python -m app.ingestion.bunnings.crawl --categories building-hardware
    python -m app.ingestion.bunnings.crawl --limit 200 --backend sqlite

Scope: only VE-relevant category trees (see
:data:`app.ingestion.bunnings.discovery.VE_CATEGORY_ALLOWLIST`) — not the
full ~100k-SKU catalogue. Per category we page through the listing
(``?page=N``) and read products straight off the page; we never fetch
individual product pages. Safe to Ctrl-C and re-run: stored SKUs are
skipped on the next run (pass ``--force`` to refresh them).
"""

from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.ingestion.bunnings import discovery
from app.ingestion.bunnings.extract import extract_category_page
from app.ingestion.bunnings.store import DEFAULT_DB_PATH, MaterialsStore
from app.ingestion.scraping import fetcher

log = logging.getLogger(__name__)

USER_AGENT = "Archon-VE-Ingest/0.1 (+contact: axel.mckenna7@gmail.com)"
DEFAULT_RATE_SECONDS = 2.0
PAGE_SIZE = 36  # Bunnings' listing page size; used only as a safety bound.


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class CrawlSummary:
    categories: int = 0
    discovered: int = 0  # products seen across listing pages
    skipped: int = 0     # already stored
    upserted: int = 0
    priced: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)


def _crawl_category(
    cat: discovery.DiscoveredCategory,
    *,
    store: MaterialsStore,
    summary: CrawlSummary,
    rate_limit_seconds: float,
    user_agent: str,
    force: bool,
    remaining: int | None,
) -> int:
    """Page through one category, upserting new products. Returns the number
    of products upserted (so the caller can enforce a global ``--limit``)."""
    upserted_here = 0
    page = 1
    seen_products = 0
    total = None

    while True:
        sep = "&" if "?" in cat.url else "?"
        page_url = cat.url if page == 1 else f"{cat.url}{sep}page={page}"
        res = fetcher.fetch(
            page_url, user_agent=user_agent, rate_limit_seconds=rate_limit_seconds
        )
        if res.status == "error" or res.bytes is None:
            summary.errors.append(
                {"url": page_url, "error": res.error or f"HTTP {res.http_status}"}
            )
            break

        html = res.bytes.decode("utf-8", errors="replace")
        records, total = extract_category_page(html)
        if not records:
            break

        for rec in records:
            seen_products += 1
            summary.discovered += 1
            if not force and not store.needs_fetch_url(url=rec.url):
                summary.skipped += 1
                continue
            store.upsert(rec, now_iso=_utc_iso())
            summary.upserted += 1
            upserted_here += 1
            if rec.price_listed:
                summary.priced += 1
            if remaining is not None and upserted_here >= remaining:
                return upserted_here

        if total and seen_products >= total:
            break
        if seen_products > total + PAGE_SIZE:  # safety: never loop forever
            break
        page += 1

    return upserted_here


def crawl(
    *,
    store: MaterialsStore,
    rate_limit_seconds: float = DEFAULT_RATE_SECONDS,
    limit: int | None = None,
    allowlist: tuple[str, ...] = discovery.VE_CATEGORY_ALLOWLIST,
    force: bool = False,
    user_agent: str = USER_AGENT,
) -> CrawlSummary:
    summary = CrawlSummary()
    run_id = store.start_run(
        now_iso=_utc_iso(), notes=f"limit={limit} categories={allowlist} force={force}"
    )

    categories = discovery.discover_categories(
        user_agent=user_agent,
        rate_limit_seconds=rate_limit_seconds,
        allowlist=allowlist,
    )
    summary.categories = len(categories)
    log.info("crawl: %d VE-relevant leaf categories to scrape", summary.categories)

    for cat in categories:
        if limit is not None and summary.upserted >= limit:
            break
        remaining = None if limit is None else limit - summary.upserted
        _crawl_category(
            cat,
            store=store,
            summary=summary,
            rate_limit_seconds=rate_limit_seconds,
            user_agent=user_agent,
            force=force,
            remaining=remaining,
        )
        log.info(
            "crawl: %s -> %d upserted (%d priced), %d skipped, %d errors",
            "/".join(cat.path),
            summary.upserted,
            summary.priced,
            summary.skipped,
            len(summary.errors),
        )

    store.finish_run(
        run_id,
        now_iso=_utc_iso(),
        categories=summary.categories,
        discovered=summary.discovered,
        skipped=summary.skipped,
        upserted=summary.upserted,
        priced=summary.priced,
        errors=len(summary.errors),
    )
    return summary


def _parse_categories(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return discovery.VE_CATEGORY_ALLOWLIST
    return tuple(x.strip() for x in raw.split(",") if x.strip())


def _open_store(args: argparse.Namespace):
    if args.backend == "sqlite":
        return MaterialsStore(args.db)
    from app.auth import get_service_db
    from app.ingestion.bunnings.store_supabase import SupabaseMaterialsStore

    return SupabaseMaterialsStore(get_service_db())


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m app.ingestion.bunnings.crawl",
        description="Crawl VE-relevant Bunnings categories into the materials/pricing DB.",
    )
    p.add_argument(
        "--backend",
        choices=("supabase", "sqlite"),
        default="supabase",
        help="where to write materials (default: supabase ARCHON project)",
    )
    p.add_argument(
        "--db",
        default=str(DEFAULT_DB_PATH),
        help="SQLite DB path (only used with --backend sqlite)",
    )
    p.add_argument("--limit", type=int, default=None, help="max NEW products to upsert this run")
    p.add_argument(
        "--categories",
        default=None,
        help="comma-separated top-level category segments to scope to "
        f"(default: {','.join(discovery.VE_CATEGORY_ALLOWLIST)})",
    )
    p.add_argument(
        "--rate",
        type=float,
        default=DEFAULT_RATE_SECONDS,
        help="seconds between requests to bunnings.co.nz",
    )
    p.add_argument("--force", action="store_true", help="refresh products already stored")
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
                allowlist=_parse_categories(args.categories),
                force=args.force,
            )
        except KeyboardInterrupt:
            print("\ninterrupted — progress saved, re-run to resume", file=sys.stderr)
            return 130
        stats = store.stats()

    print(
        "crawl done: "
        f"categories={summary.categories} discovered={summary.discovered} "
        f"upserted={summary.upserted} priced={summary.priced} "
        f"skipped={summary.skipped} errors={len(summary.errors)}"
    )
    print(
        f"DB totals: {stats.total} materials, {stats.priced} with listed price, "
        f"{stats.categories} categories"
    )
    if summary.errors:
        for e in summary.errors[:10]:
            print(f"  error: {e['url']} -> {e['error']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
