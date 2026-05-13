"""Stage A retrieval — match RFI items to existing analyser flags on the linked plan.

The submitted plan was (usually) already analysed for flags before the RFI
arrived. Each flag carries a clause citation, a verbatim quote of the plan
text it references, a rationale, and (for DXF) an entity handle + bbox.

For every RFI item, we look for the single best-fitting flag on the linked
plan. When we find one above threshold, the drafter can ground its response
in the matched flag — citing the clause, the location, and (DXF only) the
proposed_change op as the actual fix. Items with no good match are recorded
as source="none" and fall through to manual handling (or Stage B vision in a
later phase).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

MATCHER_VERSION = "stage-a-1.0"
MATCH_THRESHOLD = 0.35

# Stopwords stripped before token-overlap scoring. Kept narrow on purpose —
# we want NZBC clause names, fixture words ("smoke", "alarm", "sink") and
# location words ("hallway", "bathroom") to all count.
_STOP = frozenset(
    [
        "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for",
        "with", "without", "is", "are", "be", "been", "being", "this", "that",
        "these", "those", "it", "its", "as", "by", "from", "into", "over",
        "under", "not", "no", "please", "provide", "confirm", "show", "update",
        "reissue", "annotate", "include", "identify", "item", "items", "rfi",
        "nzbc", "as1", "letter", "response", "building", "consent",
    ]
)

_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-]{1,}", re.IGNORECASE)
# Pull "F7", "G4", "G12", "E2", "B1" out of strings like "NZBC F7", "F7/AS1",
# "F7 / F7/AS1", "NZBC G12 / NZS 4219", "NZBC E2".
_CLAUSE = re.compile(r"\b([A-H]\d{1,2})\b")


@dataclass
class FlagCandidate:
    """A flag from a plan_uploads.analysis.flags or cad_uploads.analysis.flags array."""

    index: int
    rule_cited: str | None
    rationale: str | None
    verbatim_quote: str | None
    severity: str | None
    target_handles: list[str]
    image_bboxes: dict[str, Any]
    proposed_change: dict[str, Any] | None
    page: int | None  # PDF flags carry page; DXF flags use views


@dataclass
class Match:
    flag_index: int
    score: float
    clause_overlap: float
    token_overlap: float
    matched_clauses: list[str]
    matched_tokens: list[str]


def _clauses(text: str | None) -> set[str]:
    if not text:
        return set()
    return {m.group(1).upper() for m in _CLAUSE.finditer(text)}


def _tokens(text: str | None) -> set[str]:
    if not text:
        return set()
    return {
        t.lower()
        for t in _TOKEN.findall(text)
        if t.lower() not in _STOP and len(t) > 2
    }


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    inter = a & b
    if not inter:
        return 0.0
    return len(inter) / len(a | b)


def _flag_clauses(flag: FlagCandidate) -> set[str]:
    """Pull clause codes from the flag's rule_cited AND rationale."""
    return _clauses(flag.rule_cited) | _clauses(flag.rationale)


def _flag_tokens(flag: FlagCandidate) -> set[str]:
    return _tokens(flag.rationale) | _tokens(flag.verbatim_quote) | _tokens(flag.rule_cited)


def _item_clauses(item_text: str, extracted_clauses: list[str]) -> set[str]:
    return _clauses(item_text) | {c.upper() for c in extracted_clauses for c in _CLAUSE.findall(c)}


def score_match(
    item_text: str,
    item_clause_refs: list[str],
    flag: FlagCandidate,
) -> Match:
    """Composite score for one (item, flag) pair.

    Two signals only — clause overlap (Jaccard over NZBC clause codes) and
    token overlap (Jaccard over content words). Weighted 60/40 toward
    clauses, since a clause match is far more diagnostic than incidental
    word overlap (e.g. "smoke alarm" vs "alarm system").
    """
    ic = _item_clauses(item_text, item_clause_refs)
    fc = _flag_clauses(flag)
    it = _tokens(item_text)
    ft = _flag_tokens(flag)

    clause_overlap = _jaccard(ic, fc)
    token_overlap = _jaccard(it, ft)
    score = 0.6 * clause_overlap + 0.4 * token_overlap

    return Match(
        flag_index=flag.index,
        score=score,
        clause_overlap=clause_overlap,
        token_overlap=token_overlap,
        matched_clauses=sorted(ic & fc),
        matched_tokens=sorted(it & ft),
    )


def best_match(
    item_text: str,
    item_clause_refs: list[str],
    flags: list[FlagCandidate],
) -> Match | None:
    """Pick the highest-scoring flag if it clears the threshold."""
    if not flags:
        return None
    scored = [score_match(item_text, item_clause_refs, f) for f in flags]
    best = max(scored, key=lambda m: m.score)
    return best if best.score >= MATCH_THRESHOLD else None


def parse_flags(raw_flags: list[dict[str, Any]]) -> list[FlagCandidate]:
    """Normalise the analyser's flag dicts (PDF or DXF shape) into candidates.

    PDF flag fields: severity, rationale, rule_cited, verbatim_quote, page,
      bbox.
    DXF flag fields: severity, rationale, rule_cited, verbatim_quote,
      target_handles, image_bboxes, proposed_change.
    """
    out: list[FlagCandidate] = []
    for i, f in enumerate(raw_flags):
        out.append(
            FlagCandidate(
                index=i,
                rule_cited=f.get("rule_cited"),
                rationale=f.get("rationale"),
                verbatim_quote=f.get("verbatim_quote"),
                severity=f.get("severity"),
                target_handles=list(f.get("target_handles") or []),
                image_bboxes=dict(f.get("image_bboxes") or {}),
                proposed_change=f.get("proposed_change"),
                page=f.get("page"),
            )
        )
    return out


def evidence_payload(flag: FlagCandidate, match: Match) -> dict[str, Any]:
    """Denormalised evidence written into rfi_item_plan_evidence.evidence.

    The drafter reads this directly — no joins back to the plan's analysis
    JSON at draft time. Matched clauses/tokens are kept so the UI can show
    *why* this flag was picked.
    """
    return {
        "rule_cited": flag.rule_cited,
        "rationale": flag.rationale,
        "verbatim_quote": flag.verbatim_quote,
        "severity": flag.severity,
        "target_handles": flag.target_handles,
        "image_bboxes": flag.image_bboxes,
        "proposed_change": flag.proposed_change,
        "page": flag.page,
        "matched_clauses": match.matched_clauses,
        "matched_tokens": match.matched_tokens[:12],
        "clause_overlap": round(match.clause_overlap, 3),
        "token_overlap": round(match.token_overlap, 3),
    }
