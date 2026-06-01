"""Native-first clause extraction with an OCR fallback.

The 23 well-behaved MBIE documents parse straight from their text layer
(free, lossless). A few (e.g. C/AS1) ship a subsetted font that hides
digits in the Unicode private-use area, so the native text yields zero
clauses. This module detects that case and re-runs extraction over OCR'd
page text — and exposes a ``has_substantial_text`` check so callers can
fail loudly when a document with real content still produces no clauses
(the silent-zero-clause bug that let fire AS1 slip through unnoticed).
"""

from __future__ import annotations

import logging

from app.ingestion.mbie.chunker import (
    ClauseChunk,
    chunk_page_texts,
    page_texts_native,
)
from app.ingestion.mbie.glyph_remap import derive_pua_digit_map, remap_page_texts
from app.ingestion.mbie.ocr import ocr_available, page_texts_ocr

log = logging.getLogger(__name__)

# Fraction of characters in the Unicode private-use area (U+E000–U+F8FF)
# above which the native text layer is treated as glyph-obfuscated. Clean
# MBIE PDFs sit at ~0; the C/AS1 obfuscated font sits around 0.035.
_PUA_RATIO_THRESHOLD = 0.005
# A document with at least this much extractable text but zero clauses is
# either obfuscated or genuinely broken — worth an OCR attempt and, if that
# also fails, a loud warning rather than a silent empty corpus entry.
_MIN_TEXT_FOR_GUARD = 1500


def _pua_ratio(page_texts: list[str]) -> float:
    total = 0
    pua = 0
    for t in page_texts:
        for ch in t:
            total += 1
            if 0xE000 <= ord(ch) <= 0xF8FF:
                pua += 1
    return (pua / total) if total else 0.0


def has_substantial_text(page_texts: list[str]) -> bool:
    """True when the PDF clearly contains body text (so 0 clauses is a
    real failure, not just an empty/cover-only document)."""
    return sum(len(t) for t in page_texts) >= _MIN_TEXT_FOR_GUARD


def text_looks_unreliable(page_texts: list[str]) -> bool:
    """Heuristic: is the native text layer too garbled to chunk?

    Fires on private-use-area obfuscation (the C/AS1 font). The
    substantial-text-but-zero-clauses case is handled in
    ``extract_clauses_robust`` because it needs the chunk result.
    """
    return _pua_ratio(page_texts) > _PUA_RATIO_THRESHOLD


def extract_clauses_robust(
    pdf_bytes: bytes,
    *,
    min_body_chars: int = 40,
) -> tuple[list[ClauseChunk], str]:
    """Extract clauses, OCR-falling-back when the native layer is bad.

    Returns ``(chunks, method)`` where method is ``"native"``,
    ``"glyph_remap"`` or ``"ocr"``. When the native layer is unreliable we
    try, in order: a lossless private-use-glyph→digit remap (preserves the
    correct text/spacing — best for the C/AS1 obfuscated-font case), then
    full-page OCR. A fallback result is kept only if it yields more clauses
    than the native pass, so it can never make a good native result worse.
    """
    native_texts = page_texts_native(pdf_bytes)
    native_chunks = chunk_page_texts(native_texts, min_body_chars=min_body_chars)

    pua_obfuscated = text_looks_unreliable(native_texts)
    need_fallback = pua_obfuscated or (
        has_substantial_text(native_texts) and not native_chunks
    )
    if not need_fallback:
        return native_chunks, "native"

    # 1) Glyph remap — lossless, only meaningful for private-use obfuscation.
    if pua_obfuscated:
        pua_map = derive_pua_digit_map(pdf_bytes)
        if pua_map:
            remapped = remap_page_texts(native_texts, pua_map)
            remap_chunks = chunk_page_texts(remapped, min_body_chars=min_body_chars)
            if len(remap_chunks) > len(native_chunks):
                log.info(
                    "mbie: glyph-remap recovered %d clauses (native %d); map=%s",
                    len(remap_chunks), len(native_chunks),
                    {hex(k): v for k, v in sorted(pua_map.items())},
                )
                return remap_chunks, "glyph_remap"

    # 2) Full-page OCR — robust but lossy (spacing), so it's the last resort.
    if not ocr_available():
        log.warning(
            "mbie: native text unreliable (pua=%.3f, native_clauses=%d) but OCR "
            "unavailable — keeping native result",
            _pua_ratio(native_texts),
            len(native_chunks),
        )
        return native_chunks, "native"

    log.info(
        "mbie: native text unreliable (pua=%.3f, native_clauses=%d); trying OCR",
        _pua_ratio(native_texts),
        len(native_chunks),
    )
    ocr_texts = page_texts_ocr(pdf_bytes)
    if not ocr_texts:
        return native_chunks, "native"
    ocr_chunks = chunk_page_texts(ocr_texts, min_body_chars=min_body_chars)
    if len(ocr_chunks) > len(native_chunks):
        log.info("mbie: OCR recovered %d clauses (native had %d)",
                 len(ocr_chunks), len(native_chunks))
        return ocr_chunks, "ocr"
    return native_chunks, "native"
