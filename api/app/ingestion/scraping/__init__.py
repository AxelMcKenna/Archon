"""Scraping layer for the ingestion pipeline.

- ``fetcher``  — HTTP fetcher with conditional-request caching + per-host
  rate limits. Knows nothing about DB rows or storage.
- ``registry`` — loads ``sources.yaml`` into structured records. Single
  source of truth for *where* the ingestion layer fetches from.
"""

from app.ingestion.scraping.fetcher import FetchResult, FetchStatus, fetch
from app.ingestion.scraping.registry import (
    SourceDoc,
    SourceKindConfig,
    get_kind,
    known_kinds,
    load_registry,
)

__all__ = [
    "FetchResult",
    "FetchStatus",
    "SourceDoc",
    "SourceKindConfig",
    "fetch",
    "get_kind",
    "known_kinds",
    "load_registry",
]
