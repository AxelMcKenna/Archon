"""OCR-based bbox refinement (Phase G).

When a flag's ``verbatim_quote`` doesn't appear in the PDF text layer
(common when CAD tools convert drawing labels into vector paths), we
render the page and run RapidOCR — same model weights as PaddleOCR's
PP-OCRv4, packaged for ONNX Runtime so it works on any platform.

Fuzzy-matches the quote against OCR'd text regions and snaps the bbox
to the matched region's bounding rect. Sets ``bbox_source = "ocr"``.

Graceful fallback if RapidOCR is unavailable or disabled — leaves the
flag's existing bbox untouched.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Any

import fitz  # PyMuPDF — already in deps for app.plans.bbox_refiner
import Levenshtein
import numpy as np
from PIL import Image

from app.config import get_settings

log = logging.getLogger(__name__)

_MIN_RATIO = 0.82  # slightly looser than text-layer; OCR has small noise
_MIN_QUOTE_LEN = 5
_BBOX_PAD = 0.005
_OCR_DPI = 300


@lru_cache(maxsize=1)
def _get_ocr() -> Any | None:
    """Lazy-init the RapidOCR engine, cached for the process lifetime.

    Returns None if RapidOCR isn't installed (e.g. local dev where the
    wheel isn't available); callers should treat that as "OCR disabled".
    """
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as e:
        log.warning("rapidocr_onnxruntime not available: %s", e)
        return None
    return RapidOCR()


def _normalise(s: str) -> str:
    """Normalise for cross-source comparison.

    Beyond whitespace+case, also fold unicode multiplication signs to
    ASCII 'x'. Technical drawings frequently use ``×`` (U+00D7) in
    dimension strings, which OCR preserves but the model quotes as 'x'
    — a single-char delta that tanks Levenshtein ratios.
    """
    s = (s or "").lower()
    s = s.replace("×", "x").replace("✕", "x").replace("✖", "x")
    return re.sub(r"\s+", " ", s).strip()


def _render_page_array(file_bytes: bytes, page_number: int) -> np.ndarray:
    """Render a PDF page at OCR-friendly DPI as an HxWx3 RGB array."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        if page_number < 1 or page_number > len(doc):
            raise ValueError(f"page {page_number} out of range")
        zoom = _OCR_DPI / 72.0
        pix = doc[page_number - 1].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return np.array(img)
    finally:
        doc.close()


def _bbox_of_polygon_span(
    polygons: list[list[list[float]]], img_w: int, img_h: int
) -> tuple[float, float, float, float]:
    """Axis-aligned bounding rect across one or more 4-point polygons,
    normalised to 0–1 page coords with a small pad."""
    pts = [pt for poly in polygons for pt in poly]
    x0 = min(p[0] for p in pts)
    y0 = min(p[1] for p in pts)
    x1 = max(p[0] for p in pts)
    y1 = max(p[1] for p in pts)
    return (
        max(0.0, x0 / img_w - _BBOX_PAD),
        max(0.0, y0 / img_h - _BBOX_PAD),
        min(1.0, x1 / img_w + _BBOX_PAD),
        min(1.0, y1 / img_h + _BBOX_PAD),
    )


def _best_ocr_match(
    regions: list[Any],
    quote: str,
    img_w: int,
    img_h: int,
    hint_bbox: tuple[float, float, float, float] | None,
) -> tuple[float, tuple[float, float, float, float] | None]:
    """Sliding-window concat of adjacent OCR regions to handle multi-word
    quotes that RapidOCR splits into separate detections (e.g. "Garage" +
    "6,000 x 6,000"). Tie-breaks by proximity to the model's hint bbox.
    """
    if not regions:
        return (0.0, None)
    target = _normalise(quote)
    target_words = max(1, len(target.split()))
    max_window = min(len(regions), max(target_words * 2, 4))

    if hint_bbox:
        hx0, hy0, hx1, hy1 = hint_bbox
        hint_cx = (hx0 + hx1) / 2.0
        hint_cy = (hy0 + hy1) / 2.0
    else:
        hint_cx = hint_cy = None  # type: ignore[assignment]

    candidates: list[tuple[float, float, tuple[float, float, float, float]]] = []
    for window in range(1, max_window + 1):
        for start in range(0, len(regions) - window + 1):
            span = regions[start : start + window]
            text = " ".join(r[1] for r in span)
            ratio = Levenshtein.ratio(_normalise(text), target)
            if ratio < _MIN_RATIO:
                continue
            polygons = [r[0] for r in span]
            bbox = _bbox_of_polygon_span(polygons, img_w, img_h)
            if hint_cx is None:
                dist = 0.0
            else:
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                dist = ((cx - hint_cx) ** 2 + (cy - hint_cy) ** 2) ** 0.5
            candidates.append((ratio, dist, bbox))

    if not candidates:
        return (0.0, None)
    candidates.sort(key=lambda c: (-c[0], c[1]))
    ratio, _dist, bbox = candidates[0]
    return (ratio, bbox)


def refine_via_ocr(
    *,
    file_bytes: bytes,
    media_type: str,
    flags: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Run OCR on the rendered page and snap bboxes for flags whose
    quotes the text layer couldn't find.

    No-op when:
    - The settings flag is off
    - Upload is not a PDF
    - RapidOCR isn't available on this platform
    - All flags were already refined to text_layer
    """
    settings = get_settings()
    if not settings.plan_ocr_refiner_enabled:
        return flags
    if media_type != "application/pdf" or not flags:
        return flags

    # Only refine flags that didn't already snap via text_layer.
    pending_indices = [
        i
        for i, f in enumerate(flags)
        if f.get("bbox_source") != "text_layer"
        and len((f.get("verbatim_quote") or "").strip()) >= _MIN_QUOTE_LEN
    ]
    if not pending_indices:
        return flags

    ocr = _get_ocr()
    if ocr is None:
        return flags

    # Group pending flags by page so we OCR each unique page only once.
    by_page: dict[int, list[int]] = {}
    for i in pending_indices:
        try:
            page = int(flags[i].get("page") or 0)
        except (TypeError, ValueError):
            continue
        if page < 1:
            continue
        by_page.setdefault(page, []).append(i)

    out = list(flags)
    for page, idxs in by_page.items():
        try:
            arr = _render_page_array(file_bytes, page)
        except Exception as exc:  # noqa: BLE001
            log.warning("OCR refine: render failed for page %d: %s", page, exc)
            continue

        try:
            result, _elapse = ocr(arr)
        except Exception as exc:  # noqa: BLE001
            log.warning("OCR refine: rapidocr failed for page %d: %s", page, exc)
            continue

        regions = result or []
        if not regions:
            continue
        img_h, img_w = arr.shape[:2]

        for i in idxs:
            f = out[i]
            quote = f.get("verbatim_quote", "")
            hint = f.get("bbox")
            hint_tuple: tuple[float, float, float, float] | None = None
            if isinstance(hint, (list, tuple)) and len(hint) == 4:
                try:
                    hint_tuple = tuple(float(v) for v in hint)  # type: ignore[assignment]
                except (TypeError, ValueError):
                    hint_tuple = None

            ratio, bbox = _best_ocr_match(regions, quote, img_w, img_h, hint_tuple)

            # Fallback: when the full quote doesn't match (often because
            # OCR splits the room label from its dimension into non-adjacent
            # regions, e.g. "Garage" and "6,000×6,000"), retry with just
            # the head word — typically the room name, which OCR catches
            # cleanly. Slightly stricter ratio since head matches are
            # short and more prone to false positives.
            if (bbox is None or ratio < _MIN_RATIO) and quote:
                parts = quote.strip().split()
                if len(parts) >= 2 and len(parts[0]) >= _MIN_QUOTE_LEN:
                    head_ratio, head_bbox = _best_ocr_match(
                        regions, parts[0], img_w, img_h, hint_tuple
                    )
                    if head_bbox is not None and head_ratio >= 0.90:
                        ratio, bbox = head_ratio, head_bbox

            if bbox is None or ratio < _MIN_RATIO:
                continue
            out[i] = {
                **f,
                "bbox": list(bbox),
                "bbox_source": "ocr",
                "bbox_match_ratio": round(ratio, 3),
            }
    return out
