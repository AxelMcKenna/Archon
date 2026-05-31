"""Heading detection + clause chunking for the MBIE PDF extractor.

We build a synthetic PDF in-memory with reportlab (already a dep via
the overlay renderer) so the test exercises the real pdfplumber → text
path that prod uses, not the regex in isolation.
"""

from __future__ import annotations

import io

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.ingestion.mbie.chunker import _is_heading, extract_clauses


def _make_pdf(lines: list[str]) -> bytes:
    """One-page PDF with each input line stacked top-to-bottom."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 11)
    y = A4[1] - 50
    for line in lines:
        c.drawString(50, y, line)
        y -= 16
    c.showPage()
    c.save()
    return buf.getvalue()


def test_is_heading_catches_numbered_clauses() -> None:
    assert _is_heading("3.1 Floors") == ("3.1", "Floors")
    assert _is_heading("3.1.2 Cavity wall ties") == ("3.1.2", "Cavity wall ties")
    assert _is_heading("9.2.4.1 Drainage cavity battens") == (
        "9.2.4.1",
        "Drainage cavity battens",
    )


def test_is_heading_rejects_non_headings() -> None:
    assert _is_heading("Figure 7") is None
    assert _is_heading("Table 4") is None
    assert _is_heading("Page 12") is None
    assert _is_heading("the wall shall be built to 9.1.5 specifications") is None
    assert _is_heading("") is None


def test_is_heading_catches_paragraph_form() -> None:
    assert _is_heading("Paragraph 9.1.5")[0] == "9.1.5"
    assert _is_heading("Paragraph 9.1.5: Direct fixed cladding")[0] == "9.1.5"


def test_extract_clauses_chunks_by_heading() -> None:
    pdf = _make_pdf(
        [
            "Some preamble text that should be ignored before any heading.",
            "3.1 Floors",
            "Floors shall be constructed in accordance with this section.",
            "Minimum thickness requirements apply per Table 2.",
            "3.2 Walls",
            "External walls shall comply with the cavity requirements set out below.",
            "Wall framing shall be at 600mm centres maximum.",
            "3.2.1 Cavity wall ties",
            "Cavity wall ties shall be stainless steel grade 304 spaced at 600mm.",
            "Ties shall extend 50mm into each leaf of the wall.",
        ]
    )
    chunks = extract_clauses(pdf)
    by_num = {c.clause_number: c for c in chunks}
    assert "3.1" in by_num and "3.2" in by_num and "3.2.1" in by_num
    assert by_num["3.1"].heading == "Floors"
    assert "Minimum thickness" in by_num["3.1"].text
    assert "stainless steel" in by_num["3.2.1"].text
    # Preamble before any heading must be dropped, not bucketed as a clause.
    assert all("preamble" not in c.text.lower() for c in chunks)


def test_extract_clauses_drops_empty_body() -> None:
    pdf = _make_pdf(
        [
            "3.1 ShortClause",
            "3.2 RealClause",
            "Body text long enough to clear the minimum body threshold cleanly.",
        ]
    )
    chunks = extract_clauses(pdf, min_body_chars=40)
    nums = {c.clause_number for c in chunks}
    assert "3.2" in nums
    assert "3.1" not in nums  # too-short body suppressed


def test_extract_clauses_on_empty_pdf_returns_empty() -> None:
    pdf = _make_pdf(["No headings here at all, just prose."])
    assert extract_clauses(pdf) == []


def test_extract_clauses_handles_completely_blank_pdf() -> None:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.showPage()
    c.save()
    pdf = buf.getvalue()
    assert extract_clauses(pdf) == []


@pytest.mark.parametrize(
    "category,expected",
    [
        ("building_code:E2:cladding", "E2"),
        ("building_code:B1", "B1"),
        ("building_code:H1:envelope", "H1"),
        ("documentation:plans", None),
        ("process:vetting_s45", None),
        (None, None),
        ("", None),
    ],
)
def test_code_clause_for_category(category: str | None, expected: str | None) -> None:
    from app.mbie.retriever import code_clause_for_category

    assert code_clause_for_category(category) == expected
