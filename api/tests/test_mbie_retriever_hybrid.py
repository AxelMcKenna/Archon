"""Hybrid retrieval wiring + its degradation guarantees.

The retriever must never let an embedding outage or a missing hybrid RPC
break verification: embedding failure → sparse-only (null vector to the
hybrid RPC); hybrid RPC failure → fall back to the FTS-only RPC.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.mbie.retriever as rv


class _Exec:
    def __init__(self, behavior):
        self._b = behavior

    def execute(self):
        if isinstance(self._b, Exception):
            raise self._b
        return SimpleNamespace(data=self._b)


class _FakeDB:
    """Records rpc(name, params) calls; each name maps to a row list or an
    Exception to raise on execute()."""

    def __init__(self, behaviors):
        self._behaviors = behaviors
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return _Exec(self._behaviors[name])


_ROW = {
    "document_id": "E2/AS1", "clause_number": "9.1.1", "heading": "Cavities",
    "text": "35mm drained cavity", "page": 5, "source_url": "u", "rank": 0.5,
}
_FLAG = {"category": "building_code:E2", "verbatim_quote": "35mm cavity"}


def test_hybrid_path_used_with_embedding(monkeypatch):
    monkeypatch.setattr("app.llm.embeddings.embed_query", lambda q: [0.1, 0.2, 0.3])
    db = _FakeDB({"match_mbie_clauses_hybrid": [_ROW]})
    hits = rv.retrieve_for_flag(db, flag=_FLAG, k=3)
    assert len(hits) == 1 and hits[0].document_id == "E2/AS1"
    name, params = db.calls[0]
    assert name == "match_mbie_clauses_hybrid"
    assert params["p_code_clause"] == "E2"
    assert params["p_embedding"] is not None  # dense arm engaged


def test_sparse_only_when_embedding_fails(monkeypatch):
    def boom(q):
        raise RuntimeError("embed down")
    monkeypatch.setattr("app.llm.embeddings.embed_query", boom)
    db = _FakeDB({"match_mbie_clauses_hybrid": [_ROW]})
    hits = rv.retrieve_for_flag(db, flag=_FLAG, k=3)
    assert len(hits) == 1
    name, params = db.calls[0]
    # Still the hybrid RPC, but with a null vector → it degrades to FTS inside.
    assert name == "match_mbie_clauses_hybrid"
    assert params["p_embedding"] is None


def test_fallback_to_fts_rpc_when_hybrid_errors(monkeypatch):
    monkeypatch.setattr("app.llm.embeddings.embed_query", lambda q: [0.1, 0.2])
    db = _FakeDB({
        "match_mbie_clauses_hybrid": RuntimeError("no such function"),
        "match_mbie_clauses": [_ROW],
    })
    hits = rv.retrieve_for_flag(db, flag=_FLAG, k=3)
    assert len(hits) == 1
    assert [c[0] for c in db.calls] == [
        "match_mbie_clauses_hybrid", "match_mbie_clauses"
    ]


def test_non_building_code_category_skips_retrieval(monkeypatch):
    monkeypatch.setattr("app.llm.embeddings.embed_query", lambda q: [0.1])
    db = _FakeDB({})
    assert rv.retrieve_for_flag(db, flag={"category": "documentation:plans"}) == []
    assert db.calls == []


@pytest.mark.parametrize("vec,expected", [
    ([0.0, 1.5, -2.25], "[0,1.5,-2.25]"),
    ([], "[]"),
])
def test_vec_literal(vec, expected):
    assert rv._vec_literal(vec) == expected
