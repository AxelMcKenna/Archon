"""Cross-run consensus voting + per-run dedup for plan flags."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from typing import Any

_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def _rep_key(f: dict[str, Any]) -> tuple[int, int, str]:
    """Total order for picking a bucket's representative flag.

    Confidence first, then the longer verbatim_quote (more grounding), then a
    canonical serialisation as the final tiebreaker — so the surviving
    wording/geometry is a pure function of the bucket contents, independent of
    the order the model happened to emit them in (wiki/issues/0005).
    """
    return (
        _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0),
        len(f.get("verbatim_quote") or ""),
        json.dumps(f, sort_keys=True, default=str),
    )


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

    Keeps the entry ranked highest by ``_rep_key`` (confidence, quote length,
    canonical content) so ties don't fall back to arrival order.
    """
    seen: dict[tuple[int, str, str], dict[str, Any]] = {}
    for f in flags:
        key = flag_key(f)
        existing = seen.get(key)
        if existing is None or _rep_key(f) > _rep_key(existing):
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
    """Collapse duplicate cross-view flags, keeping the highest-confidence hit
    (ties broken by ``_rep_key``, not arrival order)."""
    seen: dict[tuple[tuple[int, int], tuple[str, str]], dict[str, Any]] = {}
    for f in flags:
        key = cross_view_key(f)
        existing = seen.get(key)
        if existing is None or _rep_key(f) > _rep_key(existing):
            seen[key] = f
    return list(seen.values())


def _bucket_flags(
    runs: list[list[dict[str, Any]]],
) -> dict[tuple[int, str], list[dict[str, Any]]]:
    """Bucket flags across runs by ``vote_key``; within a single run duplicate
    keys count once (so a hyperactive run can't pad the vote)."""
    buckets: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for run in runs:
        seen_in_run: set[tuple[int, str]] = set()
        for f in run:
            key = vote_key(f)
            if key in seen_in_run:
                continue
            seen_in_run.add(key)
            buckets[key].append(f)
    return buckets


def _bucket_best(hits: list[dict[str, Any]]) -> dict[str, Any]:
    """Representative of a bucket: highest confidence, ties broken by
    most-common category within the bucket, then by ``_rep_key``."""
    cat_counts = Counter(f.get("category") for f in hits)

    def _score(f: dict[str, Any]) -> tuple[int, int, int, int, str]:
        return (
            _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0),
            cat_counts[f.get("category")],
            *_rep_key(f),
        )

    return max(hits, key=_score)


def vote_flags(
    runs: list[list[dict[str, Any]]],
    *,
    threshold: int,
    low_confidence_extra_vote: bool = False,
) -> list[dict[str, Any]]:
    """Cross-run consensus voting.

    Bucket every flag by ``vote_key`` — primarily by (page, normalised
    verbatim_quote). The model labels the same observation with different
    `area` prose and different `category` labels across runs, but the
    verbatim quote (a string copied off the drawing) is much more stable
    — so it's the strongest cross-run anchor we have.

    Keep buckets that appear in >= threshold distinct runs; the surviving
    representative is the highest-confidence hit, with ties broken by
    most-common category within the bucket.

    ``low_confidence_extra_vote`` (plan_low_confidence_extra_vote): a bucket
    whose *best* hit is only low-confidence needs one extra vote to survive
    (clamped to the number of runs, so 3/3 at n=3) — the model's own
    uncertainty signal gates its noisiest output.
    """
    threshold = max(1, threshold)
    n_runs = max(1, len(runs))
    out: list[dict[str, Any]] = []
    for hits in _bucket_flags(runs).values():
        best = _bucket_best(hits)
        need = threshold
        if (
            low_confidence_extra_vote
            and _CONFIDENCE_RANK.get(best.get("confidence", "low"), 0)
            <= _CONFIDENCE_RANK["low"]
        ):
            need = min(n_runs, threshold + 1)
        if len(hits) < need:
            continue
        out.append(best)
    return out


def rescue_singletons(
    runs: list[list[dict[str, Any]]], *, threshold: int
) -> list[dict[str, Any]]:
    """High-confidence buckets that MISSED the voting threshold
    (plan_singleton_rescue).

    Voting discards anything under the threshold, which trades recall for
    precision. This returns the representatives of sub-threshold buckets whose
    best hit is high-confidence, marked ``singleton_rescue: True`` — the
    analyser sends them through verification and keeps them only on a
    positive verdict (fail-closed; see ``_run_sheets_parallel``).
    """
    threshold = max(1, threshold)
    out: list[dict[str, Any]] = []
    for hits in _bucket_flags(runs).values():
        if len(hits) >= threshold:
            continue
        best = _bucket_best(hits)
        if _CONFIDENCE_RANK.get(best.get("confidence", "low"), 0) < _CONFIDENCE_RANK["high"]:
            continue
        out.append({**best, "singleton_rescue": True})
    return out


def dedup_by_vote_key(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse flags sharing a ``vote_key`` (page + normalised quote),
    keeping the highest by ``_rep_key``.

    Used to union the per-provider voting survivors under
    ``plan_analyser_ensemble``: the same observation surfaced by both model
    families should reach the verifier once, and ``flag_key``-based dedup
    misses it when the two providers phrase `area` differently.
    """
    seen: dict[tuple[int, str], dict[str, Any]] = {}
    for f in flags:
        key = vote_key(f)
        existing = seen.get(key)
        if existing is None or _rep_key(f) > _rep_key(existing):
            seen[key] = f
    return list(seen.values())
