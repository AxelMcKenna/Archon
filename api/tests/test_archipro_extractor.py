"""ArchiPro JSON-LD extraction + SQLite store round-trip.

Fixtures mirror the real schema.org ``@graph`` ArchiPro server-renders:
a ``Product`` node plus a ``BreadcrumbList``. We assert the price
nullability rule (``0.00``/``null`` -> not listed) the VE engine relies
on, and that the store's lastmod-based resumability skip works.
"""

from __future__ import annotations

from app.ingestion.archipro.extract import extract_material
from app.ingestion.archipro.store import MaterialsStore

_URL = "https://archipro.co.nz/product/twig-wolf-and-south"


def _page(*, price: str | None, product_name: str = "Twig Outdoor Light") -> str:
    price_field = "null" if price is None else f'"{price}"'
    return f"""
    <html><head>
    <script type="application/ld+json">
    {{"@context":"http://schema.org","@graph":[
      {{"@type":"Product","productID":"product_450324",
        "name":"{product_name}","brand":"Wolf & South Outdoor",
        "description":"A heated outdoor light.",
        "image":"https://archipro.co.nz/images/twig.jpg",
        "offers":[{{"@type":"Offer","price":{price_field},"priceCurrency":"NZD",
                   "availability":"https://schema.org/InStock"}}]}},
      {{"@type":"BreadcrumbList","itemListElement":[
        {{"@type":"ListItem","position":1,"name":"Home"}},
        {{"@type":"ListItem","position":2,"name":"Product library"}},
        {{"@type":"ListItem","position":3,"name":"Outdoor & Landscaping"}},
        {{"@type":"ListItem","position":4,"name":"Outdoor Heating"}},
        {{"@type":"ListItem","position":5,"name":"{product_name}"}}
      ]}}
    ]}}
    </script></head><body></body></html>
    """


def test_extracts_listed_price() -> None:
    rec = extract_material(html=_page(price="4380.00"), url=_URL)
    assert rec is not None
    assert rec.product_id == "product_450324"
    assert rec.name == "Twig Outdoor Light"
    assert rec.brand == "Wolf & South Outdoor"
    assert rec.price == 4380.0
    assert rec.currency == "NZD"
    assert rec.price_listed is True
    assert rec.availability == "InStock"
    # Breadcrumb chrome ("Home"/"Product library") and the product leaf dropped.
    assert rec.category == "Outdoor & Landscaping"
    assert rec.subcategory == "Outdoor Heating"
    assert rec.category_path == ["Outdoor & Landscaping", "Outdoor Heating"]


def test_zero_and_null_prices_are_not_listed() -> None:
    for raw in ("0.00", None):
        rec = extract_material(html=_page(price=raw), url=_URL)
        assert rec is not None
        assert rec.price is None
        assert rec.price_listed is False
        assert rec.currency == "NZD"  # currency still captured


def test_non_product_page_returns_none() -> None:
    assert extract_material(html="<html><body>no json-ld</body></html>", url=_URL) is None


def test_store_roundtrip_and_resumability(tmp_path) -> None:
    db = tmp_path / "m.db"
    rec = extract_material(html=_page(price="4380.00"), url=_URL)
    assert rec is not None
    with MaterialsStore(db) as store:
        assert store.needs_fetch_url(url=_URL, source_lastmod="2026-05-30") is True
        store.upsert(
            rec, now_iso="2026-05-30T00:00:00Z", source_lastmod="2026-05-30", content_hash="abc"
        )
        # Same lastmod -> skip; newer lastmod -> refetch.
        assert store.needs_fetch_url(url=_URL, source_lastmod="2026-05-30") is False
        assert store.needs_fetch_url(url=_URL, source_lastmod="2026-06-01") is True
        stats = store.stats()
        assert stats.total == 1
        assert stats.priced == 1
