"""Generate A-101 Ground Floor Plan as a credible council-submission PDF.

Wraps the source floor plan PNG in an A3 landscape architectural title block
modelled on NZ residential consent conventions. Output is a vector PDF with
a proper text layer in the title block — parseable by pdfplumber.

Usage:
    /Users/axelmckenna/dev/Saasathon/api/.venv/bin/python generate_a101.py
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

HERE = Path(__file__).parent
SOURCE_IMG = HERE / "floor-plan-source.png"
OUTPUT_PDF = HERE / "A-101_ground_floor_plan.pdf"

# A3 landscape: 420 × 297 mm
PAGE_W, PAGE_H = landscape(A3)

# Margins
MARGIN = 8 * mm

# Title block strip on the right
TB_WIDTH = 72 * mm

# Drawing area
DR_X = MARGIN
DR_Y = MARGIN
DR_W = PAGE_W - TB_WIDTH - 2 * MARGIN
DR_H = PAGE_H - 2 * MARGIN

# Title block
TB_X = PAGE_W - TB_WIDTH - MARGIN
TB_Y = MARGIN
TB_H = DR_H

INK = HexColor("#1c1c1c")
RULE = HexColor("#2a2a2a")
ACCENT = HexColor("#444444")
SUBTLE = HexColor("#666666")


def draw_drawing_area(c: canvas.Canvas) -> None:
    """Frame and place the floor plan image within the drawing area."""
    # Outer border
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.rect(DR_X, DR_Y, DR_W, DR_H, stroke=1, fill=0)

    # Inner offset for image
    pad = 6 * mm
    img_x = DR_X + pad
    img_y = DR_Y + pad
    img_w = DR_W - 2 * pad
    img_h = DR_H - 2 * pad - 12 * mm  # leave space for sheet title under image

    # Image dimensions are 1992 × 1276 (aspect ratio 1.561). Fit into available area.
    src_aspect = 1992 / 1276
    avail_aspect = img_w / img_h
    if avail_aspect > src_aspect:
        # Available area is wider than the image — limit by height
        draw_h = img_h
        draw_w = draw_h * src_aspect
    else:
        # Available area is narrower than the image — limit by width
        draw_w = img_w
        draw_h = draw_w / src_aspect

    # Centre the image horizontally; align top below sheet-title
    cx = img_x + (img_w - draw_w) / 2
    cy = img_y + 12 * mm + (img_h - draw_h) / 2 + 6 * mm

    c.drawImage(
        str(SOURCE_IMG),
        cx,
        cy,
        width=draw_w,
        height=draw_h,
        preserveAspectRatio=True,
        anchor="c",
        mask="auto",
    )

    # Sheet title under drawing
    title_y = DR_Y + 8 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(DR_X + pad, title_y, "GROUND FLOOR PLAN")
    c.setFont("Helvetica", 9)
    c.setFillColor(SUBTLE)
    c.drawString(DR_X + pad + 70 * mm, title_y, "SCALE 1:100 @ A3")
    c.drawString(DR_X + pad + 110 * mm, title_y, "ALL DIMENSIONS IN MILLIMETRES")
    c.setFillColor(INK)


def draw_title_block(c: canvas.Canvas) -> None:
    """Right-side title block with project, designer, sheet, and revisions."""
    # Outer border
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.rect(TB_X, TB_Y, TB_WIDTH, TB_H, stroke=1, fill=0)

    # Cells from the bottom up — fills full TB_H (~281mm available)
    rows = [
        ("sheet_no", 38 * mm),         # bottom: big sheet number
        ("sheet_name", 22 * mm),       # sheet name
        ("scale_date", 18 * mm),       # scale | date
        ("drawn_checked", 18 * mm),    # drawn | checked
        ("project_no", 14 * mm),       # project number
        ("revisions", 60 * mm),        # revision history (4 rows + breathing room)
        ("project", 48 * mm),          # project name + address
        ("client", 22 * mm),           # client / owner
        ("designer", 41 * mm),         # designer firm + contact details
    ]

    y = TB_Y
    cells: dict[str, tuple[float, float]] = {}  # cell_id -> (y_bottom, height)
    for cell_id, h in rows:
        cells[cell_id] = (y, h)
        y += h
        # Horizontal divider
        c.setStrokeColor(RULE)
        c.setLineWidth(0.3)
        c.line(TB_X, y, TB_X + TB_WIDTH, y)

    pad = 5 * mm  # left/right padding inside cells

    # Designer block (top)
    cy, ch = cells["designer"]
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(TB_X + pad, cy + ch - 9 * mm, "FOOTHILLS DESIGN STUDIO")
    c.setFont("Helvetica", 8)
    c.setFillColor(SUBTLE)
    c.drawString(TB_X + pad, cy + ch - 15 * mm, "Architectural Designers · LBP 117624")
    c.drawString(TB_X + pad, cy + ch - 21 * mm, "9 Mead Street, Rolleston 7614")
    c.drawString(TB_X + pad, cy + ch - 27 * mm, "design@foothills.co.nz")
    c.drawString(TB_X + pad, cy + ch - 33 * mm, "03 347 8821")

    # Client
    cy, ch = cells["client"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "CLIENT")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(TB_X + pad, cy + ch - 12 * mm, "B & K Whitcombe")
    c.setFont("Helvetica", 8)
    c.setFillColor(SUBTLE)
    c.drawString(TB_X + pad, cy + ch - 18 * mm, "Owner-occupier")

    # Project
    cy, ch = cells["project"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "PROJECT")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(TB_X + pad, cy + ch - 13 * mm, "New Dwelling")
    c.setFont("Helvetica", 9.5)
    c.drawString(TB_X + pad, cy + ch - 20 * mm, "24 Tasman Crescent")
    c.drawString(TB_X + pad, cy + ch - 26 * mm, "Rolleston 7614")
    c.setFont("Helvetica", 8)
    c.setFillColor(SUBTLE)
    c.drawString(TB_X + pad, cy + ch - 34 * mm, "Lot 47 DP 581234")
    c.drawString(TB_X + pad, cy + ch - 40 * mm, "Selwyn District Council")

    # Revisions — header + 4 entries; column anchors widened (BY moved right)
    cy, ch = cells["revisions"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "REVISIONS")

    # Column header row
    header_y = cy + ch - 11 * mm
    col_rev = TB_X + pad
    col_date = TB_X + 13 * mm
    col_desc = TB_X + 28 * mm
    col_by = TB_X + TB_WIDTH - 8 * mm  # right-anchored; row uses drawRightString
    c.setFont("Helvetica-Bold", 7)
    c.drawString(col_rev, header_y, "REV")
    c.drawString(col_date, header_y, "DATE")
    c.drawString(col_desc, header_y, "DESCRIPTION")
    c.drawRightString(col_by, header_y, "BY")

    revisions = [
        ("A", "10.03.26", "Concept design", "AM"),
        ("B", "01.04.26", "Client review issue", "AM"),
        ("C", "15.04.26", "Building consent issue", "AM"),
        ("—", "", "", ""),
    ]
    c.setFillColor(INK)
    c.setFont("Helvetica", 8.5)
    for i, (rev, date, desc, by) in enumerate(revisions):
        ry = header_y - 7 * mm - i * 7 * mm
        c.drawString(col_rev, ry, rev)
        c.drawString(col_date, ry, date)
        c.drawString(col_desc, ry, desc)
        c.drawRightString(col_by, ry, by)

    # Project number
    cy, ch = cells["project_no"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "PROJECT No.")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(TB_X + TB_WIDTH - pad, cy + ch - 9 * mm, "2604")

    # Drawn / Checked
    cy, ch = cells["drawn_checked"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "DRAWN")
    c.drawString(TB_X + 38 * mm, cy + ch - 5 * mm, "CHECKED")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(TB_X + pad, cy + ch - 13 * mm, "AM")
    c.drawString(TB_X + 38 * mm, cy + ch - 13 * mm, "PR")

    # Scale / Date
    cy, ch = cells["scale_date"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "SCALE")
    c.drawString(TB_X + 38 * mm, cy + ch - 5 * mm, "DATE")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(TB_X + pad, cy + ch - 13 * mm, "1:100 @ A3")
    c.drawString(TB_X + 38 * mm, cy + ch - 13 * mm, "15.04.2026")

    # Sheet name
    cy, ch = cells["sheet_name"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "SHEET NAME")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(TB_X + pad, cy + ch - 14 * mm, "Ground Floor Plan")

    # Sheet number — large
    cy, ch = cells["sheet_no"]
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7.5)
    c.drawString(TB_X + pad, cy + ch - 5 * mm, "SHEET")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 36)
    c.drawString(TB_X + pad, cy + 8 * mm, "A-101")
    c.setFont("Helvetica", 9)
    c.setFillColor(SUBTLE)
    c.drawRightString(TB_X + TB_WIDTH - pad, cy + 8 * mm, "OF 14")


def draw_corners(c: canvas.Canvas) -> None:
    """Drafting tick marks at the page corners — adds realism."""
    tick = 4 * mm
    c.setStrokeColor(INK)
    c.setLineWidth(0.4)
    for x, y in [
        (MARGIN / 2, MARGIN / 2),
        (PAGE_W - MARGIN / 2, MARGIN / 2),
        (MARGIN / 2, PAGE_H - MARGIN / 2),
        (PAGE_W - MARGIN / 2, PAGE_H - MARGIN / 2),
    ]:
        c.line(x - tick / 2, y, x + tick / 2, y)
        c.line(x, y - tick / 2, x, y + tick / 2)


def draw_header_strip(c: canvas.Canvas) -> None:
    """Thin metadata strip above the drawing border (left)."""
    y = PAGE_H - MARGIN - 5 * mm
    c.setFillColor(SUBTLE)
    c.setFont("Helvetica", 7)
    c.drawString(DR_X + 1 * mm, y, "BUILDING CONSENT ISSUE — DO NOT SCALE FROM DRAWINGS · ALL DIMENSIONS TO BE VERIFIED ON SITE BY THE CONTRACTOR")
    c.setFillColor(INK)


def main() -> None:
    if not SOURCE_IMG.exists():
        raise SystemExit(f"Source image not found: {SOURCE_IMG}")

    c = canvas.Canvas(str(OUTPUT_PDF), pagesize=landscape(A3))

    # PDF metadata — ingestible by pdfplumber
    c.setTitle("A-101 Ground Floor Plan — 24 Tasman Crescent, Rolleston")
    c.setAuthor("Foothills Design Studio")
    c.setSubject("Building Consent Issue — Selwyn District Council")
    c.setKeywords("BC, Selwyn, Rolleston, ground floor plan, A-101, Rev C")

    # Page elements
    draw_corners(c)
    draw_header_strip(c)
    draw_drawing_area(c)
    draw_title_block(c)

    c.showPage()
    c.save()
    print(f"Wrote {OUTPUT_PDF} ({OUTPUT_PDF.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
