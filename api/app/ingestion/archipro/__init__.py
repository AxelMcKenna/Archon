"""ArchiPro materials crawler.

A sitemap-driven crawl of archipro.co.nz product pages, building a NZ
materials catalogue + pricing database for the Value-Engineering engine.

Unlike the allowlist-based ``app.ingestion.scraping`` layer (every URL
explicitly listed in sources.yaml), this is a *crawl*: URLs are
discovered from ArchiPro's published sitemap-index. We still fetch
politely — per-host rate limiting, conditional requests, a contactable
User-Agent — and we obey robots.txt by only touching ``/product/`` and
``/sitemap*`` paths, none of which are Disallowed.

Reality check baked into the schema: ArchiPro is primarily a
specification marketplace. Roughly half of products publish an NZD
price; the rest are quote-only. ``price`` is therefore nullable and we
record ``price_listed`` so the VE engine can tell a real price from an
absent one.
"""
