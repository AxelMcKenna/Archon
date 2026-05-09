"""Pre-lodgement risk scoring (FR-5.1 — FR-5.5).

Given a BCA, project type, and free-text description, score the project
against the BCA-specific corpus and surface the top 5–15 likely RFI items.

Algorithm (simple, explainable, easy to iterate):

  1. Pull all corpus rows for (bca, project_type or null fallback).
  2. Run the deterministic entity extractor on the description so we can
     score against extracted clause/standards/document references.
  3. Score each row:
       +1.0  any clause in description matches the row's category clause
       +0.6  any high-precision keyword from the row's example_text appears
             in the description
       +0.3  weak keyword overlap (any token >=5 chars present)
       weight by category weight from taxonomy.json (B1=1.0, E2=1.0, …)
  4. Drop items the user has already marked addressed.
  5. Return top 15 items (cap), score = sum(top 5 weights) / 5 → 0..1.
       <0.30 = low, <0.65 = medium, else high.

The PRD's BRANZ data dominates this: B1 and E2 rows are heaviest, so a
project description that hints at structure or weathertightness gets a
high score quickly, which is the right signal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from app.extractors.entities import extract_entities
from app.taxonomy import get_taxonomy

RiskBand = Literal["low", "medium", "high"]


@dataclass
class RiskItem:
    corpus_id: str
    category: str
    severity: str
    example_text: str
    trigger_description: str | None
    resolution_hint: str | None
    score: float
    reasons: list[str]


@dataclass
class RiskResult:
    score: float
    band: RiskBand
    items: list[RiskItem]
    bca: str
    project_type: str


def _category_weights() -> dict[str, float]:
    return {c["id"]: c.get("weight", 0.5) for c in get_taxonomy()["categories"]}


_KEYWORDS = {
    "building_code:B1": [
        "structural", "structure", "framing", "foundation", "bracing",
        "lateral", "seismic", "wind zone", "steel beam", "retaining wall",
        "engineer",
    ],
    "building_code:E2": [
        "weathertight", "cladding", "flashing", "junction", "cavity",
        "head and sill", "weather-tight", "underlay",
    ],
    "building_code:E3": ["wet area", "waterproofing", "shower", "tanking", "ensuite"],
    "building_code:B2": ["durability", "50 year", "15 year"],
    "building_code:C": ["fire", "fire-rated", "fire separation"],
    "building_code:F": ["barrier", "balustrade", "glazing", "stairs", "handrail"],
    "building_code:G": ["drainage", "stormwater", "plumbing", "sewer"],
    "building_code:H1": ["insulation", "r-value", "thermal", "double glazing", "low-e"],
    "documentation:producer_statements": ["ps1", "ps3", "ps4", "producer statement"],
    "documentation:lbp": ["lbp", "licensed building practitioner"],
    "documentation:plans": ["site plan", "north arrow", "scale bar", "setback", "boundary"],
    "documentation:specifications": ["specification", "product spec", "material spec"],
    "documentation:fees": [],
}

_CATEGORY_TO_CLAUSE = {
    "building_code:B1": "B1",
    "building_code:B2": "B2",
    "building_code:C": "C",
    "building_code:D": "D",
    "building_code:E1": "E1",
    "building_code:E2": "E2",
    "building_code:E3": "E3",
    "building_code:F": "F",
    "building_code:G": "G",
    "building_code:H1": "H1",
}


def _score_row(row: dict[str, Any], description: str, ents) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    cat = row["category"]

    clause = _CATEGORY_TO_CLAUSE.get(cat)
    if clause and clause in ents.clause_references:
        score += 1.0
        reasons.append(f"description mentions clause {clause}")

    desc_l = description.lower()
    keywords = _KEYWORDS.get(cat, [])
    matched_kw = [k for k in keywords if k.lower() in desc_l]
    if matched_kw:
        score += 0.6
        reasons.append(f"keyword: {', '.join(matched_kw[:2])}")

    # Weak overlap with the example text.
    example_tokens = {
        t.lower() for t in re.findall(r"[a-zA-Z]{5,}", row["example_text"])
    }
    desc_tokens = {t.lower() for t in re.findall(r"[a-zA-Z]{5,}", description)}
    overlap = example_tokens & desc_tokens
    if overlap and not matched_kw:
        score += 0.3
        reasons.append("partial keyword overlap")

    weight = _category_weights().get(cat, 0.5)
    return score * weight, reasons


def score_project(
    *,
    bca: str,
    project_type: str,
    description: str,
    addressed_corpus_ids: list[str],
    corpus: list[dict[str, Any]],
) -> RiskResult:
    ents = extract_entities(description)
    addressed = set(addressed_corpus_ids or [])

    scored: list[RiskItem] = []
    for row in corpus:
        if row["id"] in addressed:
            continue
        if row["bca"] != bca:
            continue
        # project_type filter: keep null (applies to all) or exact match.
        if row.get("project_type") and row["project_type"] != project_type:
            continue
        s, reasons = _score_row(row, description, ents)
        if s <= 0:
            continue
        scored.append(
            RiskItem(
                corpus_id=row["id"],
                category=row["category"],
                severity=row["severity"],
                example_text=row["example_text"],
                trigger_description=row.get("trigger_description"),
                resolution_hint=row.get("resolution_hint"),
                score=round(s, 3),
                reasons=reasons,
            )
        )

    scored.sort(key=lambda r: r.score, reverse=True)
    top = scored[:15]
    top5 = top[:5]
    aggregate = sum(r.score for r in top5) / 5 if top5 else 0.0

    if aggregate >= 0.65:
        band: RiskBand = "high"
    elif aggregate >= 0.30:
        band = "medium"
    else:
        band = "low"

    return RiskResult(
        score=round(aggregate, 3),
        band=band,
        items=top,
        bca=bca,
        project_type=project_type,
    )
