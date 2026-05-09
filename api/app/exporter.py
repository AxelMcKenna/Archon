"""Generate the RFI response bundle (FR-4.1).

ReportLab cover letter + per-item PDFs + index PDF + ZIP. Naming follows the
BCA's convention from /shared/taxonomy.json.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from datetime import date
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


@dataclass
class BundleItem:
    item_number: str          # raw_number or fallback ordering
    raw_text: str             # the BCA's question
    category: str             # final classification
    severity: str
    response_text: str        # final (edited or draft)
    attachments: list[str]    # filenames


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "item"


def _filename(pattern: str, *, appref: str, n: int, item: str | None, today: str) -> str:
    return (
        pattern.replace("[appref]", _safe(appref or "noref"))
        .replace("[n]", str(n))
        .replace("[item]", _safe(item or "x"))
        .replace("[date]", today)
        .replace("[doc-type]", "RFI-response")
        .replace("[doc-description]", "RFI-response")
    )


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontSize=18,
            leading=22,
            spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontSize=12,
            leading=16,
            spaceBefore=10,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontSize=10.5,
            leading=14,
            spaceAfter=8,
        ),
        "muted": ParagraphStyle(
            "muted",
            parent=base["BodyText"],
            fontSize=9,
            leading=12,
            textColor="#4a5568",
        ),
        "mono": ParagraphStyle(
            "mono",
            parent=base["Code"],
            fontSize=9,
            leading=12,
        ),
    }


def _para(text: str, style: ParagraphStyle) -> Paragraph:
    # Naive HTML escape; preserve double newlines as paragraphs.
    safe = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n\n", "<br/><br/>")
        .replace("\n", "<br/>")
    )
    return Paragraph(safe, style)


def render_cover_letter(
    *,
    bca_name: str,
    bca_officer: str | None,
    application_ref: str,
    rfi_number: int | None,
    issue_date: str | None,
    today: str,
    items: list[BundleItem],
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title="RFI response cover letter",
    )
    s = _styles()
    story = []

    story.append(_para(f"Response to RFI {rfi_number or ''}".strip(), s["title"]))
    story.append(
        _para(
            f"<b>To:</b> {bca_name}"
            + (f" — Attn. {bca_officer}" if bca_officer else "")
            + f"<br/><b>Application:</b> {application_ref}"
            + (f"<br/><b>RFI dated:</b> {issue_date}" if issue_date else "")
            + f"<br/><b>Response date:</b> {today}",
            s["body"],
        )
    )

    story.append(_para("Summary", s["h2"]))
    story.append(
        _para(
            "The following table lists each line item from the RFI, its "
            "subject, and the corresponding response document attached to "
            "this bundle.",
            s["body"],
        )
    )

    table_data: list[list[Any]] = [["#", "Subject", "Category", "Response file"]]
    for i, it in enumerate(items, start=1):
        table_data.append(
            [
                it.item_number,
                _para(it.raw_text[:140] + ("…" if len(it.raw_text) > 140 else ""), s["mono"]),
                it.category,
                f"item_{i}",
            ]
        )
    t = Table(table_data, colWidths=[10 * mm, 100 * mm, 35 * mm, 25 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), "#1f2530"),
                ("TEXTCOLOR", (0, 0), (-1, 0), "#ffffff"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.25, "#1f253033"),
            ]
        )
    )
    story.append(t)

    story.append(Spacer(1, 8 * mm))
    story.append(
        _para(
            "Each numbered item is responded to in the corresponding "
            "<b>item_N</b> file in this bundle. Supporting evidence is "
            "attached per item.",
            s["body"],
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(_para("Yours sincerely,", s["body"]))
    story.append(Spacer(1, 12 * mm))
    story.append(_para("[Applicant signature]", s["muted"]))

    doc.build(story)
    return buf.getvalue()


def render_item_pdf(item: BundleItem, *, ordinal: int) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=f"RFI item {ordinal}",
    )
    s = _styles()
    story = [
        _para(f"Item {item.item_number} — {item.category}", s["title"]),
        _para("RFI question", s["h2"]),
        _para(item.raw_text, s["mono"]),
        _para("Response", s["h2"]),
        _para(item.response_text or "(no response drafted)", s["body"]),
    ]
    if item.attachments:
        story.append(_para("Attachments", s["h2"]))
        story.append(
            _para(
                "<br/>".join(f"• {a}" for a in item.attachments),
                s["body"],
            )
        )
    doc.build(story)
    return buf.getvalue()


def render_index_pdf(items: list[BundleItem], *, file_map: list[str]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title="Bundle index")
    s = _styles()
    rows: list[list[Any]] = [["#", "Subject", "File"]]
    for i, (it, fname) in enumerate(zip(items, file_map, strict=True), start=1):
        rows.append([
            it.item_number,
            _para(it.raw_text[:140] + ("…" if len(it.raw_text) > 140 else ""), s["mono"]),
            fname,
        ])
    t = Table(rows, colWidths=[12 * mm, 110 * mm, 50 * mm])
    t.setStyle(
        TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("VALIGN", (0, 0), (-1, -1), "TOP")])
    )
    story = [_para("Response bundle index", s["title"]), t]
    doc.build(story)
    return buf.getvalue()


def build_bundle(
    *,
    bca_id: str,
    bca_name: str,
    bca_officer: str | None,
    naming_pattern: str,
    application_ref: str,
    rfi_number: int | None,
    issue_date: str | None,
    items: list[BundleItem],
) -> tuple[bytes, str, list[str]]:
    """Build the bundle ZIP. Returns (zip_bytes, zip_filename, member_filenames)."""
    today = date.today().isoformat()
    cover_name = _filename(
        naming_pattern,
        appref=application_ref,
        n=rfi_number or 1,
        item="cover",
        today=today,
    ).replace("RFI-response", "RFI-response-cover")
    if not cover_name.lower().endswith(".pdf"):
        cover_name += ".pdf"

    item_filenames: list[str] = []
    item_pdfs: list[bytes] = []
    for ordinal, it in enumerate(items, start=1):
        fname = _filename(
            naming_pattern,
            appref=application_ref,
            n=rfi_number or 1,
            item=str(ordinal),
            today=today,
        )
        if not fname.lower().endswith(".pdf"):
            fname += ".pdf"
        item_filenames.append(fname)
        item_pdfs.append(render_item_pdf(it, ordinal=ordinal))

    cover_pdf = render_cover_letter(
        bca_name=bca_name,
        bca_officer=bca_officer,
        application_ref=application_ref,
        rfi_number=rfi_number,
        issue_date=issue_date,
        today=today,
        items=items,
    )
    index_pdf = render_index_pdf(items, file_map=item_filenames)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(cover_name, cover_pdf)
        zf.writestr("00_index.pdf", index_pdf)
        for fname, pdf in zip(item_filenames, item_pdfs, strict=True):
            zf.writestr(fname, pdf)

    zip_filename = _filename(
        naming_pattern,
        appref=application_ref,
        n=rfi_number or 1,
        item="bundle",
        today=today,
    ).replace(".pdf", "") + ".zip"
    return zip_buf.getvalue(), zip_filename, [cover_name, "00_index.pdf", *item_filenames]
