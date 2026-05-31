"""Turn a product page's HTML into a normalized :class:`MaterialRecord`.

ArchiPro server-renders a ``<script type="application/ld+json">`` block
on every product page containing a schema.org ``@graph`` with a
``Product`` node (name, brand, description, image, offers/price) and a
``BreadcrumbList`` node (the category hierarchy). That structured data is
far more reliable than scraping the DOM, so it's all we read.

Single responsibility: bytes -> MaterialRecord | None. Knows nothing
about HTTP, SQLite, or crawl state.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# Non-greedy capture of every ld+json script body on the page. ArchiPro
# emits one, but a site redesign could add more — we scan them all and
# pick the first that yields a Product.
_LD_JSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)

# Breadcrumb positions that are navigation chrome, not real categories.
_BREADCRUMB_NOISE = {"home", "product library", "products"}


@dataclass
class MaterialRecord:
    """One ArchiPro product, normalized for the materials/pricing DB."""

    product_id: str
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
    availability: str | None = None
    image: str | None = None


def _iter_graph_nodes(payload: object):
    """Yield schema.org nodes from a parsed ld+json payload, whether it's
    a bare object, an ``@graph`` wrapper, or a top-level list."""
    if isinstance(payload, list):
        for item in payload:
            yield from _iter_graph_nodes(item)
        return
    if not isinstance(payload, dict):
        return
    graph = payload.get("@graph")
    if isinstance(graph, list):
        for node in graph:
            yield from _iter_graph_nodes(node)
    yield payload


def _node_type_matches(node: dict, wanted: str) -> bool:
    t = node.get("@type")
    if isinstance(t, list):
        return any(str(x).lower() == wanted.lower() for x in t)
    return str(t).lower() == wanted.lower()


def _first_offer(product: dict) -> dict | None:
    offers = product.get("offers")
    if isinstance(offers, list):
        return offers[0] if offers else None
    if isinstance(offers, dict):
        return offers
    return None


def _parse_price(offer: dict | None) -> tuple[float | None, str | None, bool]:
    """Return (price, currency, listed). ArchiPro uses ``"0.00"`` or
    ``null`` for quote-only products; we treat both — and anything <= 0 —
    as *not listed* so the VE engine never reads a placeholder as a real
    price."""
    if not offer:
        return None, None, False
    currency = offer.get("priceCurrency")
    raw = offer.get("price")
    if raw is None:
        return None, currency, False
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None, currency, False
    if value <= 0:
        return None, currency, False
    return value, currency, True


def _category_from_breadcrumb(node: dict) -> list[str]:
    items = node.get("itemListElement")
    if not isinstance(items, list):
        return []
    names: list[str] = []
    for el in items:
        if not isinstance(el, dict):
            continue
        name = el.get("name")
        if isinstance(name, dict):  # some schemas nest the name
            name = name.get("name")
        if isinstance(name, str) and name.strip().lower() not in _BREADCRUMB_NOISE:
            names.append(name.strip())
    return names


def extract_material(*, html: str, url: str) -> MaterialRecord | None:
    """Parse a product page. Returns None if no Product JSON-LD is found
    (e.g. the URL redirected to a non-product page, or markup changed)."""
    product: dict | None = None
    breadcrumb: list[str] = []

    for block in _LD_JSON_RE.findall(html):
        try:
            payload = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        for node in _iter_graph_nodes(payload):
            if not isinstance(node, dict):
                continue
            if product is None and _node_type_matches(node, "Product"):
                product = node
            elif not breadcrumb and _node_type_matches(node, "BreadcrumbList"):
                breadcrumb = _category_from_breadcrumb(node)

    if product is None:
        return None

    name = product.get("name")
    if not isinstance(name, str) or not name.strip():
        return None

    product_id = str(product.get("productID") or "").strip()
    if not product_id:
        # Fall back to the URL slug — stable enough to dedup on.
        product_id = f"url:{url.rstrip('/').rsplit('/', 1)[-1]}"

    brand = product.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")

    image = product.get("image")
    if isinstance(image, list):
        image = image[0] if image else None

    price, currency, listed = _parse_price(_first_offer(product))
    offer = _first_offer(product) or {}
    availability = offer.get("availability")
    if isinstance(availability, str):
        availability = availability.rsplit("/", 1)[-1] or None  # schema.org/InStock -> InStock

    # ArchiPro's breadcrumb ends with the product itself — drop that leaf so
    # category_path holds only true categories.
    if breadcrumb and breadcrumb[-1].strip().lower() == name.strip().lower():
        breadcrumb = breadcrumb[:-1]

    category = breadcrumb[0] if breadcrumb else None
    subcategory = breadcrumb[1] if len(breadcrumb) > 1 else None

    desc = product.get("description")
    if isinstance(desc, str):
        desc = desc.strip() or None

    return MaterialRecord(
        product_id=product_id,
        url=url,
        name=name.strip(),
        brand=brand.strip() if isinstance(brand, str) else None,
        description=desc,
        category=category,
        subcategory=subcategory,
        category_path=breadcrumb,
        price=price,
        currency=currency,
        price_listed=listed,
        availability=availability,
        image=image if isinstance(image, str) else None,
    )
