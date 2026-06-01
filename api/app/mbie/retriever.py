"""Look up MBIE clauses relevant to a single flag.

Two-step retrieval:

  1. Map the flag's hierarchical taxonomy category to a top-level
     Building Code clause (``building_code:E2:cladding`` → ``E2``).
     This decides which AS document(s) to search inside.

  2. Run server-side FTS (``match_mbie_clauses`` RPC) over the flag's
     text content within that clause, ranked by ts_rank. Return the
     top-k hits.

Returns an empty list (rather than raising) when:
  - The flag isn't building-code categorised
  - No clauses for that code_clause are in the corpus yet
  - The text content has no useful tokens

The verifier treats an empty list as "no AS reference available" and
falls back to plain grounding verification.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from supabase import Client

_DEFAULT_K = 3


@dataclass
class ClauseHit:
    document_id: str
    clause_number: str | None
    heading: str | None
    text: str
    page: int | None
    source_url: str | None
    rank: float


def code_clause_for_category(category: str | None) -> str | None:
    """``building_code:E2:cladding`` → ``E2``. Returns None for
    non-building-code categories (e.g. ``documentation:plans``).

    The result may be a *specific* clause (``E2``, ``B1``, ``G12``) or a
    single-letter *family* key (``C``, ``D``, ``F``, ``G``) when the flag
    was only categorised to the top-level Building Code clause. The
    ``match_mbie_clauses`` RPC treats a single-letter key as a prefix match
    so a family key (e.g. ``F``) still finds its sub-clauses (``F2``,
    ``F4``) — without that, umbrella categories matched no clauses at all."""
    if not category or not category.startswith("building_code:"):
        return None
    parts = category.split(":", 2)
    if len(parts) < 2:
        return None
    return parts[1].strip() or None


def _build_query(flag: dict[str, Any]) -> str:
    """Free-text query string assembled from the flag's most informative
    fields. Order is by token weight in the FTS index."""
    parts: list[str] = []
    for key in ("verbatim_quote", "area", "reason", "recommended_action"):
        v = flag.get(key)
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    raw = " ".join(parts)
    # Strip punctuation that plainto_tsquery doesn't help with; keep
    # alphanumerics and basic separators.
    return re.sub(r"[^A-Za-z0-9\s\-\/\.]", " ", raw).strip()


def retrieve_for_flag(
    db: Client,
    *,
    flag: dict[str, Any],
    k: int = _DEFAULT_K,
) -> list[ClauseHit]:
    code_clause = code_clause_for_category(flag.get("category"))
    if not code_clause:
        return []
    query = _build_query(flag)
    if not query:
        return []
    resp = db.rpc(
        "match_mbie_clauses",
        {"p_code_clause": code_clause, "p_query": query, "p_limit": k},
    ).execute()
    rows = resp.data or []
    return [
        ClauseHit(
            document_id=r.get("document_id", ""),
            clause_number=r.get("clause_number"),
            heading=r.get("heading"),
            text=r.get("text", ""),
            page=r.get("page"),
            source_url=r.get("source_url"),
            rank=float(r.get("rank") or 0.0),
        )
        for r in rows
    ]


def format_hits_for_prompt(hits: list[ClauseHit], *, max_chars: int = 800) -> str:
    """Compact human/LLM-readable rendering for inclusion in the
    verifier prompt. Trims each clause body to keep total context bounded."""
    if not hits:
        return ""
    out: list[str] = []
    for h in hits:
        head = f"{h.document_id} §{h.clause_number or '?'}"
        if h.heading:
            head += f" — {h.heading}"
        body = h.text
        if len(body) > max_chars:
            body = body[: max_chars - 1].rstrip() + "…"
        out.append(f"- {head}\n  {body}")
    return "\n".join(out)
