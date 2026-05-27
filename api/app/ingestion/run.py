"""CLI entry point: ``python -m app.ingestion.run --source <kind>``.

Wraps ``pipeline.run_source`` with argparse + a service-role Supabase
client. Same call path the admin HTTP route uses, just without FastAPI
in front. Intended to be invoked from a VPS cron in the future.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict

from app.auth import get_service_db
from app.ingestion.pipeline import run_source
from app.ingestion.registry import known_kinds


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m app.ingestion.run",
        description="Run the VE ingestion pipeline for one source kind.",
    )
    p.add_argument(
        "--source",
        required=True,
        help=f"source kind to ingest; one of: {', '.join(known_kinds())}",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="ignore content_hash cache and re-extract from already-seen bytes",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="fetch but do not persist anything (storage upload, DB writes skipped)",
    )
    p.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="enable INFO logging",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    try:
        db = get_service_db()
    except Exception as e:  # noqa: BLE001
        print(f"failed to build supabase client: {e}", file=sys.stderr)
        return 2

    summary = run_source(
        db,
        source_kind=args.source,
        force=args.force,
        dry_run=args.dry_run,
    )
    print(json.dumps(asdict(summary), indent=2))
    return 1 if summary.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
