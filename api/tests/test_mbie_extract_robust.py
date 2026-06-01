"""Detector + native/OCR orchestration for robust clause extraction.

Pure-logic tests: no PDFs, no RapidOCR. The OCR fallback path is exercised
by monkeypatching the page-text functions so we can assert the decision
logic (when to OCR, and that OCR only wins when it yields more clauses)
without depending on the optional OCR wheel.
"""

from __future__ import annotations

import app.ingestion.mbie.extract as ex
from app.ingestion.mbie.chunker import chunk_page_texts

_PUA = ""  # a Unicode private-use glyph, as the C/AS1 font emits for digits

# A page in MBIE clause-heading shape: "N.N Title" then a prose body.
_GOOD_PAGE = (
    "3.1 Cavity wall ties\n"
    "Cavity wall ties shall be spaced at no more than 600mm centres "
    "horizontally and 450mm vertically to restrain the veneer.\n"
    "3.2 Flashings\n"
    "Flashings shall have a minimum 15mm upstand and a 35mm cover to "
    "the cladding to prevent moisture ingress at penetrations."
)
# The C/AS1 failure mode: every digit hidden in the private-use area, so
# clause numbers no longer match and native chunking yields zero clauses.
_PUA_PAGE = "".join(_PUA if ch.isdigit() else ch for ch in _GOOD_PAGE)


class TestDetector:
    def test_clean_text_is_reliable(self):
        assert ex.text_looks_unreliable([_GOOD_PAGE]) is False

    def test_pua_heavy_text_is_unreliable(self):
        assert ex.text_looks_unreliable([_PUA_PAGE]) is True
        # A single stray PUA glyph in a long clean page stays under threshold.
        assert ex.text_looks_unreliable(["clean text " * 100 + _PUA]) is False

    def test_substantial_text_threshold(self):
        assert ex.has_substantial_text(["x" * 1500]) is True
        assert ex.has_substantial_text(["x" * 200, "y" * 200]) is False


class TestRobustExtraction:
    def test_native_path_when_clean(self, monkeypatch):
        monkeypatch.setattr(ex, "page_texts_native", lambda b: [_GOOD_PAGE])
        # OCR must never be consulted on a clean doc.
        monkeypatch.setattr(ex, "ocr_available", lambda: True)
        monkeypatch.setattr(
            ex, "page_texts_ocr",
            lambda b: (_ for _ in ()).throw(AssertionError("OCR should not run")),
        )
        chunks, method = ex.extract_clauses_robust(b"ignored")
        assert method == "native"
        assert len(chunks) == 2

    def test_glyph_remap_preferred_over_ocr(self, monkeypatch):
        # Lossless remap is tried first for PUA obfuscation; OCR must not run.
        monkeypatch.setattr(ex, "page_texts_native", lambda b: [_PUA_PAGE])
        monkeypatch.setattr(ex, "derive_pua_digit_map", lambda b: {0xE536: "3"})
        monkeypatch.setattr(ex, "remap_page_texts", lambda texts, m: [_GOOD_PAGE])
        monkeypatch.setattr(ex, "ocr_available", lambda: True)
        monkeypatch.setattr(
            ex, "page_texts_ocr",
            lambda b: (_ for _ in ()).throw(AssertionError("OCR should not run")),
        )
        chunks, method = ex.extract_clauses_robust(b"ignored")
        assert method == "glyph_remap"
        assert len(chunks) == 2

    def test_ocr_fallback_when_remap_unavailable(self, monkeypatch):
        # Remap declines (returns None) -> fall through to OCR.
        monkeypatch.setattr(ex, "page_texts_native", lambda b: [_PUA_PAGE])
        monkeypatch.setattr(ex, "derive_pua_digit_map", lambda b: None)
        monkeypatch.setattr(ex, "ocr_available", lambda: True)
        monkeypatch.setattr(ex, "page_texts_ocr", lambda b: [_GOOD_PAGE])
        chunks, method = ex.extract_clauses_robust(b"ignored")
        assert method == "ocr"
        assert len(chunks) == 2

    def test_no_fallback_when_remap_and_ocr_unavailable(self, monkeypatch):
        monkeypatch.setattr(ex, "page_texts_native", lambda b: [_PUA_PAGE])
        monkeypatch.setattr(ex, "derive_pua_digit_map", lambda b: None)
        monkeypatch.setattr(ex, "ocr_available", lambda: False)
        chunks, method = ex.extract_clauses_robust(b"ignored")
        assert method == "native"
        assert chunks == []

    def test_ocr_not_kept_when_no_better(self, monkeypatch):
        # Native has 1 real clause but trailing PUA junk trips the detector;
        # remap declines, OCR yields fewer, so the native result is kept.
        native = "5.1 Heading\n" + ("body text long enough to survive " * 3) + _PUA * 5
        monkeypatch.setattr(ex, "page_texts_native", lambda b: [native])
        monkeypatch.setattr(ex, "derive_pua_digit_map", lambda b: None)
        monkeypatch.setattr(ex, "ocr_available", lambda: True)
        monkeypatch.setattr(ex, "page_texts_ocr", lambda b: ["no headings here"])
        chunks, method = ex.extract_clauses_robust(b"ignored")
        assert method == "native"
        assert len(chunks) == 1


def test_chunk_page_texts_matches_extract_clauses_shape():
    # chunk_page_texts is the source-agnostic core extract_clauses wraps.
    chunks = chunk_page_texts([_GOOD_PAGE])
    assert [c.clause_number for c in chunks] == ["3.1", "3.2"]
    assert chunks[0].heading == "Cavity wall ties"
    assert chunks[0].page == 1
