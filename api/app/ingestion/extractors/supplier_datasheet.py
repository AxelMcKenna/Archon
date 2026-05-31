"""Supplier technical datasheet extractor (vision-LLM-first).

Manufacturer datasheets vary wildly in layout (James Hardie ≠ Resene
≠ Carter Holt Harvey). Text-layer extraction with pdfplumber misses
critical specs hidden in tables, diagrams and footnotes. So we render
each page to PNG and let the vision LLM read the document as a human
would.

Each candidate output represents a *product equivalence claim*:
"this branded product can be substituted by these generic / cheaper
alternatives in [conditions]." The LLM is explicitly instructed not
to invent alternatives — only to flag when the datasheet itself
describes acceptable equivalents, alternative profiles, or
lower-spec variants.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import get_settings
from app.ingestion.extractors.llm import (
    SUBSTITUTION_TOOL_SCHEMA,
    prompt_version,
)
from app.ingestion.models import KBCandidate, VeIngestDocument
from app.ingestion.scraping.registry import get_kind
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool
from app.vision.core.renderer import caption_str, render_pages

log = logging.getLogger(__name__)

_MAX_PAGES_PER_DOC = 12  # supplier TDS PDFs are typically 1-6 pages

_VISION_PROMPT = """You are a senior New Zealand QS / experienced
residential builder reading a manufacturer's technical datasheet for a
construction product. Your job is to identify cost-reduction
substitution opportunities **that the datasheet itself describes** —
acceptable alternative products, lower-spec variants, or generic
equivalents the manufacturer acknowledges.

## Hard rules

- **Never invent.** If the datasheet does not list alternatives or
  equivalents, return an empty `candidates` array.
- **Quote the source.** `extracted_clause` must be a verbatim quote
  from the datasheet (≤ 200 chars).
- **Branded → branded or generic.** If the datasheet says "may be
  installed with any Type A approved fastener", that's a substitution
  opportunity (vs. specifying the branded fastener). If the datasheet
  is silent on alternatives, do not invent them.
- **`bca_specific` stays null.** Manufacturer TDS rules are national.

## Context

- Vendor: {vendor}
- Product: {product_label}
- Source: {source_url}

## Output

Return a JSON tool call to `record_substitution_candidates`. Empty
array when the datasheet describes no opportunity.
"""


def _vendor_for(source_key: str) -> str:
    try:
        kind = get_kind("supplier_datasheet")
    except KeyError:
        return ""
    for doc in kind.documents:
        if doc.source_key == source_key:
            value = doc.extra.get("vendor") if doc.extra else None
            return str(value) if value else ""
    return ""


def _product_label_for(source_key: str) -> str:
    try:
        kind = get_kind("supplier_datasheet")
    except KeyError:
        return source_key
    for doc in kind.documents:
        if doc.source_key == source_key:
            label = doc.extra.get("label") if doc.extra else None
            return str(label) if label else source_key
    return source_key


def _call_vision(
    *,
    images: list[bytes],
    captions: list[str],
    prompt: str,
) -> list[dict[str, Any]]:
    settings = get_settings()
    try:
        if settings.plan_analyser_provider == "openrouter":
            result = call_openrouter_tool(
                images=images,
                image_captions=captions,
                prompt=prompt,
                tool_name=SUBSTITUTION_TOOL_SCHEMA["name"],
                tool_description=SUBSTITUTION_TOOL_SCHEMA["description"],
                tool_parameters=SUBSTITUTION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=3000,
                model=settings.openrouter_model,
            )
            payload = result.payload
        else:
            result = call_gemini_tool(
                images=images,
                image_captions=captions,
                prompt=prompt,
                tool_name=SUBSTITUTION_TOOL_SCHEMA["name"],
                tool_description=SUBSTITUTION_TOOL_SCHEMA["description"],
                tool_parameters=SUBSTITUTION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=3000,
                model=settings.gemini_model,
            )
            payload = result.payload
    except Exception as e:  # noqa: BLE001
        log.warning("supplier vision call failed: %s", e)
        return []
    cands = payload.get("candidates")
    if not isinstance(cands, list):
        return []
    return [c for c in cands if isinstance(c, dict)]


def _build_kb_candidate(
    raw: dict[str, Any],
    *,
    doc: VeIngestDocument,
    vendor: str,
    product_label: str,
) -> KBCandidate | None:
    try:
        category = raw["category"]
        patterns = raw["current_spec_patterns"]
        proposed = raw["proposed_alternative"]
        cost_impact = raw["cost_impact"]
        rationale = raw["rationale"]
        clause_quote = raw["extracted_clause"]
    except KeyError as e:
        log.info("supplier: dropping LLM candidate missing %s", e)
        return None
    if not isinstance(patterns, list) or not patterns:
        return None

    return KBCandidate(
        category=str(category),
        subcategory=vendor or None,
        current_spec_patterns=[str(p) for p in patterns if p],
        proposed_alternative=str(proposed),
        applicability_conditions=raw.get("applicability_conditions"),
        code_references=[
            {
                "document": product_label,
                "vendor": vendor,
            }
        ],
        savings_band=str(cost_impact),
        savings_note=str(rationale),
        source=doc.source_key,
        source_url=doc.source_url,
        confidence="auto_extracted",
        bca_specific=None,
        extracted_clause=str(clause_quote)[:280],
        rationale=str(rationale),
    )


class SupplierDatasheetExtractor:
    name = "supplier_datasheet"
    version = "1.0.0"

    def __init__(self) -> None:
        # Touch prompt_version() to fail fast if the ve_extractor prompt
        # file is missing — supplier doesn't load it but ships with the
        # same prompt-versioning expectation.
        prompt_version()

    def extract(
        self, *, doc_bytes: bytes, doc: VeIngestDocument
    ) -> list[KBCandidate]:
        vendor = _vendor_for(doc.source_key)
        product_label = _product_label_for(doc.source_key)
        prompt = _VISION_PROMPT.format(
            vendor=vendor or "unknown",
            product_label=product_label,
            source_url=doc.source_url,
        )

        try:
            images, _dpi_breakdown, truncated = render_pages(
                doc_bytes, max_images=_MAX_PAGES_PER_DOC
            )
        except Exception as e:  # noqa: BLE001
            log.warning(
                "supplier: PDF render failed for %s: %s", doc.source_key, e
            )
            return []
        if not images:
            return []
        if truncated:
            log.info(
                "supplier: %s truncated to %s images", doc.source_key, _MAX_PAGES_PER_DOC
            )

        captions = [caption_str(img) for img in images]
        image_pngs = [img.png for img in images]

        raw_candidates = _call_vision(
            images=image_pngs,
            captions=captions,
            prompt=prompt,
        )
        candidates: list[KBCandidate] = []
        for raw in raw_candidates:
            kb = _build_kb_candidate(
                raw, doc=doc, vendor=vendor, product_label=product_label
            )
            if kb is not None:
                candidates.append(kb)

        log.info(
            "supplier: %s — %s images, %s candidates",
            doc.source_key,
            len(images),
            len(candidates),
        )
        return candidates
