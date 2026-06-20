"""Retrieval-quality evaluation: recall@k and MRR over a labelled set.

Pure metric logic — no Supabase, no network. It takes a ``retrieve`` callable
``(flag, k) -> ordered list of hits`` and a set of labels, and scores how often
(and how highly) the expected clause is retrieved. The live wiring lives in
``run_live.py``; this module is unit-testable with a fake retriever.

A label is a "hit at rank r" when the r-th retrieved clause comes from the
expected ``document_id`` *and* its text contains ``clause_contains`` — tolerant
of clause-number drift while still pinning the right document and topic.
"""

from __future__ import annotations

import pathlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

import yaml

_LABELS_PATH = pathlib.Path(__file__).with_name("labels.yaml")


class Hit(Protocol):
    document_id: str
    text: str


@dataclass
class Label:
    id: str
    flag: dict[str, Any]
    expect_document_id: str | None
    clause_contains: str | None


@dataclass
class EvalResult:
    n: int
    recall_at: dict[int, float]
    mrr: float
    misses: list[str] = field(default_factory=list)


def load_labels(path: pathlib.Path | None = None) -> list[Label]:
    raw = yaml.safe_load((path or _LABELS_PATH).read_text())
    out: list[Label] = []
    for row in raw.get("labels", []):
        expect = row.get("expect") or {}
        out.append(
            Label(
                id=row["id"],
                flag={
                    "category": row.get("category"),
                    "verbatim_quote": row.get("verbatim_quote", ""),
                    "reason": row.get("reason", ""),
                    "recommended_action": row.get("recommended_action", ""),
                },
                expect_document_id=expect.get("document_id"),
                clause_contains=expect.get("clause_contains"),
            )
        )
    return out


def _matches(hit: Any, label: Label) -> bool:
    doc = getattr(hit, "document_id", "") or ""
    text = getattr(hit, "text", "") or ""
    if label.expect_document_id and doc != label.expect_document_id:
        return False
    if label.clause_contains and label.clause_contains.lower() not in text.lower():
        return False
    # A label with neither expectation is unscoreable; treat as no match.
    return bool(label.expect_document_id or label.clause_contains)


def _first_match_rank(hits: list[Any], label: Label) -> int | None:
    for rank, hit in enumerate(hits, start=1):
        if _matches(hit, label):
            return rank
    return None


def evaluate(
    retrieve: Callable[[dict[str, Any], int], list[Any]],
    labels: list[Label],
    *,
    ks: tuple[int, ...] = (1, 3, 5),
) -> EvalResult:
    """Score ``retrieve`` against ``labels``.

    ``retrieve(flag, k)`` must return clauses ordered best-first. We request
    ``max(ks)`` and read ranks off that single ordered list.
    """
    if not labels:
        return EvalResult(n=0, recall_at={k: 0.0 for k in ks}, mrr=0.0)
    kmax = max(ks)
    hit_counts = {k: 0 for k in ks}
    reciprocal_sum = 0.0
    misses: list[str] = []
    for label in labels:
        hits = retrieve(label.flag, kmax)
        rank = _first_match_rank(hits, label)
        if rank is None:
            misses.append(label.id)
            continue
        reciprocal_sum += 1.0 / rank
        for k in ks:
            if rank <= k:
                hit_counts[k] += 1
    n = len(labels)
    return EvalResult(
        n=n,
        recall_at={k: hit_counts[k] / n for k in ks},
        mrr=reciprocal_sum / n,
        misses=misses,
    )
