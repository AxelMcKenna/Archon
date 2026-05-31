"""Discover product URLs from ArchiPro's published sitemaps.

Flow: ``sitemap-index.xml`` -> N child sitemaps -> ``/product/`` URLs with
their ``<lastmod>``. We only read sitemaps and product URLs, both
permitted by robots.txt. No link-following / DOM crawling.

The fetch is delegated to the shared polite fetcher so sitemap requests
obey the same per-host rate limit as page fetches.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.ingestion.scraping import fetcher

log = logging.getLogger(__name__)

SITEMAP_INDEX_URL = "https://archipro.co.nz/sitemap-index.xml"
PRODUCT_URL_RE = re.compile(r"https://archipro\.co\.nz/product/[^<\s]+")

_LOC_RE = re.compile(r"<loc>\s*([^<]+?)\s*</loc>", re.IGNORECASE)
# <url><loc>..</loc><lastmod>..</lastmod></url> — lastmod is optional.
_URL_BLOCK_RE = re.compile(r"<url>(.*?)</url>", re.IGNORECASE | re.DOTALL)
_LASTMOD_RE = re.compile(r"<lastmod>\s*([^<]+?)\s*</lastmod>", re.IGNORECASE)


@dataclass(frozen=True)
class DiscoveredUrl:
    url: str
    lastmod: str | None


def _fetch_text(url: str, *, user_agent: str, rate_limit_seconds: float) -> str:
    res = fetcher.fetch(
        url, user_agent=user_agent, rate_limit_seconds=rate_limit_seconds
    )
    if res.status != "fetched" or res.bytes is None:
        raise RuntimeError(f"sitemap fetch failed for {url}: {res.error or res.status}")
    return res.bytes.decode("utf-8", errors="replace")


def list_sitemaps(*, user_agent: str, rate_limit_seconds: float) -> list[str]:
    """Return the child sitemap URLs listed in the sitemap index."""
    xml = _fetch_text(
        SITEMAP_INDEX_URL,
        user_agent=user_agent,
        rate_limit_seconds=rate_limit_seconds,
    )
    return [m.strip() for m in _LOC_RE.findall(xml)]


def product_urls_in_sitemap(
    sitemap_url: str, *, user_agent: str, rate_limit_seconds: float
) -> list[DiscoveredUrl]:
    """Return the ``/product/`` URLs (with lastmod) in one child sitemap."""
    xml = _fetch_text(
        sitemap_url, user_agent=user_agent, rate_limit_seconds=rate_limit_seconds
    )
    out: list[DiscoveredUrl] = []
    for block in _URL_BLOCK_RE.findall(xml):
        loc_m = _LOC_RE.search(block)
        if not loc_m:
            continue
        url = loc_m.group(1).strip()
        if not PRODUCT_URL_RE.fullmatch(url):
            continue
        lastmod_m = _LASTMOD_RE.search(block)
        lastmod = lastmod_m.group(1).strip() if lastmod_m else None
        out.append(DiscoveredUrl(url=url, lastmod=lastmod))
    return out


def discover_products(
    *,
    user_agent: str,
    rate_limit_seconds: float,
    sitemap_indices: list[int] | None = None,
) -> list[DiscoveredUrl]:
    """Discover every product URL across all (or selected) child sitemaps.

    ``sitemap_indices`` selects child sitemaps by their 1-based position
    in the index (e.g. ``[1, 2]`` for the first two). Dedups by URL,
    keeping the first lastmod seen.
    """
    sitemaps = list_sitemaps(
        user_agent=user_agent, rate_limit_seconds=rate_limit_seconds
    )
    if sitemap_indices is not None:
        chosen = [sitemaps[i - 1] for i in sitemap_indices if 1 <= i <= len(sitemaps)]
    else:
        chosen = sitemaps

    seen: dict[str, DiscoveredUrl] = {}
    for sm in chosen:
        found = product_urls_in_sitemap(
            sm, user_agent=user_agent, rate_limit_seconds=rate_limit_seconds
        )
        log.info("discovery: %s -> %d product urls", sm, len(found))
        for d in found:
            seen.setdefault(d.url, d)
    return list(seen.values())
