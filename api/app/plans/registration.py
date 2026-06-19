"""Register views that depict the same part of the building.

Cross-view reconciliation is only worth running on views that are actually
related, so this is the step that keeps the fan-out small: instead of
comparing every pair of sheets (N squared), we group sheets that share a
registration anchor and reconcile only within a group.

Two deterministic link signals are used in the first slice:

  - **callout** — a section/detail marker on one sheet whose ``target_sheet``
    resolves to another sheet in the set (the strongest, most explicit link);
  - **level** — two sheets stating the same ``level_id``.

Connected components over those edges become comparison sets. We only keep a
set worth an LLM call: one with enough datum anchors to actually compare.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from app.plans.views import ViewRecord

log = logging.getLogger(__name__)


@dataclass
class ComparisonSet:
    region_label: str
    pages: list[int]
    link_types: list[str]
    reason: str
    views: list[ViewRecord] = field(default_factory=list)


def _norm_sheet(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _norm_level(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


class _UnionFind:
    def __init__(self, items: list[int]) -> None:
        self.parent = {i: i for i in items}

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        self.parent[self.find(a)] = self.find(b)


def _datum_view_count(views: list[ViewRecord]) -> int:
    return sum(1 for v in views if v.datums)


def build_comparison_sets(
    views: list[ViewRecord],
    *,
    max_set_size: int = 5,
    max_sets: int = 12,
) -> list[ComparisonSet]:
    """Group related views into comparison sets (deterministic, no LLM).

    A set is kept only when it has at least two views *and* something to
    compare: either two views carry datum anchors, or the views are linked by
    an explicit callout and at least one carries a datum.
    """
    if len(views) < 2:
        return []

    by_page = {v.page: v for v in views}
    by_sheet: dict[str, int] = {
        _norm_sheet(v.sheet_number): v.page for v in views if v.sheet_number
    }

    uf = _UnionFind([v.page for v in views])
    # (page_a, page_b) -> set of link types, for explaining each component.
    edge_links: dict[tuple[int, int], set[str]] = {}

    def _link(a: int, b: int, kind: str) -> None:
        if a == b:
            return
        uf.union(a, b)
        edge_links.setdefault((min(a, b), max(a, b)), set()).add(kind)

    # 1. Callout edges (explicit, strongest).
    for v in views:
        for c in v.callouts:
            tgt = by_sheet.get(_norm_sheet(c.get("target_sheet")))
            if tgt is not None:
                _link(v.page, tgt, "callout")

    # 2. Level edges (shared level_id).
    by_level: dict[str, list[int]] = {}
    for v in views:
        lvl = _norm_level(v.level_id)
        if lvl:
            by_level.setdefault(lvl, []).append(v.page)
    for pages in by_level.values():
        for other in pages[1:]:
            _link(pages[0], other, "level")

    # Gather connected components.
    comps: dict[int, list[int]] = {}
    for page in by_page:
        comps.setdefault(uf.find(page), []).append(page)

    candidates: list[ComparisonSet] = []
    for pages in comps.values():
        if len(pages) < 2:
            continue
        comp_views = [by_page[p] for p in sorted(pages)]
        link_types = sorted(
            {k for (a, b), ks in edge_links.items() if a in pages for k in ks}
        )
        has_callout = "callout" in link_types
        datum_views = _datum_view_count(comp_views)
        worth_it = datum_views >= 2 or (has_callout and datum_views >= 1)
        if not worth_it:
            continue
        candidates.append(
            ComparisonSet(
                region_label=_region_label(comp_views),
                pages=sorted(pages),
                link_types=link_types,
                reason=_reason(comp_views, link_types),
                views=comp_views,
            )
        )

    # Caps. Prefer callout-linked sets, then larger sets. Log what we drop.
    candidates.sort(
        key=lambda cs: ("callout" in cs.link_types, len(cs.pages)), reverse=True
    )
    kept: list[ComparisonSet] = []
    for cs in candidates:
        if len(cs.pages) > max_set_size:
            log.info(
                "cross-view: trimming comparison set %s from %d to %d views",
                cs.region_label,
                len(cs.pages),
                max_set_size,
            )
            cs.pages = cs.pages[:max_set_size]
            cs.views = cs.views[:max_set_size]
        kept.append(cs)
    if len(kept) > max_sets:
        log.info(
            "cross-view: %d comparison sets found, reconciling the top %d",
            len(kept),
            max_sets,
        )
        kept = kept[:max_sets]
    return kept


def _region_label(views: list[ViewRecord]) -> str:
    for v in views:
        if v.level_id:
            return v.level_id
    sheets = [v.sheet_number for v in views if v.sheet_number]
    if sheets:
        return f"sheets {', '.join(sheets)}"
    return "pages " + ", ".join(str(v.page) for v in views)


def _reason(views: list[ViewRecord], link_types: list[str]) -> str:
    kinds = ", ".join(f"{v.view_type} (p{v.page})" for v in views)
    via = " + ".join(link_types) if link_types else "shared region"
    return f"Linked via {via}: {kinds}."
