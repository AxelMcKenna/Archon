"""Snap flag bboxes to the PDF text layer using verbatim quotes.

Native PDFs carry exact pixel positions for every character. Where a flag's
``verbatim_quote`` appears on the cited page, we replace the model's coarse
bbox with the pixel-perfect rect of the matched text — ``bbox_source``
becomes ``"text_layer"``.

Word extraction goes through PyMuPDF (``fitz``) which is more forgiving of
custom-subset fonts and unusual encodings than pdfplumber, recovering text
in cases pdfplumber would silently miss.

Falls back to the model's bbox when:
- The plan is not a PDF (no text layer)
- The quote is too short or unset
- The quote can't be matched above the confidence threshold
"""

from __future__ import annotations

import logging
import re
from typing import Any

import Levenshtein
import fitz  # PyMuPDF

log = logging.getLogger(__name__)

# Match acceptance threshold. Below this, we leave the model's bbox alone —
# a wrong snap is worse than a coarse but correct one.
_MIN_RATIO = 0.85
# Quotes shorter than this are too ambiguous (e.g. "Tap" appears 3× per plan).
_MIN_QUOTE_LEN = 5
# Pad the snapped bbox slightly so the overlay rectangle frames the text
# rather than clipping its baseline/ascenders.
_BBOX_PAD = 0.005


def _normalise(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())


# A "word" tuple from ``fitz.Page.get_text("words")`` is:
#   (x0, y0, x1, y1, text, block_no, line_no, word_no)
# Origin is top-left, units are PDF points — same convention as our
# normalised page coords (we just divide by page width/height).
_FitzWord = tuple[float, float, float, float, str, int, int, int]


def _word_text(words: list[_FitzWord], start: int, end: int) -> str:
    return " ".join(words[i][4] for i in range(start, end))


def _bbox_from_words(
    words: list[_FitzWord],
    start: int,
    end: int,
    page_w: float,
    page_h: float,
) -> tuple[float, float, float, float]:
    span = words[start:end]
    xs0 = min(w[0] for w in span)
    ys0 = min(w[1] for w in span)
    xs1 = max(w[2] for w in span)
    ys1 = max(w[3] for w in span)
    return (
        max(0.0, xs0 / page_w - _BBOX_PAD),
        max(0.0, ys0 / page_h - _BBOX_PAD),
        min(1.0, xs1 / page_w + _BBOX_PAD),
        min(1.0, ys1 / page_h + _BBOX_PAD),
    )


def _best_match(
    words: list[_FitzWord],
    quote: str,
    page_w: float,
    page_h: float,
    hint_bbox: tuple[float, float, float, float] | None,
) -> tuple[float, int, int]:
    """Sliding-window search; returns (best_ratio, start_idx, end_idx_exclusive).

    When the same quote matches multiple windows above the threshold, we
    pick the one closest to ``hint_bbox`` (typically the model's original
    bbox) — this disambiguates duplicate phrases like "Ground Floor Plan"
    appearing in both the title block and a sheet caption.
    """
    if not words:
        return (0.0, 0, 0)
    target = _normalise(quote)
    target_words = max(1, len(target.split()))
    max_window = min(len(words), max(target_words * 2, 4))

    if hint_bbox:
        hx0, hy0, hx1, hy1 = hint_bbox
        hint_cx = (hx0 + hx1) / 2.0
        hint_cy = (hy0 + hy1) / 2.0
    else:
        hint_cx = hint_cy = None  # type: ignore[assignment]

    candidates: list[tuple[float, float, int, int]] = []
    for window in range(1, max_window + 1):
        for start in range(0, len(words) - window + 1):
            end = start + window
            candidate = _normalise(_word_text(words, start, end))
            ratio = Levenshtein.ratio(candidate, target)
            if ratio < _MIN_RATIO:
                continue
            if hint_cx is None:
                dist = 0.0
            else:
                span = words[start:end]
                cx = (
                    (min(w[0] for w in span) + max(w[2] for w in span))
                    / 2.0
                    / page_w
                )
                cy = (
                    (min(w[1] for w in span) + max(w[3] for w in span))
                    / 2.0
                    / page_h
                )
                dist = ((cx - hint_cx) ** 2 + (cy - hint_cy) ** 2) ** 0.5
            candidates.append((ratio, dist, start, end))

    if not candidates:
        return (0.0, 0, 0)
    candidates.sort(key=lambda c: (-c[0], c[1]))
    ratio, _dist, start, end = candidates[0]
    return (ratio, start, end)


def refine_flag_bboxes(
    *,
    file_bytes: bytes,
    media_type: str,
    flags: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Snap each flag's bbox to the PDF text layer where the quote matches.

    No-op for non-PDF uploads or flags without a usable quote.
    """
    if media_type != "application/pdf" or not flags:
        return flags

    page_words: dict[int, list[_FitzWord]] = {}
    page_dims: dict[int, tuple[float, float]] = {}

    out: list[dict[str, Any]] = []
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        for f in flags:
            quote = (f.get("verbatim_quote") or "").strip()
            try:
                page = int(f.get("page") or 0)
            except (TypeError, ValueError):
                page = 0
            if not quote or len(quote) < _MIN_QUOTE_LEN or page < 1:
                out.append(f)
                continue
            if page > len(doc):
                out.append(f)
                continue

            if page not in page_words:
                p = doc[page - 1]
                page_words[page] = list(p.get_text("words"))
                page_dims[page] = (float(p.rect.width), float(p.rect.height))

            page_w, page_h = page_dims[page]
            hint = f.get("bbox")
            hint_tuple: tuple[float, float, float, float] | None = None
            if isinstance(hint, (list, tuple)) and len(hint) == 4:
                try:
                    hint_tuple = tuple(float(v) for v in hint)  # type: ignore[assignment]
                except (TypeError, ValueError):
                    hint_tuple = None

            ratio, start, end = _best_match(
                page_words[page], quote, page_w, page_h, hint_tuple
            )
            if end <= start or ratio < _MIN_RATIO:
                out.append(f)
                continue

            bbox = _bbox_from_words(
                page_words[page], start, end, page_w, page_h
            )
            out.append(
                {
                    **f,
                    "bbox": list(bbox),
                    "bbox_source": "text_layer",
                    "bbox_match_ratio": round(ratio, 3),
                }
            )
    finally:
        doc.close()
    return out
