"""Determinism fixes (wiki/issues 0002/0004/0005/0008/0009).

Pins the properties the audit found missing:
- verifier calls are chunked so a verdict can't vanish to output truncation,
  and hallucinated out-of-chunk verdicts can't vote (0004);
- dedup/vote representatives and Stage-A best_match are pure functions of
  content, not of the model's emission order (0005/0009);
- the drafter cache is keyed on the evidence *content*, so a re-grounded item
  never serves a draft grounded in evidence that no longer exists (0008).
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import app.drafter as drafter
import app.vision.plans.vision_pass as vp
from app.extractors.metrics import Metrics
from app.grounding.matcher import FlagCandidate, best_match
from app.plans.vote import dedup_flags, vote_flags
from app.vision.core.renderer import RenderedImage

# --- 0004: verifier chunking ------------------------------------------------


def _fake_settings(chunk_size: int, n: int = 1, threshold: int = 2):
    return type(
        "S",
        (),
        {
            "plan_verifier_provider": "gemini",
            "openrouter_verifier_model": "m",
            "gemini_verifier_model": "m",
            "plan_verifier_voting_n": n,
            "plan_verifier_voting_threshold": threshold,
            "plan_verifier_flags_per_call": chunk_size,
        },
    )()


def _setup_verify(monkeypatch, *, flags, chunk_size, respond, n=1, threshold=2):
    """Wire verify_flags with a fake invoke_tool.

    ``respond(chunk_ids)`` returns the verifications list for a call whose
    prompt contained exactly ``chunk_ids``.
    """
    monkeypatch.setattr(
        vp,
        "_retrieve_mbie_context",
        lambda f, risk_group="": (["" for _ in f], [[] for _ in f]),
    )
    monkeypatch.setattr(vp, "load_prompt", lambda key: ("{{flags_block}}", "v"))
    monkeypatch.setattr(vp, "caption_str", lambda img: "cap")
    monkeypatch.setattr(
        vp, "get_settings", lambda: _fake_settings(chunk_size, n=n, threshold=threshold)
    )

    seen_chunks: list[list[int]] = []

    def fake_invoke(**kw):
        entries = json.loads(kw["prompt"])
        ids = [e["flag_id"] for e in entries]
        seen_chunks.append(ids)
        return ({"verifications": respond(ids)}, 1, 1)

    monkeypatch.setattr(vp, "invoke_tool", fake_invoke)
    images = [RenderedImage(page=1, tile="full", png=b"x", dpi=72)]
    kept, drops, status, _ = vp.verify_flags(
        images=images, flags=flags, metrics=Metrics()
    )
    return kept, drops, status, seen_chunks


def _flags(count: int) -> list[dict[str, Any]]:
    return [
        {"category": "building_code:E2", "area": f"area {i}", "verbatim_quote": f"q{i}"}
        for i in range(count)
    ]


def test_flags_are_chunked_with_global_ids(monkeypatch):
    kept, drops, status, seen = _setup_verify(
        monkeypatch,
        flags=_flags(5),
        chunk_size=2,
        respond=lambda ids: [
            {"flag_id": i, "verified": True, "as_compliant": False} for i in ids
        ],
    )
    assert status == "verified"
    assert seen == [[0, 1], [2, 3], [4]]  # global flag_ids, chunked
    assert len(kept) == 5 and not drops


def test_drop_verdict_in_later_chunk_drops_right_flag(monkeypatch):
    kept, drops, _, _ = _setup_verify(
        monkeypatch,
        flags=_flags(5),
        chunk_size=2,
        respond=lambda ids: [
            {"flag_id": i, "verified": i != 4, "as_compliant": False} for i in ids
        ],
    )
    assert len(drops) == 1
    assert drops[0]["verbatim_quote"] == "q4"
    assert len(kept) == 4


def test_hallucinated_out_of_chunk_verdicts_are_ignored(monkeypatch):
    # Every call also "drops" flag 0, but only the first chunk was asked about
    # flag 0 — verdicts for ids outside the chunk must not vote.
    def respond(ids):
        out = [{"flag_id": i, "verified": True, "as_compliant": False} for i in ids]
        if 0 not in ids:
            out.append({"flag_id": 0, "verified": False})
        return out

    kept, drops, _, _ = _setup_verify(
        monkeypatch, flags=_flags(4), chunk_size=2, respond=respond
    )
    assert not drops and len(kept) == 4


def test_chunking_composes_with_voting(monkeypatch):
    # 2 chunks × 2 passes = 4 calls; a unanimous drop in the second chunk
    # still crosses the threshold with global ids intact.
    kept, drops, _, seen = _setup_verify(
        monkeypatch,
        flags=_flags(4),
        chunk_size=2,
        n=2,
        threshold=2,
        respond=lambda ids: [
            {"flag_id": i, "verified": i != 3, "as_compliant": False} for i in ids
        ],
    )
    assert seen == [[0, 1], [0, 1], [2, 3], [2, 3]]
    assert len(drops) == 1 and drops[0]["verbatim_quote"] == "q3"
    assert len(kept) == 3


def test_missing_verdicts_in_chunk_fail_open(monkeypatch):
    # A chunk's response omits one of its flags (truncation analogue) — that
    # flag is kept unverified, never dropped.
    kept, drops, _, _ = _setup_verify(
        monkeypatch,
        flags=_flags(3),
        chunk_size=3,
        respond=lambda ids: [
            {"flag_id": i, "verified": True, "as_compliant": False}
            for i in ids
            if i != 2
        ],
    )
    assert not drops and len(kept) == 3
    assert "no verdict" in (kept[2].get("verification_note") or "")


# --- 0005: representative selection is order-independent ---------------------


def test_dedup_representative_ignores_arrival_order():
    a = {"page": 1, "area": "kitchen", "category": "c", "confidence": "high",
         "verbatim_quote": "short"}
    b = {"page": 1, "area": "kitchen", "category": "c", "confidence": "high",
         "verbatim_quote": "a much longer grounded quote"}
    assert dedup_flags([a, b]) == dedup_flags([b, a]) == [b]


def test_vote_representative_ignores_arrival_order():
    # Same vote bucket (same quote), equal confidence and category — the
    # representative must not depend on run order.
    a = {"page": 1, "verbatim_quote": "Kitchen 4,050 x 2,900",
         "category": "c", "confidence": "medium", "reason": "alpha"}
    b = {"page": 1, "verbatim_quote": "Kitchen 4.050 x 2.900",
         "category": "c", "confidence": "medium", "reason": "beta"}
    r1 = vote_flags([[a], [b]], threshold=2)
    r2 = vote_flags([[b], [a]], threshold=2)
    assert len(r1) == len(r2) == 1
    assert r1[0]["reason"] == r2[0]["reason"]


# --- 0009: best_match ties are content-decided --------------------------------


def _candidate(index: int, *, quote: str) -> FlagCandidate:
    return FlagCandidate(
        index=index,
        rule_cited="NZBC F7",
        rationale="smoke alarm missing in hallway",
        verbatim_quote=quote,
        severity="major",
        target_handles=[],
        image_bboxes={},
        proposed_change=None,
        page=1,
    )


def test_best_match_tie_is_order_independent():
    # Two flags with identical scoring signals except the quote — the winner
    # must be the same whichever order the flagger emitted them in.
    fa = _candidate(0, quote="zebra quote")
    fb = _candidate(1, quote="alpha quote")
    m1 = best_match("smoke alarm hallway F7", [], [fa, fb])
    fa2 = _candidate(1, quote="zebra quote")
    fb2 = _candidate(0, quote="alpha quote")
    m2 = best_match("smoke alarm hallway F7", [], [fb2, fa2])
    assert m1 is not None and m2 is not None
    # Same content wins both times ("zebra quote" sorts last → max) even
    # though its index differs between the two orderings.
    assert m1.flag_index == 0 and m2.flag_index == 1


# --- 0008: drafter cache keyed on evidence content ----------------------------


def test_drafter_cache_invalidated_by_evidence_content_change(monkeypatch):
    monkeypatch.setattr(drafter, "_DRAFT_CACHE", {})
    # Shared cache (0007) stubbed out — this test pins the *key* semantics.
    monkeypatch.setattr(
        drafter,
        "result_cache",
        SimpleNamespace(
            get=lambda kind, key: None, put=lambda kind, key, value, **kw: value
        ),
    )
    monkeypatch.setattr(
        drafter, "_load_prompt", lambda name: ("{{plan_evidence_block}}", "9.9")
    )
    monkeypatch.setattr(
        drafter,
        "get_settings",
        lambda: type("S", (), {"drafter_provider": "gemini", "gemini_model": "m"})(),
    )
    calls = iter(["draft one", "draft two", "draft three"])

    def fake_gemini(**kw):
        return type(
            "R", (), {"payload": {"draft_text": next(calls)},
                      "input_tokens": 1, "output_tokens": 1},
        )()

    monkeypatch.setattr(drafter, "call_gemini_tool", fake_gemini)

    def _draft(rationale: str) -> str:
        text, _, _ = drafter.draft_response(
            bca="Auckland", project_type="new_dwelling", project_description="",
            application_ref=None, rfi_number=1,
            item_text="item", category="cat", severity="minor", reasoning="",
            acceptable_solution=None,
            plan_evidence={
                "source": "flag", "flag_index": 3,
                "evidence": {"rule_cited": "NZBC E2", "rationale": rationale},
            },
        )
        return text

    first = _draft("old rationale")
    same = _draft("old rationale")
    changed = _draft("new rationale after flagger re-run")
    assert first == same == "draft one"  # identical evidence still caches
    assert changed == "draft two"  # same source/index, new content → re-draft
