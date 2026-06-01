"""Bunnings VE-materials crawler.

A category-scoped crawl of bunnings.co.nz, building a NZ *commodity*
materials + pricing database for the Value-Engineering engine.

Why Bunnings as well as ArchiPro: ArchiPro is a specification marketplace
skewed to premium architectural FF&E — only ~24% of its products publish
a price, and its core building-materials category is barely priced (~6%).
Bunnings is a retail trade supplier: nearly every product carries a real
NZD price *and* a per-unit comparison price (per linear metre, per m²,
per each), which is exactly the granularity VE substitutions are costed
at. It covers the bulk commodity materials (framing timber, plasterboard,
insulation, fixings, paint) where value engineering actually saves money.

Scope (the whole point): we do NOT crawl the full ~100k-SKU catalogue.
:mod:`discovery` reads ``categories.xml`` and keeps only the leaf
categories under a VE allowlist (building, plumbing, flooring, paint);
:mod:`extract` then reads every product straight off the category listing
page's ``<script id="__NEXT_DATA__">`` JSON island — SKU, name, price,
per-unit price, unit, category path — so we never fetch individual
product pages. That's ~1 request per ~36 products, scoped to materials
that matter for VE.

Etiquette: we only fetch ``/categories.xml`` and ``/products/...`` listing
pages, none Disallowed by robots.txt (its Disallow rules cover specific
``/products/kitchen/...`` paths, which the allowlist never includes).
"""
