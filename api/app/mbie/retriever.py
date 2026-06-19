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

import logging
import re
from dataclasses import dataclass
from typing import Any

from supabase import Client

log = logging.getLogger(__name__)

_DEFAULT_K = 3


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.7g}" for x in vec) + "]"


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


# Field sets per query variant. ``verbatim_quote`` is text copied off the
# drawing — dimensions, sheet codes, labels — which anchors cross-run voting
# well but is largely non-semantic noise for clause retrieval. ``prose`` drops
# it so the descriptive fields (which actually echo clause language) aren't
# diluted. The eval harness sweeps these to make the field choice a measured
# decision rather than an assumption.
QUERY_VARIANTS: dict[str, tuple[str, ...]] = {
    "full": ("verbatim_quote", "area", "reason", "recommended_action"),
    "prose": ("reason", "recommended_action", "area"),
    "quote_only": ("verbatim_quote",),
}


def _build_query(flag: dict[str, Any], variant: str = "full") -> str:
    """Free-text query string assembled from the flag's most informative
    fields, selected by ``variant`` (see ``QUERY_VARIANTS``)."""
    parts: list[str] = []
    for key in QUERY_VARIANTS.get(variant, QUERY_VARIANTS["full"]):
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
    mode: str = "hybrid",
    query_variant: str = "full",
) -> list[ClauseHit]:
    """Retrieve the top-k MBIE clauses for ``flag``.

    ``mode`` selects the retrieval arm:
      - ``"hybrid"`` (default, production): dense + FTS fused by RRF, with the
        documented degradation chain.
      - ``"sparse"``: FTS-only (``match_mbie_clauses``), no embedding call.
    The retrieval-quality harness uses ``mode`` to compare arms; ops can force
    ``"sparse"`` to keep working during an embedding outage.

    ``query_variant`` selects which flag fields form the query (see
    ``QUERY_VARIANTS``); production uses ``"full"`` and the harness sweeps the
    others to measure whether drawing-quote noise helps or hurts.
    """
    code_clause = code_clause_for_category(flag.get("category"))
    if not code_clause:
        return []
    query = _build_query(flag, query_variant)
    if not query:
        return []

    if mode == "sparse":
        resp = db.rpc(
            "match_mbie_clauses",
            {"p_code_clause": code_clause, "p_query": query, "p_limit": k},
        ).execute()
        return _rows_to_hits(resp.data or [])

    # Embed the query for the dense arm (best-effort). On any embedding
    # failure we pass None — the hybrid RPC then degrades to sparse-only —
    # and on RPC failure we fall back to the FTS-only RPC, so neither an
    # embedding outage nor a missing hybrid function can break verification.
    embedding_literal: str | None = None
    try:
        from app.llm.embeddings import embed_query

        vec = embed_query(query)
        if vec:
            embedding_literal = _vec_literal(vec)
    except Exception as exc:  # noqa: BLE001
        log.warning("query embedding failed; sparse-only retrieval: %s", exc)

    try:
        resp = db.rpc(
            "match_mbie_clauses_hybrid",
            {
                "p_code_clause": code_clause,
                "p_query": query,
                "p_embedding": embedding_literal,
                "p_limit": k,
            },
        ).execute()
        rows = resp.data or []
    except Exception as exc:  # noqa: BLE001
        log.warning("hybrid retrieval failed; falling back to FTS: %s", exc)
        resp = db.rpc(
            "match_mbie_clauses",
            {"p_code_clause": code_clause, "p_query": query, "p_limit": k},
        ).execute()
        rows = resp.data or []
    return _rows_to_hits(rows)


def _rows_to_hits(rows: list[dict[str, Any]]) -> list[ClauseHit]:
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


def hit_provenance(hits: list[ClauseHit]) -> list[dict[str, Any]]:
    """Compact, persistable record of which clauses a flag was checked
    against. Deterministic (no LLM): attached to every kept and dropped
    flag so an AS-compliant drop or an Alternative-Solution annotation can
    be audited back to the exact clauses that drove it."""
    return [
        {
            "document_id": h.document_id,
            "clause_number": h.clause_number,
            "heading": h.heading,
            "page": h.page,
            "source_url": h.source_url,
        }
        for h in hits
    ]


def _window_around_query(body: str, query: str | None, max_chars: int) -> str:
    """Trim ``body`` to ``max_chars``, keeping the part that matched.

    Head-truncation drops the tail — but FTS/dense can match a clause on a
    passage that lives past ``max_chars``, leaving the verifier a snippet
    that omits the very text that made the clause relevant. So when a query
    token is found deeper in the body, window around it instead."""
    if len(body) <= max_chars:
        return body

    pos = -1
    if query:
        tokens = sorted(
            {t.lower() for t in re.findall(r"[A-Za-z0-9]{4,}", query)},
            key=len,
            reverse=True,
        )
        low = body.lower()
        for tok in tokens:
            pos = low.find(tok)
            if pos != -1:
                break

    if pos <= max_chars - 1:  # match is in the head (or none found) → head-trim
        return body[: max_chars - 1].rstrip() + "…"

    # Centre the window on the match, clamped to the body bounds.
    start = max(0, pos - max_chars // 3)
    end = min(len(body), start + max_chars - 2)
    start = max(0, end - (max_chars - 2))  # re-expand if we hit the tail
    snippet = body[start:end].strip()
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(body) else ""
    return f"{prefix}{snippet}{suffix}"


def format_hits_for_prompt(
    hits: list[ClauseHit], *, query: str | None = None, max_chars: int = 800
) -> str:
    """Compact human/LLM-readable rendering for inclusion in the
    verifier prompt. Trims each clause body (query-aware) to keep total
    context bounded while preserving the passage that matched."""
    if not hits:
        return ""
    out: list[str] = []
    for h in hits:
        head = f"{h.document_id} §{h.clause_number or '?'}"
        if h.heading:
            head += f" — {h.heading}"
        body = _window_around_query(h.text, query, max_chars)
        out.append(f"- {head}\n  {body}")
    return "\n".join(out)
