"""Attach indicative NZ retail prices to value-engineering opportunities.

The VE vision pass is deliberately *qualitative* — it bands cost impact
(low/medium/high) and is told never to invent dollar figures. This module
fills that gap after the fact: for each opportunity the model tagged with
``material_keywords``, it full-text-matches the proposed alternative
against ``bunnings_materials`` (via the ``match_bunnings_materials`` RPC)
and attaches a ``price_reference`` — a real Bunnings SKU + price so the
user sees a concrete, current retail figure next to the suggestion.

Best-effort by design: a miss (no keywords, no match, or a DB error)
simply leaves the opportunity un-priced. Pricing must never fail or slow
the analysis it decorates, so the whole pass is wrapped and swallows
errors with a log line.
"""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client

log = logging.getLogger(__name__)

# Bunnings is national EDLP retail pricing — indicative, GST-inclusive, and
# an upper bound vs trade/contract rates. Surfaced verbatim in the UI.
PRICE_SOURCE = "bunnings"
_MATCH_LIMIT = 1  # the top-ranked product is the indicative figure


def _price_reference(db: Client, keywords: str) -> dict[str, Any] | None:
    """Return the best-matching Bunnings product as a price_reference, or None."""
    query = keywords.strip()
    if not query:
        return None
    rows = (
        db.rpc(
            "match_bunnings_materials",
            {"p_query": query, "p_limit": _MATCH_LIMIT},
        )
        .execute()
        .data
    )
    if not rows:
        return None
    top = rows[0]
    price = top.get("price")
    if price is None:
        return None
    return {
        "source": PRICE_SOURCE,
        "name": top.get("name"),
        "price": float(price),
        "unit_price": float(top["unit_price"]) if top.get("unit_price") is not None else None,
        "unit_of_measure": top.get("unit_of_measure"),
        "currency": top.get("currency") or "NZD",
        "sku": top.get("sku"),
        "url": top.get("url"),
    }


def enrich_opportunities(db: Client, opportunities: list[dict[str, Any]]) -> int:
    """Attach a ``price_reference`` to each opportunity with usable keywords.

    Mutates the opportunity dicts in place. Returns the number priced.
    Never raises — a failure of the pricing lookup must not fail the VE run.
    """
    priced = 0
    for opp in opportunities:
        if not isinstance(opp, dict):
            continue
        keywords = opp.get("material_keywords")
        if not isinstance(keywords, str) or not keywords.strip():
            continue
        try:
            ref = _price_reference(db, keywords)
        except Exception as e:  # noqa: BLE001 — pricing is best-effort
            log.warning("ve_pricing: lookup failed for %r: %s", keywords, e)
            continue
        if ref is not None:
            opp["price_reference"] = ref
            priced += 1
    return priced
