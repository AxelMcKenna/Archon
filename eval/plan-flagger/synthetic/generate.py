"""Generate synthetic building plan PDFs for the v2 eval harness.

The plans here are **deliberately defective** — each carries a small set
of seeded issues that the flagger ought to catch. They are intentionally
simple (one-page or short multi-page) so the eval is fast and cheap.

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


PLANS = [
    _plan_bracing_incomplete,
    _plan_missing_sheet,
    _plan_revision_mismatch,
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
