"""OCR fallback for MBIE PDFs whose native text layer is unusable.

Some MBIE documents (e.g. C/AS1) ship with a subsetted font that maps
digits — and therefore every clause number — into the Unicode
private-use area, so ``pdfplumber`` returns gibberish like ``C``
instead of ``C1``. The clause chunker then matches no headings and the
document lands zero clauses.

This module renders each page to an image (PyMuPDF, same path as
``app.plans.ocr_refiner``) and runs RapidOCR, then reconstructs
reading-order line text so the existing ``chunk_page_texts`` logic works
unchanged. It is the slow path — only invoked when the detector in
``app.ingestion.mbie.extract`` judges the native text unreliable.

Returns ``None`` (not an exception) when RapidOCR isn't installed, so the
caller falls back to whatever the native layer gave it.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import fitz  # PyMuPDF — already in deps via app.plans.bbox_refiner
import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

_OCR_DPI = 300
# Two text regions belong to the same visual line when their vertical
# centres sit within this fraction of the page height of each other.
_LINE_TOL_FRAC = 0.012


@lru_cache(maxsize=1)
def _get_ocr() -> Any | None:
    """Lazy-init RapidOCR, cached for the process. None if unavailable."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as e:  # pragma: no cover - depends on optional wheel
        log.warning("rapidocr_onnxruntime not available; OCR fallback off: %s", e)
        return None
    return RapidOCR()


def ocr_available() -> bool:
    return _get_ocr() is not None


def _render_page(pdf_bytes: bytes, page_index: int) -> np.ndarray:
    """Render one page (0-based) at OCR DPI as an HxWx3 RGB array."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        zoom = _OCR_DPI / 72.0
        pix = doc[page_index].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        return np.array(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    finally:
        doc.close()


def _regions_to_text(regions: list[Any], page_height: float) -> str:
    """Reconstruct reading-order line text from RapidOCR regions.

    Each region is ``[box, text, score]`` where ``box`` is four [x, y]
    points. We group regions into visual lines by vertical proximity, then
    order each line left-to-right — yielding text shaped like the page,
    which is what the clause-heading regex expects (clause number + title
    alone on a line).
    """
    items = []
    for r in regions or []:
        box, text = r[0], (r[1] or "").strip()
        if not text:
            continue
        ys = [pt[1] for pt in box]
        xs = [pt[0] for pt in box]
        items.append((sum(ys) / len(ys), min(xs), text))
    if not items:
        return ""
    items.sort(key=lambda t: (t[0], t[1]))

    tol = max(1.0, page_height * _LINE_TOL_FRAC)
    lines: list[list[tuple[float, float, str]]] = []
    for item in items:
        if lines and abs(item[0] - lines[-1][0][0]) <= tol:
            lines[-1].append(item)
        else:
            lines.append([item])

    out: list[str] = []
    for line in lines:
        line.sort(key=lambda t: t[1])
        out.append(" ".join(t[2] for t in line))
    return "\n".join(out)


def page_texts_ocr(pdf_bytes: bytes) -> list[str] | None:
    """Per-page OCR text, or None if RapidOCR isn't available."""
    ocr = _get_ocr()
    if ocr is None:
        return None

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        n_pages = len(doc)
    finally:
        doc.close()

    texts: list[str] = []
    for i in range(n_pages):
        try:
            arr = _render_page(pdf_bytes, i)
            result, _ = ocr(arr)
            texts.append(_regions_to_text(result, page_height=arr.shape[0]))
        except Exception as e:  # noqa: BLE001 - one bad page shouldn't sink the doc
            log.warning("mbie OCR: page %s failed: %s", i + 1, e)
            texts.append("")
    return texts
