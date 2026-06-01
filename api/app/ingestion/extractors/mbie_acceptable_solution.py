"""MBIE Acceptable Solution / Verification Method extractor.

Three-stage pipeline:

  1. Clause chunking — reuse ``app.ingestion.mbie.extract_clauses`` to split the
     PDF into structured clause chunks (clause_number, heading, text,
     page). That code already handles the heading regexes for MBIE's
     numeric-clause format.
  2. Trigger-phrase filter — a deterministic regex sweep over each
     clause to identify those that *might* describe a substitution.
     Drops ~80% of clauses cheaply so the LLM pass stays bounded.
  3. LLM cleanup — one cheap call per surviving clause; the LLM either
     emits structured ``KBCandidate`` rows or rejects the clause.

The LLM never sees the whole PDF. Each call sees one clause body, so
context is bounded and hallucination surface is small.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from app.ingestion.extractors.llm import call_cleanup
from app.ingestion.mbie import (
    extract_clauses_robust,
    has_substantial_text,
    page_texts_native,
    replace_clauses,
)
from app.ingestion.models import KBCandidate, VeIngestDocument

log = logging.getLogger(__name__)


# Broad phrases that indicate a clause might describe a substitution
# option, an acceptable equivalent, or an alternative pathway. Hit-rate
# tuning is empirical — start broad, narrow if false-positive LLM
# rejects get expensive.
_TRIGGER_PHRASES = [
    r"may be used",
    r"may also be used",
    r"acceptable\s+solution",
    r"alternative\s+solution",
    r"or\s+equivalent",
    r"in\s+lieu\s+of",
    r"unless\s+otherwise",
    r"as\s+a\s+minimum",
    r"at\s+least",
    r"acceptable\s+(?:materials?|products?|profiles?|finishes?)",
    r"any\s+of\s+the\s+following",
    r"the\s+following\s+are\s+acceptable",
    r"is\s+permitted",
    r"shall\s+be\s+(?:not\s+less\s+than|at\s+least)",
]
_TRIGGER_RE = re.compile("|".join(_TRIGGER_PHRASES), re.IGNORECASE)

# Cap how many clauses we run LLM cleanup on per document. Defensive
# upper bound for cost; tuned to be well above typical AS clause counts.
_MAX_LLM_CLAUSES_PER_DOC = 200

# Cap on body length sent to the LLM (chars). Keeps token usage bounded
# even for unusually long clauses with tables.
_MAX_PASSAGE_CHARS = 2200


@dataclass
class _ClauseRef:
    document_id: str
    clause_number: str
    heading: str
    page: int


def _document_id_from_source_key(source_key: str) -> str:
    """``mbie:e2_as1`` → ``E2/AS1``. Falls back to the raw key when the
    convention doesn't match — only used for human-readable
    code_references, never for joins."""
    if ":" not in source_key:
        return source_key
    _, tail = source_key.split(":", 1)
    parts = tail.upper().split("_")
    if len(parts) == 2:
        return f"{parts[0]}/{parts[1]}"
    return source_key


def _is_candidate(clause_text: str) -> bool:
    if not clause_text or len(clause_text) < 60:
        return False
    return bool(_TRIGGER_RE.search(clause_text))


def _build_kb_candidate(
    raw: dict[str, Any],
    *,
    doc: VeIngestDocument,
    ref: _ClauseRef,
) -> KBCandidate | None:
    try:
        category = raw["category"]
        patterns = raw["current_spec_patterns"]
        proposed = raw["proposed_alternative"]
        cost_impact = raw["cost_impact"]
        # confidence captured by the LLM but mapped to the codebase-wide
        # 'auto_extracted' bucket below; not needed as a local.
        rationale = raw["rationale"]
        clause_quote = raw["extracted_clause"]
    except KeyError as e:
        log.info("mbie: dropping LLM candidate missing %s", e)
        return None

    if not isinstance(patterns, list) or not patterns:
        return None

    code_refs = [
        {
            "document": ref.document_id,
            "clause": ref.clause_number,
            "heading": ref.heading,
            "page": str(ref.page),
        }
    ]

    return KBCandidate(
        category=str(category),
        subcategory=str(raw.get("subcategory") or "") or None,
        current_spec_patterns=[str(p) for p in patterns if p],
        proposed_alternative=str(proposed),
        applicability_conditions=raw.get("applicability_conditions"),
        code_references=code_refs,
        savings_band=str(cost_impact),
        savings_note=str(rationale),
        source=ref.document_id,
        source_url=doc.source_url,
        confidence="auto_extracted",
        bca_specific=None,  # MBIE rules are national
        extracted_clause=str(clause_quote)[:280],
        rationale=str(rationale),
    )


def _code_clause_from_document_id(document_id: str) -> str:
    """``E2/AS1`` → ``E2``. The verifier joins on this to find relevant
    Acceptable Solution clauses for a flag's category."""
    return document_id.split("/", 1)[0].upper() if "/" in document_id else document_id


def _persist_clauses_to_mbie_table(
    *,
    doc: VeIngestDocument,
    document_id: str,
    chunks: list,
) -> None:
    """Side-effect: also write the chunked clauses to ``mbie_clauses``
    for the verifier's RFI-grounding pass. Same source bytes feed both
    targets (VE substitution candidates *and* verifier compliance
    lookups), so we materialise both from one extraction pass.

    Failures here never break the VE extraction — the verifier just
    won't have this document's clauses to ground against.
    """
    try:
        # Local imports keep extractor module-level imports lean.
        from app.auth import get_service_db

        db = get_service_db()
        inserted = replace_clauses(
            db,
            document_id=document_id,
            code_clause=_code_clause_from_document_id(document_id),
            chunks=chunks,
            source_url=doc.source_url,
            ingest_document_id=doc.id or None,
        )
        log.info(
            "mbie: persisted %s clauses to mbie_clauses for %s",
            inserted,
            document_id,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(
            "mbie: failed to persist clauses to mbie_clauses for %s: %s",
            document_id,
            e,
        )


class MbieAcceptableSolutionExtractor:
    name = "mbie_acceptable_solution"
    version = "1.0.0"

    def extract(
        self, *, doc_bytes: bytes, doc: VeIngestDocument
    ) -> list[KBCandidate]:
        try:
            clauses, method = extract_clauses_robust(doc_bytes)
        except Exception as e:  # noqa: BLE001
            log.warning("mbie: clause extraction failed for %s: %s", doc.source_key, e)
            return []

        document_id = _document_id_from_source_key(doc.source_key)
        if method == "ocr":
            log.info("mbie: %s extracted via OCR fallback", document_id)

        # Zero-clause guard: a document with real body text that yields no
        # clauses is a parse failure (obfuscated font, layout we don't
        # handle). Log loudly and DON'T persist — an empty replace would
        # wipe any clauses a prior run got right. This is the check that
        # would have surfaced C/AS1 landing zero clauses instead of it
        # passing silently.
        if not clauses:
            try:
                substantial = has_substantial_text(page_texts_native(doc_bytes))
            except Exception:  # noqa: BLE001
                substantial = False
            if substantial:
                log.error(
                    "mbie: %s produced 0 clauses despite substantial text — "
                    "parse failure, skipping persist to preserve existing rows",
                    document_id,
                )
            else:
                log.warning("mbie: %s produced 0 clauses (no body text?)", document_id)
            return []

        # Side-effect: populate mbie_clauses for the verifier. Run first
        # so even if the VE LLM cleanup pass below times out or errors,
        # the verifier grounding corpus is still updated.
        _persist_clauses_to_mbie_table(
            doc=doc, document_id=document_id, chunks=clauses
        )

        candidates_total: list[KBCandidate] = []
        llm_calls = 0

        for chunk in clauses:
            if not _is_candidate(chunk.text):
                continue
            if llm_calls >= _MAX_LLM_CLAUSES_PER_DOC:
                log.warning(
                    "mbie: hit LLM-call cap for %s at %s candidates",
                    doc.source_key,
                    llm_calls,
                )
                break
            llm_calls += 1

            passage = chunk.text
            if len(passage) > _MAX_PASSAGE_CHARS:
                passage = passage[:_MAX_PASSAGE_CHARS] + "…"

            ref = _ClauseRef(
                document_id=document_id,
                clause_number=chunk.clause_number,
                heading=chunk.heading,
                page=chunk.page,
            )
            raw_candidates = call_cleanup(
                passage=passage,
                source_kind="mbie_acceptable_solution",
                source_label=document_id,
                clause_reference=f"§{chunk.clause_number} {chunk.heading}",
            )
            for raw in raw_candidates:
                kb = _build_kb_candidate(raw, doc=doc, ref=ref)
                if kb is not None:
                    candidates_total.append(kb)

        log.info(
            "mbie: %s — %s clauses, %s LLM calls, %s candidates",
            doc.source_key,
            len(clauses),
            llm_calls,
            len(candidates_total),
        )
        return candidates_total
