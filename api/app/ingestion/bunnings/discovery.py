"""Discover the VE-relevant *leaf* category pages to crawl from Bunnings.

We deliberately do *not* crawl the full product sitemap (~100k SKUs of
tools, appliances, garden furniture, decor, …). Value engineering only
cares about construction materials, so we scope the crawl to a few
top-level category trees and read products straight off the *leaf*
category listing pages (see :mod:`extract`).

Two quirks of Bunnings drive the design:

* **Only leaf pages carry the product grid.** A top-level landing page
  (``/products/building-hardware``) embeds a small "popular" widget, not
  its full grid, so we must crawl the deepest categories.
* **``categories.xml`` is served non-deterministically** — each fetch
  returns a different partial subset (~1400 of ~2200 categories). We
  therefore union several fetches to assemble a stable, near-complete
  category set before computing leaves.

Only ``/categories.xml`` and ``/products/...`` listing pages are touched,
none Disallowed by robots.txt.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.ingestion.scraping import fetcher

log = logging.getLogger(__name__)

CATEGORIES_SITEMAP_URL = "https://www.bunnings.co.nz/categories.xml"
DEFAULT_SITEMAP_PASSES = 6  # union this many fetches to beat the partial responses

_CATEGORY_URL_RE = re.compile(r"https://www\.bunnings\.co\.nz/products/(\S+?)/?$")
_LOC_RE = re.compile(r"<loc>\s*([^<]+?)\s*</loc>", re.IGNORECASE)

# Top-level category segments worth costing for VE — the trees that hold
# structural / envelope / services / finishing materials. Everything else
# (tools, garden, appliances, decor, kitchenware, lighting, …) is out of
# scope. Tune via the crawl CLI's --categories flag.
VE_CATEGORY_ALLOWLIST = (
    "building-hardware",
    "bathroom-plumbing",
    "flooring-tiles",
    "paint-decorating",
)


@dataclass(frozen=True)
class DiscoveredCategory:
    url: str
    path: tuple[str, ...]  # e.g. ("building-hardware", "timber", "framing-timber")


def _category_paths(xml: str) -> set[tuple[str, ...]]:
    """Parse ``/products/a/b/c`` URLs into ('a','b','c') path tuples."""
    paths: set[tuple[str, ...]] = set()
    for loc in _LOC_RE.findall(xml):
        m = _CATEGORY_URL_RE.fullmatch(loc.strip())
        if m:
            paths.add(tuple(seg for seg in m.group(1).split("/") if seg))
    return paths


def _leaves(paths: set[tuple[str, ...]]) -> list[tuple[str, ...]]:
    """Keep only paths that are not a strict prefix of another path."""
    return [
        p
        for p in paths
        if not any(other != p and other[: len(p)] == p for other in paths)
    ]


def discover_categories(
    *,
    user_agent: str,
    rate_limit_seconds: float,
    allowlist: tuple[str, ...] = VE_CATEGORY_ALLOWLIST,
    passes: int = DEFAULT_SITEMAP_PASSES,
) -> list[DiscoveredCategory]:
    """Return the leaf category pages worth crawling for VE pricing.

    Unions ``passes`` fetches of the (partial) categories sitemap to get a
    stable category set, filters to the allowlist, and reduces to leaves.
    """
    allowed = {a.lower() for a in allowlist}
    paths: set[tuple[str, ...]] = set()
    for i in range(max(1, passes)):
        res = fetcher.fetch(
            CATEGORIES_SITEMAP_URL,
            user_agent=user_agent,
            rate_limit_seconds=rate_limit_seconds,
        )
        if res.status != "fetched" or res.bytes is None:
            log.warning("discovery: categories.xml pass %d failed: %s", i, res.error)
            continue
        before = len(paths)
        paths |= {
            p
            for p in _category_paths(res.bytes.decode("utf-8", errors="replace"))
            if p and p[0].lower() in allowed
        }
        log.info(
            "discovery: pass %d/%d -> %d new allowlisted categories (%d total)",
            i + 1,
            passes,
            len(paths) - before,
            len(paths),
        )

    leaves = _leaves(paths)
    log.info(
        "discovery: %d allowlisted categories -> %d leaves to crawl",
        len(paths),
        len(leaves),
    )
    return [
        DiscoveredCategory(
            url="https://www.bunnings.co.nz/products/" + "/".join(p), path=p
        )
        for p in sorted(leaves)
    ]
