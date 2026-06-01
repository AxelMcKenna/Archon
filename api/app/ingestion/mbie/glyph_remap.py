"""Recover digits from MBIE PDFs that hide them in the private-use area.

Some MBIE fire documents (C/AS1) embed a subsetted font whose ToUnicode
CMap maps every digit glyph into the Unicode private-use area (U+E5xx).
The text layer is otherwise perfect — words, spacing, headings are all
intact — so OCR-ing the whole page (which mangles spacing) is a poor fix.
Instead we recover just the digit map and translate the native text,
which is lossless.

Derivation merges two complementary, self-validating signals:

  * **Clause-number alignment** — clause numbers are the one place a run
    of digits sits alone, so we OCR each clause-number line image and
    align it positionally to the native PUA prefix (``.. Heading`` ↔
    ``1.1.2 Heading``). OCR reads digits reliably *in a run* (a lone "1"
    or "7" often reads as nothing), so this is strong for the digits that
    appear in clause numbers (0–5, 7) but weak for rare ones (6, 8, 9).
  * **Per-glyph crops** — render and OCR a few isolated occurrences of
    each glyph. Reliable for visually-distinct digits (6, 8, 9) and weak
    for thin ones (1, 7) — exactly the gaps the alignment leaves.

Votes are pooled. We accept the map only if (a) it is a clean bijection
and (b) applying it leaves essentially no private-use glyphs behind — an
incomplete map would silently keep garbled digits, so that guard is what
makes this safe for a legal document. Otherwise the caller falls back to
full-page OCR.
"""

from __future__ import annotations

import collections
import io
import logging
import re

import fitz
import numpy as np
import pdfplumber
from PIL import Image

from app.ingestion.mbie.chunker import page_texts_native
from app.ingestion.mbie.ocr import _get_ocr, ocr_available

log = logging.getLogger(__name__)

_PUA_LO, _PUA_HI = 0xE000, 0xF8FF
_LINE_TOL = 1.5          # points; chars within this top-delta share a line
_CLIP_ZOOM = 4.0         # render zoom for a single line crop
_GLYPH_ZOOM = 6.0        # higher zoom for an isolated single-glyph crop
_MAX_ANCHOR_LINES = 120  # cap OCR work; clause numbers are plentiful
_MAX_GLYPH_SAMPLES = 6   # crop-OCR occurrences per codepoint
_MIN_VOTES = 2           # per-codepoint votes needed to trust a digit
# After remap, at most this fraction of chars may remain private-use (a
# few stray non-digit PUA glyphs are fine; unmapped *digits* are not).
_MAX_RESIDUAL_PUA = 0.0005
# Only PUA codepoints appearing at least this often are treated as digit
# glyphs worth resolving (filters rare ligature/symbol glyphs).
_MIN_GLYPH_FREQ = 5

# A native clause-number prefix: private-use glyphs and dots, e.g. "..".
_NATIVE_NUM = re.compile(rf"^[\u{_PUA_LO:04x}-\u{_PUA_HI:04x}.]+")
_OCR_NUM = re.compile(r"^[0-9.]+")


def _is_pua(ch: str) -> bool:
    return _PUA_LO <= ord(ch) <= _PUA_HI


_Box = tuple[float, float, float, float]
_LineRec = tuple[int, _Box, str]
_OccMap = dict[int, list[tuple[int, _Box]]]


def _scan(pdf_bytes: bytes) -> tuple[list[_LineRec], _OccMap]:
    """One pdfplumber pass returning both signals' raw inputs:

    - visual lines ``(page_index, bbox, text-with-PUA)`` for alignment, and
    - per-PUA-codepoint occurrence samples ``{cp: [(page_index, char_bbox)]}``
      for the crop-OCR pass.
    """
    lines: list[tuple[int, _Box, str]] = []
    occ: dict[int, list[tuple[int, _Box]]] = collections.defaultdict(list)
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pi, page in enumerate(pdf.pages):
            chars = sorted(page.chars, key=lambda c: (round(c["top"], 0), c["x0"]))
            cur: list[dict] = []
            cur_top: float | None = None
            for c in chars:
                for ch in c.get("text", ""):
                    if _is_pua(ch) and len(occ[ord(ch)]) < _MAX_GLYPH_SAMPLES:
                        occ[ord(ch)].append(
                            (pi, (c["x0"], c["top"], c["x1"], c["bottom"]))
                        )
                if cur_top is None or abs(c["top"] - cur_top) <= _LINE_TOL:
                    cur.append(c)
                    cur_top = c["top"] if cur_top is None else cur_top
                else:
                    lines.append(_flush_line(pi, cur))
                    cur = [c]
                    cur_top = c["top"]
            if cur:
                lines.append(_flush_line(pi, cur))
    return lines, occ


def _flush_line(pi: int, chars: list[dict]) -> tuple[int, tuple[float, float, float, float], str]:
    text = "".join(c["text"] for c in chars)
    x0 = min(c["x0"] for c in chars)
    x1 = max(c["x1"] for c in chars)
    top = min(c["top"] for c in chars)
    bottom = max(c["bottom"] for c in chars)
    return (pi, (x0, top, x1, bottom), text)


def _ocr_clip(doc, ocr, page_index: int, bbox: _Box, zoom: float = _CLIP_ZOOM) -> str:
    pad = 2.0
    clip = fitz.Rect(bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)
    pix = doc[page_index].get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)
    arr = np.array(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    result, _ = ocr(arr)
    return " ".join(r[1] for r in (result or [])).strip()


def residual_pua_ratio(page_texts: list[str]) -> float:
    """Fraction of characters still in the private-use area."""
    total = sum(len(t) for t in page_texts)
    if not total:
        return 0.0
    pua = sum(1 for t in page_texts for ch in t if _is_pua(ch))
    return pua / total


def _vote_from_clause_numbers(doc, ocr, lines, votes) -> None:
    """Signal 1: align OCR'd clause-number lines to native PUA prefixes."""
    anchors = [
        (pi, bbox, text)
        for (pi, bbox, text) in lines
        if (m := _NATIVE_NUM.match(text.strip()))
        and any(_is_pua(c) for c in m.group(0))
    ][:_MAX_ANCHOR_LINES]
    for pi, bbox, text in anchors:
        native_num = _NATIVE_NUM.match(text.strip()).group(0)
        try:
            ocr_text = _ocr_clip(doc, ocr, pi, bbox)
        except Exception as e:  # noqa: BLE001
            log.debug("glyph_remap: clip OCR failed: %s", e)
            continue
        m = _OCR_NUM.match(ocr_text)
        if not m:
            continue
        ocr_num = m.group(0)
        # Positional zip only when the tokens line up exactly (same length,
        # dots in the same places) — conservative, avoids OCR-noise misvotes.
        if len(ocr_num) != len(native_num):
            continue
        if not all(
            (nc == "." and oc == ".") or (_is_pua(nc) and oc.isdigit())
            for nc, oc in zip(native_num, ocr_num, strict=True)
        ):
            continue
        for nc, oc in zip(native_num, ocr_num, strict=True):
            if _is_pua(nc):
                votes[ord(nc)][oc] += 1


def _vote_from_glyph_crops(doc, ocr, occ, votes) -> None:
    """Signal 2: OCR isolated glyph crops; count only clean single-digit
    reads (catches 6/8/9 that are rare in clause numbers)."""
    for cp, samples in occ.items():
        for pi, bbox in samples:
            try:
                txt = _ocr_clip(doc, ocr, pi, bbox, zoom=_GLYPH_ZOOM)
            except Exception:  # noqa: BLE001
                continue
            if len(txt) == 1 and txt.isdigit():
                votes[cp][txt] += 1


def derive_pua_digit_map(pdf_bytes: bytes) -> dict[int, str] | None:
    """Return {pua_codepoint: digit_char} or None if it can't be derived
    into a trustworthy, near-complete bijection."""
    if not ocr_available():
        return None

    lines, occ = _scan(pdf_bytes)
    # Restrict to codepoints frequent enough to be digit glyphs.
    occ = {cp: s for cp, s in occ.items() if len(s) >= min(_MIN_GLYPH_FREQ, _MAX_GLYPH_SAMPLES)}
    if not occ:
        return None

    votes: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    ocr = _get_ocr()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        _vote_from_clause_numbers(doc, ocr, lines, votes)
        _vote_from_glyph_crops(doc, ocr, occ, votes)
    finally:
        doc.close()

    pua_map: dict[int, str] = {}
    for cp, counter in votes.items():
        digit, n = counter.most_common(1)[0]
        if n >= _MIN_VOTES:
            pua_map[cp] = digit

    # Trust only a clean bijection (no two glyphs claiming the same digit).
    digits = list(pua_map.values())
    if not pua_map or len(set(digits)) != len(digits):
        log.warning("glyph_remap: non-bijective map %s — rejecting", pua_map)
        return None

    # Completeness guard: applying the map must leave essentially no PUA
    # behind. An incomplete map (e.g. missing 6/8/9) would silently keep
    # garbled digits — reject and let the caller fall back to OCR.
    residual = residual_pua_ratio(
        remap_page_texts(page_texts_native(pdf_bytes), pua_map)
    )
    if residual > _MAX_RESIDUAL_PUA:
        log.warning(
            "glyph_remap: %.4f residual PUA after remap (map=%s) — incomplete, rejecting",
            residual, {hex(k): v for k, v in sorted(pua_map.items())},
        )
        return None
    return pua_map


def remap_page_texts(page_texts: list[str], pua_map: dict[int, str]) -> list[str]:
    table = {cp: d for cp, d in pua_map.items()}
    return [t.translate(table) for t in page_texts]
