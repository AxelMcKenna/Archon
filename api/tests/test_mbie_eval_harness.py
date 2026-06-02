"""Retrieval-eval harness: metric correctness (offline, fake retriever) and
that the shipped labelled set is well-formed and scoreable."""

from __future__ import annotations

from dataclasses import dataclass

from app.mbie.eval.harness import Label, evaluate, load_labels


@dataclass
class _Hit:
    document_id: str
    text: str


def _label(**kw) -> Label:
    base = dict(
        id="x",
        flag={"category": "building_code:E2"},
        expect_document_id="E2/AS1",
        clause_contains="cavity",
    )
    base.update(kw)
    return Label(**base)


def test_recall_and_mrr_from_known_ranks():
    labels = [_label(id="a"), _label(id="b"), _label(id="c")]
    # a: match at rank 1; b: match at rank 3; c: no match.
    plans = {
        "a": [_Hit("E2/AS1", "drained cavity")],
        "b": [_Hit("X", "no"), _Hit("Y", "no"), _Hit("E2/AS1", "a cavity here")],
        "c": [_Hit("X", "irrelevant")],
    }
    order = iter(["a", "b", "c"])

    def retrieve(flag, k):
        return plans[next(order)]

    res = evaluate(retrieve, labels, ks=(1, 3, 5))
    assert res.n == 3
    assert res.recall_at[1] == 1 / 3  # only "a"
    assert res.recall_at[3] == 2 / 3  # "a" and "b"
    assert res.recall_at[5] == 2 / 3
    # MRR = (1/1 + 1/3 + 0) / 3
    assert abs(res.mrr - (1 + 1 / 3) / 3) < 1e-9
    assert res.misses == ["c"]


def test_document_id_must_match():
    label = _label(clause_contains=None)  # only doc-id expectation
    res = evaluate(lambda f, k: [_Hit("WRONG/AS1", "cavity")], [label], ks=(1,))
    assert res.recall_at[1] == 0.0


def test_clause_contains_is_case_insensitive():
    label = _label(expect_document_id=None, clause_contains="Cavity")
    res = evaluate(lambda f, k: [_Hit("any", "DRAINED CAVITY DETAIL")], [label], ks=(1,))
    assert res.recall_at[1] == 1.0


def test_empty_labels():
    res = evaluate(lambda f, k: [], [], ks=(1, 3))
    assert res.n == 0 and res.recall_at == {1: 0.0, 3: 0.0} and res.mrr == 0.0


class TestShippedLabels:
    def test_load_and_wellformed(self):
        labels = load_labels()
        assert len(labels) >= 10
        ids = [lab.id for lab in labels]
        assert len(ids) == len(set(ids)), "duplicate label ids"
        for lab in labels:
            # Every label must be scoreable and carry a real flag category.
            assert lab.expect_document_id or lab.clause_contains
            assert (lab.flag.get("category") or "").startswith("building_code:")
            assert lab.flag.get("verbatim_quote")
