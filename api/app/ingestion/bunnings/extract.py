"""Turn a Bunnings category-listing page into normalized records.

Bunnings is a Next.js app: every category page embeds its product grid in
a ``<script id="__NEXT_DATA__" type="application/json">`` island, under a
react-query entry whose ``state.data`` carries ``results`` (one per
product) and ``totalCount``. Each ``results[i].raw`` already holds
everything VE needs — SKU, name, ``price``, ``cprice`` (per-unit
comparison price), unit of measure, currency, and the category path — so
we never have to fetch the individual product pages.

Single responsibility: category-page HTML -> (records, totalCount). Knows
nothing about HTTP, pagination, or storage.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

_NEXT_DATA_RE = re.compile(
    r'<script\b[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
_BASE_URL = "https://www.bunnings.co.nz"
# "Building & Hardware--building-hardware--L1" -> ("Building & Hardware", 1)
_SUPERCAT_RE = re.compile(r"^(.*?)--[^-]+(?:-[^-]+)*--L(\d+)$")


@dataclass
class BunningsMaterialRecord:
    """One Bunnings product, normalized for the materials/pricing DB."""

    sku: str
    url: str
    name: str
    brand: str | None = None
    description: str | None = None
    category: str | None = None
    subcategory: str | None = None
    category_path: list[str] = field(default_factory=list)
    price: float | None = None
    currency: str | None = None
    price_listed: bool = False
    # Per-unit comparison price — the granularity VE costs substitutions at
    # (e.g. 7.51 "linear metre"). Bunnings publishes it as ``cprice``.
    unit_price: float | None = None
    unit_of_measure: str | None = None


def _parse_next_data(html: str) -> dict | None:
    m = _NEXT_DATA_RE.search(html)
    if not m:
        return None
    try:
        payload = json.loads(m.group(1).strip())
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _find_results_node(data: dict) -> dict | None:
    """The product-grid query entry holds ``results`` + ``totalCount``."""
    queries = (
        data.get("props", {})
        .get("pageProps", {})
        .get("dehydratedState", {})
        .get("queries")
    )
    if not isinstance(queries, list):
        return None
    for q in queries:
        if not isinstance(q, dict):
            continue
        node = q.get("state", {}).get("data")
        if isinstance(node, dict) and "results" in node and "totalCount" in node:
            return node
    return None


def _number(raw: object) -> float | None:
    if isinstance(raw, bool):  # bool is an int subclass — reject
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        try:
            return float(raw)
        except ValueError:
            return None
    return None


def _category_path(raw: dict) -> list[str]:
    """Derive the display-name breadcrumb from ``supercategories``
    (``"Timber--timber--L2"`` entries), ordered by level."""
    supers = raw.get("supercategories")
    if not isinstance(supers, list):
        return []
    leveled: list[tuple[int, str]] = []
    for s in supers:
        if not isinstance(s, str):
            continue
        m = _SUPERCAT_RE.match(s)
        if m:
            leveled.append((int(m.group(2)), m.group(1).strip()))
    leveled.sort(key=lambda x: x[0])
    return [name for _, name in leveled if name]


def _record_from_raw(raw: dict) -> BunningsMaterialRecord | None:
    name = raw.get("name") or raw.get("title")
    if not isinstance(name, str) or not name.strip():
        return None
    sku = str(raw.get("itemnumber") or raw.get("code") or "").strip()
    routing = raw.get("productroutingurl")
    if not sku or not isinstance(routing, str) or not routing:
        return None

    price = _number(raw.get("price"))
    listed = price is not None and price > 0
    unit_price = _number(raw.get("cprice"))
    uom = raw.get("comparisonunitofmeasure")

    path = _category_path(raw)
    keypoints = raw.get("keysellingpoints")
    desc = (
        "; ".join(p for p in keypoints if isinstance(p, str))
        if isinstance(keypoints, list) and keypoints
        else None
    )

    return BunningsMaterialRecord(
        sku=sku,
        url=_BASE_URL + routing if routing.startswith("/") else routing,
        name=name.strip(),
        brand=None,  # not exposed on listing pages
        description=desc or None,
        category=path[0] if path else None,
        subcategory=path[1] if len(path) > 1 else None,
        category_path=path,
        price=price if listed else None,
        currency=raw.get("currency") if isinstance(raw.get("currency"), str) else None,
        price_listed=listed,
        unit_price=unit_price if unit_price and unit_price > 0 else None,
        unit_of_measure=uom.strip() if isinstance(uom, str) and uom.strip() else None,
    )


def extract_category_page(html: str) -> tuple[list[BunningsMaterialRecord], int]:
    """Parse one category-listing page.

    Returns ``(records, total_count)`` where ``total_count`` is the number
    of products in the whole category (across pages) — the caller uses it
    to decide whether to request the next ``?page=N``. Returns
    ``([], 0)`` if the page has no parseable product grid.
    """
    data = _parse_next_data(html)
    if data is None:
        return [], 0
    node = _find_results_node(data)
    if node is None:
        return [], 0

    total = node.get("totalCount")
    total = int(total) if isinstance(total, int) else 0

    records: list[BunningsMaterialRecord] = []
    for r in node.get("results", []):
        if not isinstance(r, dict):
            continue
        raw = r.get("raw")
        if not isinstance(raw, dict):
            continue
        rec = _record_from_raw(raw)
        if rec is not None:
            records.append(rec)
    return records, total
