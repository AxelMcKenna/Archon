"""Generate synthetic building plan PDFs for the v2 vision-eval harness.

The plans here are **deliberately defective** — each carries a small set
of seeded issues that the flagger ought to catch. They are intentionally
simple (one-page or short multi-page) so the vision-eval is fast and cheap.

Run once to (re)generate PDFs alongside their labels.json siblings.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfgen import canvas

OUT_DIR = Path(__file__).parent
PAGE_SIZE = landscape(A3)
PAGE_W, PAGE_H = PAGE_SIZE


def _title_block(c: canvas.Canvas, *, sheet: str, revision: str, project: str) -> None:
    """Bottom-right title block. The plan_text extractor reads this."""
    x = PAGE_W - 250
    y = 30
    c.setStrokeColorRGB(0, 0, 0)
    c.rect(x, y, 230, 100)
    c.setFont("Helvetica", 9)
    c.drawString(x + 10, y + 80, f"PROJECT: {project}")
    c.drawString(x + 10, y + 60, f"SHEET: {sheet}")
    c.drawString(x + 10, y + 40, f"REV: {revision}")
    c.drawString(x + 10, y + 20, "DRAWN: A. Architect")


def _drawing_register(c: canvas.Canvas, entries: list[tuple[str, str]]) -> None:
    """Cover-sheet drawing register. The plan_text extractor reads this."""
    c.setFont("Helvetica-Bold", 14)
    c.drawString(80, PAGE_H - 80, "DRAWING REGISTER")
    c.setFont("Helvetica", 11)
    y = PAGE_H - 120
    for code, title in entries:
        c.drawString(80, y, f"{code}    {title}")
        y -= 22


def _ruled_table(
    c: canvas.Canvas, *, x: float, top: float, headers: list[str], rows: list[list[str]]
) -> None:
    """Draw a bordered grid table so pdfplumber's extract_tables() detects it
    (the schedule extractor in plan_text.py relies on ruled lines)."""
    col_w = 110
    row_h = 22
    n_cols = len(headers)
    n_rows = len(rows) + 1
    width = col_w * n_cols
    height = row_h * n_rows
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.8)
    # Horizontal lines.
    for r in range(n_rows + 1):
        yy = top - r * row_h
        c.line(x, yy, x + width, yy)
    # Vertical lines.
    for col in range(n_cols + 1):
        xx = x + col * col_w
        c.line(xx, top, xx, top - height)
    # Cell text.
    c.setFont("Helvetica-Bold", 9)
    for col, h in enumerate(headers):
        c.drawString(x + col * col_w + 5, top - row_h + 7, h)
    c.setFont("Helvetica", 9)
    for r, row in enumerate(rows, start=1):
        for col, cell in enumerate(row):
            c.drawString(x + col * col_w + 5, top - (r + 1) * row_h + 7, cell)


@dataclass
class Plan:
    plan_id: str
    bca: str
    project_type: str
    project: str
    pages: list[Any]
    ground_truth: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Plan templates
# ---------------------------------------------------------------------------


def _plan_bracing_incomplete() -> Plan:
    """Two-page extension plan with an incomplete bracing schedule."""

    def page1(c: canvas.Canvas) -> None:
        _drawing_register(
            c,
            [
                ("A1.01", "Site Plan"),
                ("A2.01", "Floor Plan"),
                ("A3.01", "Elevations"),
                ("S1.01", "Bracing Schedule"),
            ],
        )
        _title_block(c, sheet="A1.01", revision="B", project="Smith Extension")

    def page2(c: canvas.Canvas) -> None:
        c.setFont("Helvetica-Bold", 14)
        c.drawString(80, PAGE_H - 80, "BRACING SCHEDULE")
        c.setFont("Helvetica", 11)
        c.drawString(80, PAGE_H - 110, "WALL LINE   |  BU DEMAND")
        rows = [("L1", 120), ("L2", 95), ("L3", 140)]
        y = PAGE_H - 135
        for line, demand in rows:
            c.drawString(80, y, f"{line}            |  {demand}")
            y -= 22
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(80, y - 20, "(Achieved BUs to follow.)")
        _title_block(c, sheet="S1.01", revision="B", project="Smith Extension")

    return Plan(
        plan_id="synthetic-bracing-incomplete",
        bca="ccc",
        project_type="extension",
        project="Smith Extension",
        pages=[page1, page2],
        ground_truth=[
            {
                "category": "building_code:B1",
                "severity": "must_resolve",
                "page": 2,
                "area_hint": "bracing",
                "rationale": "Achieved BUs column missing.",
            }
        ],
    )


def _plan_missing_sheet() -> Plan:
    """Cover sheet lists S1.01 but it's not in the upload."""

    def page1(c: canvas.Canvas) -> None:
        _drawing_register(
            c,
            [
                ("A1.01", "Site Plan"),
                ("A2.01", "Floor Plan"),
                ("S1.01", "Foundation Plan"),
            ],
        )
        _title_block(c, sheet="A1.01", revision="A", project="Jones Garage")

    def page2(c: canvas.Canvas) -> None:
        c.setFont("Helvetica", 14)
        c.drawString(80, PAGE_H - 80, "FLOOR PLAN")
        _title_block(c, sheet="A2.01", revision="A", project="Jones Garage")

    return Plan(
        plan_id="synthetic-missing-sheet",
        bca="ccc",
        project_type="accessory",
        project="Jones Garage",
        pages=[page1, page2],
        ground_truth=[
            {
                "category": "documentation:missing_sheets",
                "severity": "must_resolve",
                "page": 1,
                "area_hint": "S1.01",
                "rationale": "Register lists S1.01 but it's absent from the upload.",
            }
        ],
    )


def _plan_revision_mismatch() -> Plan:
    """Three sheets: two at Rev C, one at Rev B — sync issue."""

    def page1(c: canvas.Canvas) -> None:
        _drawing_register(
            c,
            [
                ("A1.01", "Site Plan"),
                ("A2.01", "Floor Plan"),
                ("A3.01", "Elevations"),
            ],
        )
        _title_block(c, sheet="A1.01", revision="C", project="Patel Deck")

    def page2(c: canvas.Canvas) -> None:
        c.setFont("Helvetica", 14)
        c.drawString(80, PAGE_H - 80, "FLOOR PLAN")
        _title_block(c, sheet="A2.01", revision="C", project="Patel Deck")

    def page3(c: canvas.Canvas) -> None:
        c.setFont("Helvetica", 14)
        c.drawString(80, PAGE_H - 80, "ELEVATIONS")
        _title_block(c, sheet="A3.01", revision="B", project="Patel Deck")

    return Plan(
        plan_id="synthetic-revision-mismatch",
        bca="selwyn",
        project_type="deck",
        project="Patel Deck",
        pages=[page1, page2, page3],
        ground_truth=[
            {
                "category": "documentation:revision_mismatch",
                "severity": "nice_to_have",
                "page": 3,
                "area_hint": "rev",
                "rationale": "A3.01 is at Rev B while the rest are Rev C.",
            }
        ],
    )


def _plan_commercial_coordination() -> Plan:
    """Commercial multi-discipline set (Risk Group WB). Same level across an
    architectural door schedule, a fire plan and a mechanical plan, seeded with
    two commercial issues:

      - a door schedule with no fire-resistance-rating column while a fire sheet
        is present (deterministic ``fire_door_schedule_gap`` rule), and
      - a mechanical duct crossing a fire-rated wall with no damper shown
        (cross-discipline ``design_coordination`` — needs the coordination pass,
        ``plan_coordination_enabled``).
    """

    def page1(c: canvas.Canvas) -> None:
        _drawing_register(
            c,
            [
                ("A-101", "Ground Floor Plan"),
                ("A-102", "Door Schedule"),
                ("F-101", "Fire Plan - Ground Floor"),
                ("M-101", "Mechanical Plan - Ground Floor"),
            ],
        )
        _title_block(c, sheet="A-101", revision="A", project="Riverside Offices")

    def page2(c: canvas.Canvas) -> None:
        c.setFont("Helvetica-Bold", 14)
        c.drawString(80, PAGE_H - 80, "DOOR SCHEDULE")
        # No FRR column — the gap the fire_door_schedule_gap rule catches.
        _ruled_table(
            c,
            x=80,
            top=PAGE_H - 110,
            headers=["DOOR NO", "TYPE", "WIDTH", "HEIGHT"],
            rows=[
                ["D01", "Solid core", "910", "2100"],
                ["D02", "Glazed", "910", "2100"],
                ["D03", "Solid core", "810", "2100"],
            ],
        )
        _title_block(c, sheet="A-102", revision="A", project="Riverside Offices")

    def page3(c: canvas.Canvas) -> None:
        c.setFont("Helvetica-Bold", 14)
        c.drawString(80, PAGE_H - 80, "FIRE PLAN - GROUND FLOOR")
        c.setFont("Helvetica", 11)
        c.drawString(80, PAGE_H - 110, "LEVEL: GROUND FLOOR")
        # A fire-rated wall running across the plan.
        c.setLineWidth(2)
        c.line(300, PAGE_H - 360, 600, PAGE_H - 360)
        c.drawString(330, PAGE_H - 355, "FIRE RATED WALL -/60/60")
        _title_block(c, sheet="F-101", revision="A", project="Riverside Offices")

    def page4(c: canvas.Canvas) -> None:
        c.setFont("Helvetica-Bold", 14)
        c.drawString(80, PAGE_H - 80, "MECHANICAL PLAN - GROUND FLOOR")
        c.setFont("Helvetica", 11)
        c.drawString(80, PAGE_H - 110, "LEVEL: GROUND FLOOR")
        # A duct crossing exactly where the fire wall sits on F-101 — no damper.
        c.setLineWidth(2)
        c.line(450, PAGE_H - 300, 450, PAGE_H - 420)
        c.drawString(460, PAGE_H - 360, "DUCT 600x400 (no damper shown)")
        _title_block(c, sheet="M-101", revision="A", project="Riverside Offices")

    return Plan(
        plan_id="synthetic-commercial-coordination",
        bca="ccc",
        project_type="commercial_office",
        project="Riverside Offices",
        pages=[page1, page2, page3, page4],
        ground_truth=[
            {
                "category": "documentation:plans:design_coordination",
                "severity": "must_resolve",
                "page": 2,
                "area_hint": "door schedule FRR",
                "rationale": "Door schedule has no FRR column but a fire sheet is present.",
                "detector": "doc_rule:fire_door_schedule_gap",
            },
            {
                "category": "documentation:plans:design_coordination",
                "severity": "must_resolve",
                "page": 4,
                "area_hint": "duct crosses fire wall",
                "rationale": "M-101 duct crosses the F-101 fire-rated wall with no damper.",
                "detector": "coordination_pass (plan_coordination_enabled)",
            },
        ],
    )


PLANS = [
    _plan_bracing_incomplete,
    _plan_missing_sheet,
    _plan_revision_mismatch,
    _plan_commercial_coordination,
]


def _write_plan(plan: Plan) -> None:
    pdf_path = OUT_DIR / f"{plan.plan_id}.pdf"
    label_path = OUT_DIR / f"{plan.plan_id}.labels.json"
    c = canvas.Canvas(str(pdf_path), pagesize=PAGE_SIZE)
    for draw in plan.pages:
        draw(c)
        c.showPage()
    c.save()
    label_path.write_text(
        json.dumps(
            {
                "plan_id": plan.plan_id,
                "bca": plan.bca,
                "project_type": plan.project_type,
                "ground_truth_flags": plan.ground_truth,
            },
            indent=2,
        )
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for factory in PLANS:
        _write_plan(factory())
    print(f"Wrote {len(PLANS)} synthetic plans to {OUT_DIR}")


if __name__ == "__main__":
    main()
