"""Per-sheet view records for cross-view reconciliation.

A drawing set is many 2D projections of one building. Before we can check
that they agree, we need a structured record of what each sheet depicts and
the registration anchors it exposes (level/datum values, section/detail
callouts). This module:

  - seeds a ``view_type`` guess deterministically from the sheet code +
    register title (cheap, no LLM), used as a prompt hint; and
  - merges the ``view`` object the analyser vision pass emits across its N
    self-consistency passes into a single :class:`ViewRecord`.

Only the level/datum + callout anchors are consumed by the first
reconciliation slice; the record is deliberately small.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.extractors.plan_text import discipline_for_sheet
from app.vision.plans.schema import VIEW_TYPE_ENUM

# Title keyword -> view_type. Order matters: the first match wins, so the more
# specific phrases ("site plan") must precede the generic ones ("plan").
_TITLE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bsite\b|\blocation\b", re.I), "site"),
    (re.compile(r"\bsection", re.I), "section"),
    (re.compile(r"\belevation", re.I), "elevation"),
    (re.compile(r"\bdetail", re.I), "detail"),
    (re.compile(r"\bschedule\b", re.I), "schedule"),
    (re.compile(r"\b3d\b|\baxonometric\b|\bperspective\b|\bisometric\b", re.I), "3d"),
    (re.compile(r"\bplan\b", re.I), "plan"),
]


@dataclass
class ViewRecord:
    page: int
    sheet_number: str | None = None
    title: str | None = None
    view_type: str = "other"
    discipline: str = "unknown"
    level_id: str | None = None
    scale: str | None = None
    datums: list[dict[str, Any]] = field(default_factory=list)
    callouts: list[dict[str, Any]] = field(default_factory=list)

    def to_debug(self) -> dict[str, Any]:
        return {
            "page": self.page,
            "sheet_number": self.sheet_number,
            "view_type": self.view_type,
            "discipline": self.discipline,
            "level_id": self.level_id,
            "datums": self.datums,
            "callouts": self.callouts,
        }


def seed_view_type(
    sheet_number: str | None, title: str | None
) -> tuple[str | None, float]:
    """Guess ``view_type`` from the title (strong) or sheet code (weak).

    Returns ``(view_type | None, confidence)``. The title carries the real
    signal ("Ground Floor Plan", "Section A-A"); the sheet-code prefix is only
    a faint hint (an ``A``/``S`` prefix says discipline, not view kind), so we
    do not infer view_type from it alone.
    """
    for pattern, vtype in _TITLE_RULES:
        if title and pattern.search(title):
            return vtype, 0.85
    return None, 0.0


def seed_hint(sheet_number: str | None, title: str | None) -> str:
    """A one-line per-sheet hint appended to the analyser prompt when enabled."""
    guess, _ = seed_view_type(sheet_number, title)
    bits = []
    if sheet_number:
        bits.append(f"sheet_number={sheet_number}")
    if title:
        bits.append(f'register_title="{title}"')
    if guess:
        bits.append(f"likely view_type={guess}")
    if not bits:
        return ""
    return "Deterministic hint for this sheet: " + ", ".join(bits) + "."


def _clean_str(v: Any) -> str | None:
    s = str(v).strip() if v is not None else ""
    return s or None


def _dedupe(items: list[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    seen: set[tuple[str, ...]] = set()
    out: list[dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        key = tuple(re.sub(r"\s+", " ", str(it.get(f) or "")).strip().lower() for f in key_fields)
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def build_view_record(
    *,
    page: int,
    sheet_number: str | None,
    title: str | None,
    view_payloads: list[dict[str, Any] | None],
) -> ViewRecord:
    """Merge the ``view`` objects from N analyser passes into one record.

    Scalars take the first non-empty value across passes; list anchors
    (datums, callouts) are unioned and de-duplicated, since each pass may
    read a different subset off a dense sheet. ``view_type`` prefers the
    model's agreement but falls back to the deterministic title seed.
    """
    payloads = [p for p in view_payloads if isinstance(p, dict)]

    # view_type: most common model answer, else title seed, else "other".
    model_types = [
        t for p in payloads if (t := _clean_str(p.get("view_type"))) in VIEW_TYPE_ENUM
    ]
    seed_type, _ = seed_view_type(sheet_number, title)
    if model_types:
        view_type = max(set(model_types), key=model_types.count)
    else:
        view_type = seed_type or "other"

    def _first(field_name: str) -> str | None:
        for p in payloads:
            val = _clean_str(p.get(field_name))
            if val:
                return val
        return None

    datums: list[dict[str, Any]] = []
    callouts: list[dict[str, Any]] = []
    for p in payloads:
        datums.extend(d for d in (p.get("datums") or []) if isinstance(d, dict))
        callouts.extend(c for c in (p.get("callouts") or []) if isinstance(c, dict))

    return ViewRecord(
        page=page,
        sheet_number=sheet_number,
        title=title,
        view_type=view_type,
        discipline=discipline_for_sheet(sheet_number, title),
        level_id=_first("level_id"),
        scale=_first("scale"),
        datums=_dedupe(datums, ("label", "value")),
        callouts=_dedupe(callouts, ("marker", "target_sheet")),
    )
