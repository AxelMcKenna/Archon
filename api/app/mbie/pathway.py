"""Sanity-check citations in a verifier-written Alternative-Solution pathway.

`alt_solution_pathway` is free text the (cheap) verifier model writes to suggest
how an AS deviation could still comply — it routinely cites Building Code
clauses (e.g. "E2.3.2"), standards (AS/NZS …) and producer statements (PS1–4).
That text is ungrounded, so it can cite a clause that does not exist.

We can't validate a *performance clause's sub-number* (those aren't in the
corpus), but we can catch outright fabrication at the clause level: a citation
whose Building Code clause isn't a real clause (e.g. "E9.1", "Z2.3"). The valid
clause set is fixed and public, so this is deterministic and low-false-positive
— a citation to a real clause is never flagged. Surfacing the flagged citations
lets the UI mark the pathway "contains unverified references" instead of
presenting hallucinated clause numbers as fact.
"""

from __future__ import annotations

import re

# Canonical NZ Building Code clauses (Schedule 1). Clause-level only — this is
# the granularity we can verify.
VALID_CLAUSES: frozenset[str] = frozenset(
    [
        "A1", "A2", "A3",
        "B1", "B2",
        "C1", "C2", "C3", "C4", "C5", "C6",
        "D1", "D2",
        "E1", "E2", "E3",
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9",
        "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9",
        "G10", "G11", "G12", "G13", "G14", "G15",
        "H1",
    ]
)

# A Building Code citation: a clause id (letter A–H + 1–2 digits) optionally
# followed by dotted sub-clauses (E2.3.2, G12.3.1). Anchored on word bounds so
# it doesn't fire inside standards numbers (AS/NZS 2918) or "PS1".
_CITATION_RE = re.compile(r"\b([A-H][0-9]{1,2}(?:\.[0-9]+){0,3})\b")


def pathway_citations(text: str | None) -> list[str]:
    """All Building Code clause citations in ``text`` (full dotted form)."""
    if not text:
        return []
    return _CITATION_RE.findall(text)


def unverified_citations(text: str | None) -> list[str]:
    """Citations whose clause-level id isn't a real Building Code clause.

    De-duplicated, order-preserving. A citation like ``E2.3.2`` reduces to
    clause ``E2`` (valid → not flagged); ``E9.1`` reduces to ``E9`` (not a real
    clause → flagged)."""
    seen: set[str] = set()
    out: list[str] = []
    for cite in pathway_citations(text):
        clause = cite.split(".", 1)[0]
        if clause not in VALID_CLAUSES and cite not in seen:
            seen.add(cite)
            out.append(cite)
    return out
