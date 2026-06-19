"""Cross-run consensus voting + per-run dedup for plan flags."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def normalise_area(area: str) -> str:
    return re.sub(r"\s+", " ", area or "").strip().lower()


def flag_key(f: dict[str, Any]) -> tuple[int, str, str]:
    return (
        int(f.get("page") or 0),
        normalise_area(f.get("area", "")),
        str(f.get("category") or ""),
    )


def dedup_flags(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge flags with the same (page, normalised_area, category) key.

    Keeps the entry with the highest confidence, falling back to the first
    one seen.
    """
    seen: dict[tuple[int, str, str], dict[str, Any]] = {}
    for f in flags:
        key = flag_key(f)
        existing = seen.get(key)
        if existing is None:
            seen[key] = f
            continue
        new_rank = _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0)
        old_rank = _CONFIDENCE_RANK.get(existing.get("confidence", "low"), 0)
        if new_rank > old_rank:
            seen[key] = f
    return list(seen.values())


def quote_signature(q: str | None) -> str:
    """Aggressive normalisation for cross-run bucket keys.

    Strips non-alphanumeric and lowercases. "Kitchen 4,050 x 2,900" and
    "Kitchen 4.050 x 2.900" both reduce to "kitchen4050x2900" so they
    bucket together regardless of punctuation drift between runs.
    """
    return re.sub(r"[^a-z0-9]+", "", (q or "").lower())


def vote_key(f: dict[str, Any]) -> tuple[int, str]:
    """Bucket key for cross-run voting.

    Prefer the verbatim quote (anchored in real drawing text and stable
    across runs). Fall back to the area description only when no quote
    is present, so unquoted flags don't all collapse into one bucket.
    """
    page = int(f.get("page") or 0)
    quote_sig = quote_signature(f.get("verbatim_quote"))
    if quote_sig:
        return (page, f"q:{quote_sig}")
    return (page, f"a:{normalise_area(f.get('area', ''))}")


def cross_view_key(f: dict[str, Any]) -> tuple[tuple[int, int], tuple[str, str]]:
    """Bucket key for a cross-view flag (two citations).

    Order-independent: keyed on the sorted page pair and the sorted pair of
    quote signatures, so the same level/datum conflict surfaced from two
    overlapping comparison sets collapses to one RFI regardless of which view
    each call called "a".
    """
    cv = f.get("cross_view") or {}
    page_a = int(f.get("page") or 0)
    page_b = int(cv.get("page_b") or 0)
    pages = (min(page_a, page_b), max(page_a, page_b))
    sig_a = quote_signature(f.get("verbatim_quote"))
    sig_b = quote_signature(cv.get("verbatim_quote_b"))
    quotes = tuple(sorted((sig_a, sig_b)))
    return pages, quotes  # type: ignore[return-value]


def dedup_cross_view(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse duplicate cross-view flags, keeping the highest-confidence hit."""
    seen: dict[tuple[tuple[int, int], tuple[str, str]], dict[str, Any]] = {}
    for f in flags:
        key = cross_view_key(f)
        existing = seen.get(key)
        if existing is None:
            seen[key] = f
            continue
        new_rank = _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0)
        old_rank = _CONFIDENCE_RANK.get(existing.get("confidence", "low"), 0)
        if new_rank > old_rank:
            seen[key] = f
    return list(seen.values())


def vote_flags(
    runs: list[list[dict[str, Any]]], *, threshold: int
) -> list[dict[str, Any]]:
    """Cross-run consensus voting.

    Bucket every flag by ``vote_key`` — primarily by (page, normalised
    verbatim_quote). The model labels the same observation with different
    `area` prose and different `category` labels across runs, but the
    verbatim quote (a string copied off the drawing) is much more stable
    — so it's the strongest cross-run anchor we have.

    Within a single run, duplicate keys count once (so a hyperactive run
    can't pad the vote). Keep buckets that appear in >= threshold
    distinct runs; the surviving representative is the highest-confidence
    hit, with ties broken by most-common category within the bucket.
    """
    threshold = max(1, threshold)
    buckets: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for run in runs:
        seen_in_run: set[tuple[int, str]] = set()
        for f in run:
            key = vote_key(f)
            if key in seen_in_run:
                continue
            seen_in_run.add(key)
            buckets[key].append(f)

    out: list[dict[str, Any]] = []
    for hits in buckets.values():
        if len(hits) < threshold:
            continue
        cat_counts = Counter(f.get("category") for f in hits)

        def _score(
            f: dict[str, Any], _cat_counts: Counter = cat_counts
        ) -> tuple[int, int]:
            return (
                _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0),
                _cat_counts[f.get("category")],
            )

        best = max(hits, key=_score)
        out.append(best)
    return out
