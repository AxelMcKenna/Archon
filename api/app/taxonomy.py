"""Load /shared/taxonomy.json from Python."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

TAXONOMY_PATH = Path(__file__).parent.parent.parent / "shared" / "taxonomy.json"


@lru_cache
def get_taxonomy() -> dict[str, Any]:
    return json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))


def acceptable_solution_for(category: str) -> str | None:
    """Return a short reference string for a given category, or None.

    Handles hierarchical IDs introduced in taxonomy 1.1 by taking the first
    clause segment (e.g. ``building_code:B1:geotech`` → ``B1``).
    """
    if not category.startswith("building_code:"):
        return None
    clause = category.split(":", 2)[1]  # 1st segment after "building_code:"
    tx = get_taxonomy()
    entry = tx["acceptable_solutions"].get(clause)
    if not entry:
        return None
    docs = ", ".join(entry["documents"])
    return f"{clause} — {entry['title']} ({docs})  · {entry['mbie_url']}"


def bca_naming_pattern(bca: str) -> str:
    tx = get_taxonomy()
    for b in tx["bcas"]:
        if b["id"] == bca:
            return b["naming_convention"]
    return "[appref]_[doc-type]_[date].pdf"


def bca_lodgement_url(bca: str) -> str | None:
    tx = get_taxonomy()
    for b in tx["bcas"]:
        if b["id"] == bca:
            return b.get("lodgement_url")
    return None
