"""Council guidance PDF extractor (CCC / SDC / WDC).

Council guidance wiki are shorter and less structured than MBIE
Acceptable Solutions — typically a few dozen pages of free prose with
sectional headings rather than the numeric-clause hierarchy MBIE uses.

Strategy:
  1. Whole-document text extraction with pdfplumber (no clause regex —
     council headings don't share a consistent format across the three
     councils).
  2. Page-by-page splitting so we don't ask the LLM to read 40 pages
     at once. Each page becomes one "passage" sent to the cleanup pass.
  3. Trigger-phrase filter, identical to the MBIE extractor — drops
     pages that look purely informational.
  4. LLM cleanup per surviving page.

Each KBCandidate is tagged with ``bca_specific`` from the source
registry entry's ``bca`` field so VE retrieval can filter to the
relevant council.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from typing import Any

import pdfplumber

from app.ingestion.extractors.llm import call_cleanup
from app.ingestion.extractors.mbie_acceptable_solution import _TRIGGER_RE
from app.ingestion.models import KBCandidate, VeIngestDocument
from app.ingestion.scraping.registry import get_kind

log = logging.getLogger(__name__)

_MAX_LLM_PAGES_PER_DOC = 80
_MAX_PASSAGE_CHARS = 2500


@dataclass
class _PageRef:
    page: int
    source_label: str
    bca: str | None


def _bca_for_source(source_key: str) -> str | None:
    """Walk the council registry to find which BCA owns this source_key.
    Empty/unknown returns None (recorded as a national rule).
    """
    try:
        kind = get_kind("council_guidance")
    except KeyError:
        return None
    for doc in kind.documents:
        if doc.source_key == source_key:
            value = doc.extra.get("bca") if doc.extra else None
            return str(value) if value else None
    return None


def _source_label_for(source_key: str) -> str:
    try:
        kind = get_kind("council_guidance")
    except KeyError:
        return source_key
    for doc in kind.documents:
        if doc.source_key == source_key:
            label = doc.extra.get("label") if doc.extra else None
            return str(label) if label else source_key
    return source_key


def _is_candidate_page(text: str) -> bool:
    if not text or len(text) < 80:
        return False
    return bool(_TRIGGER_RE.search(text))


def _build_kb_candidate(
    raw: dict[str, Any],
    *,
    doc: VeIngestDocument,
    page_ref: _PageRef,
) -> KBCandidate | None:
    try:
        category = raw["category"]
        patterns = raw["current_spec_patterns"]
        proposed = raw["proposed_alternative"]
        cost_impact = raw["cost_impact"]
        # confidence field is captured by the LLM but rolled into the
        # codebase-wide 'auto_extracted' bucket so curated entries stay
        # distinguishable from machine-extracted ones.
        rationale = raw["rationale"]
        clause_quote = raw["extracted_clause"]
    except KeyError as e:
        log.info("council: dropping LLM candidate missing %s", e)
        return None
    if not isinstance(patterns, list) or not patterns:
        return None

    return KBCandidate(
        category=str(category),
        subcategory=str(raw.get("subcategory") or "") or None,
        current_spec_patterns=[str(p) for p in patterns if p],
        proposed_alternative=str(proposed),
        applicability_conditions=raw.get("applicability_conditions"),
        code_references=[
            {
                "document": page_ref.source_label,
                "page": str(page_ref.page),
            }
        ],
        savings_band=str(cost_impact),
        savings_note=str(rationale),
        source=doc.source_key,
        source_url=doc.source_url,
        confidence="auto_extracted",
        bca_specific=[page_ref.bca] if page_ref.bca else None,
        extracted_clause=str(clause_quote)[:280],
        rationale=str(rationale),
    )


class CouncilGuidanceExtractor:
    name = "council_guidance"
    version = "1.0.0"

    def extract(
        self, *, doc_bytes: bytes, doc: VeIngestDocument
    ) -> list[KBCandidate]:
        bca = _bca_for_source(doc.source_key)
        source_label = _source_label_for(doc.source_key)
        candidates: list[KBCandidate] = []
        llm_calls = 0

        try:
            with pdfplumber.open(io.BytesIO(doc_bytes)) as pdf:
                pages = list(pdf.pages)
                for page in pages:
                    if llm_calls >= _MAX_LLM_PAGES_PER_DOC:
                        log.warning(
                            "council: hit LLM-call cap for %s at %s pages",
                            doc.source_key,
                            llm_calls,
                        )
                        break
                    text = page.extract_text() or ""
                    # Collapse soft-wraps so trigger detection isn't fooled
                    # by line breaks mid-phrase.
                    text = re.sub(r"\s+", " ", text).strip()
                    if not _is_candidate_page(text):
                        continue
                    llm_calls += 1

                    passage = text
                    if len(passage) > _MAX_PASSAGE_CHARS:
                        passage = passage[:_MAX_PASSAGE_CHARS] + "…"

                    page_ref = _PageRef(
                        page=page.page_number,
                        source_label=source_label,
                        bca=bca,
                    )
                    raw_candidates = call_cleanup(
                        passage=passage,
                        source_kind="council_guidance",
                        source_label=source_label,
                        clause_reference=f"page {page.page_number}",
                    )
                    for raw in raw_candidates:
                        kb = _build_kb_candidate(raw, doc=doc, page_ref=page_ref)
                        if kb is not None:
                            candidates.append(kb)
        except Exception as e:  # noqa: BLE001
            log.warning(
                "council: PDF parse failed for %s: %s", doc.source_key, e
            )
            return []

        log.info(
            "council: %s — %s LLM calls, %s candidates",
            doc.source_key,
            llm_calls,
            len(candidates),
        )
        return candidates
