"""Dense text embeddings via OpenRouter's OpenAI-compatible endpoint.

Used to ground RFI flags: clause bodies are embedded at ingest and the
per-flag query at verify time, then hybrid-ranked (dense cosine + Postgres
FTS) in the ``match_mbie_clauses_hybrid`` RPC.

OpenRouter speaks the OpenAI `/embeddings` schema, so this reuses the same
key/retry path as ``app.llm.openrouter`` — no model runs locally. Returns
plain ``list[float]`` vectors (dense only; the sparse half of the hybrid is
Postgres ts_rank, not an embedding).
"""

from __future__ import annotations

import httpx

from app.config import get_settings
from app.llm.retry import TransientLLMError, call_with_retries

_OR_BASE_URL = "https://openrouter.ai/api/v1"
# OpenAI-compatible embeddings accept large input arrays; keep batches modest
# so a single failure re-tries cheaply and we stay under request-size limits.
_BATCH = 128
# text-embedding-3-small caps at 8192 tokens; a single over-limit input makes
# the *whole batch* return empty. A token is always >=1 character, so capping
# at 8000 chars provably keeps every input under 8192 tokens regardless of
# tokenization. A few MBIE clauses run to ~90k chars; truncation is fine for
# retrieval — the clause head carries the signal (avg clause is ~860 chars).
_MAX_INPUT_CHARS = 8000


def embed_texts(texts: list[str], *, model: str | None = None) -> list[list[float]]:
    """Embed a list of texts, returning one vector per input (input order).

    Raises on failure (callers decide whether to degrade) — at verify time
    the retriever falls back to FTS-only so embedding outages never break
    verification.
    """
    if not texts:
        return []
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    model_id = model or settings.openrouter_embedding_model

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_referer or "https://arro.local",
        "X-Title": "ARRO",
    }

    out: list[list[float]] = []
    for start in range(0, len(texts), _BATCH):
        # Truncate per-input (empty -> single space; the API rejects "").
        batch = [(t[:_MAX_INPUT_CHARS] or " ") for t in texts[start : start + _BATCH]]
        body = {"model": model_id, "input": batch}

        def _once(b: dict = body) -> list[list[float]]:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(
                    f"{_OR_BASE_URL}/embeddings", headers=headers, json=b
                )
            if resp.status_code >= 400:
                err = (
                    TransientLLMError
                    if resp.status_code in {408, 409, 425, 429}
                    or resp.status_code >= 500
                    else RuntimeError
                )
                raise err(
                    f"OpenRouter embeddings failed ({resp.status_code}): "
                    f"{resp.text[:300]}"
                )
            data = resp.json().get("data") or []
            # Align to input order — the API tags each row with its index.
            rows = sorted(data, key=lambda d: d.get("index", 0))
            vecs = [list(map(float, r.get("embedding") or [])) for r in rows]
            if len(vecs) != len(b["input"]) or any(not v for v in vecs):
                raise TransientLLMError(
                    f"OpenRouter embeddings returned {len(vecs)} vecs for "
                    f"{len(b['input'])} inputs"
                )
            return vecs

        out.extend(
            call_with_retries(
                _once, label=f"openrouter-embed:{model_id}",
                max_attempts=settings.llm_max_attempts,
            )
        )
    return out


def embed_query(text: str, *, model: str | None = None) -> list[float]:
    """Embed a single query string."""
    vecs = embed_texts([text], model=model)
    return vecs[0] if vecs else []
