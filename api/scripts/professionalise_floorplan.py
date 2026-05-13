"""Take the raw floorplan.dxf and dress it up to look like a consent
application drawing: border, title block, north arrow, scale bar.

The original floorplan is from the jscad sample-files repo and is a
"naked" residential floor plan — walls + rooms + dims, no presentation
furniture. Real architects' drawings always have a frame, title block,
sheet ID, and orientation indicators.
"""

from __future__ import annotations

import io
from pathlib import Path

import ezdxf
from ezdxf import bbox as _bbox
from ezdxf.enums import TextEntityAlignment

SRC = Path(__file__).resolve().parents[2] / "tmp" / "floorplan.dxf"
OUT = Path(__file__).resolve().parents[2] / "tmp" / "floorplan-pro.dxf"


def main() -> None:
    raw = SRC.read_bytes()
    try:
        doc = ezdxf.read(io.StringIO(raw.decode("utf-8", errors="replace")))
    except Exception:
        from ezdxf import recover

        doc, _ = recover.read(io.BytesIO(raw))
    msp = doc.modelspace()

    # Strip the original giant "FLOOR PLAN" caption — the title block we
    # add below is the proper place for the sheet title.
    for e in list(msp):
        if e.dxftype() == "TEXT":
            txt = (e.dxf.text or "").strip().upper()
            if txt == "FLOOR PLAN":
                msp.delete_entity(e)

    b = _bbox.extents(msp, fast=True)
    x0, y0, x1, y1 = b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y
    w, h = x1 - x0, y1 - y0
    # Drawing units appear to be feet from the values in the file.
    unit = max(w, h) / 100  # generic "small text height" unit

    for layer, _color in [
        ("PRO_BORDER", 7),     # thick frame
        ("PRO_TITLE", 7),      # title block
        ("PRO_TEXT", 7),       # title block text
        ("PRO_NORTH", 7),      # north arrow
        ("PRO_SCALE", 7),      # scale bar
    ]:
        if layer not in doc.layers:
            doc.layers.add(layer)

    # ── elegant sheet subtitle (replaces the deleted giant caption) ───
    # Sits in the bottom margin, left of the title block. Push down well
    # below the drawing so it doesn't crowd room labels at the south edge.
    subtitle_y = y0 - max(w, h) * 0.10
    subtitle_x = x0
    msp.add_text(
        "GROUND FLOOR PLAN",
        dxfattribs={"layer": "PRO_TEXT", "height": unit * 1.6},
    ).set_placement((subtitle_x, subtitle_y), align=TextEntityAlignment.LEFT)
    # Underline accent
    title_w = max(w, h) * 0.18
    msp.add_lwpolyline(
        [
            (subtitle_x, subtitle_y - unit * 0.5),
            (subtitle_x + title_w, subtitle_y - unit * 0.5),
        ],
        dxfattribs={"layer": "PRO_TEXT"},
    )
    msp.add_text(
        "Scale 1 : 100  @  A1",
        dxfattribs={"layer": "PRO_TEXT", "height": unit * 0.7},
    ).set_placement(
        (subtitle_x, subtitle_y - unit * 1.6), align=TextEntityAlignment.LEFT
    )

    # ── outer border ──────────────────────────────────────────────────
    # Generous margin so the title block / scale bar / north arrow don't
    # crowd the drawing itself. Bottom margin is taller because the title
    # block + subtitle + scale bar all live there.
    margin_x = max(w, h) * 0.12
    margin_top = max(w, h) * 0.10
    margin_bot = max(w, h) * 0.22
    bx0, by0 = x0 - margin_x, y0 - margin_bot
    bx1, by1 = x1 + margin_x, y1 + margin_top
    # `margin` is still used by the north arrow / scale bar offsets below.
    margin = margin_x
    msp.add_lwpolyline(
        [(bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1), (bx0, by0)],
        dxfattribs={"layer": "PRO_BORDER", "const_width": unit * 0.15},
    )

    # ── title block (bottom-right) ───────────────────────────────────
    tb_w = (bx1 - bx0) * 0.32
    tb_h = (by1 - by0) * 0.16
    tx0 = bx1 - tb_w
    ty0 = by0
    tx1 = bx1
    ty1 = by0 + tb_h

    msp.add_lwpolyline(
        [(tx0, ty0), (tx1, ty0), (tx1, ty1), (tx0, ty1), (tx0, ty0)],
        dxfattribs={"layer": "PRO_TITLE", "const_width": unit * 0.08},
    )
    # Header row divider
    header_y = ty1 - tb_h * 0.32
    msp.add_line(
        (tx0, header_y), (tx1, header_y),
        dxfattribs={"layer": "PRO_TITLE"},
    )

    # Practice name / sheet header
    msp.add_text(
        "HAWKINS ARCHITECTS",
        dxfattribs={"layer": "PRO_TEXT", "height": unit * 1.6},
    ).set_placement(
        ((tx0 + tx1) / 2, header_y + tb_h * 0.18),
        align=TextEntityAlignment.MIDDLE_CENTER,
    )
    msp.add_text(
        "Building Consent Submission",
        dxfattribs={"layer": "PRO_TEXT", "height": unit * 0.85},
    ).set_placement(
        ((tx0 + tx1) / 2, header_y + tb_h * 0.07),
        align=TextEntityAlignment.MIDDLE_CENTER,
    )

    # Body grid: 2 columns, key/value rows
    rows = [
        ("PROJECT", "PROPOSED DWELLING"),
        ("ADDRESS", "9A Bucknell Street, Christchurch"),
        ("SHEET", "A-100  GROUND FLOOR PLAN"),
        ("SCALE", "1 : 100  @ A1"),
        ("DATE", "May 2026"),
        ("DRAWN", "AM"),
        ("REV", "P1"),
    ]
    body_top = header_y - tb_h * 0.05
    body_bot = ty0 + tb_h * 0.05
    row_h = (body_top - body_bot) / len(rows)
    label_x = tx0 + tb_w * 0.04
    val_x = tx0 + tb_w * 0.34

    for i, (k, v) in enumerate(rows):
        y = body_top - row_h * (i + 0.65)
        msp.add_text(
            k, dxfattribs={"layer": "PRO_TEXT", "height": unit * 0.6}
        ).set_placement((label_x, y), align=TextEntityAlignment.LEFT)
        msp.add_text(
            v, dxfattribs={"layer": "PRO_TEXT", "height": unit * 0.7}
        ).set_placement((val_x, y), align=TextEntityAlignment.LEFT)

    # ── scale bar (bottom-left) ──────────────────────────────────────
    sb_x0 = bx0 + margin * 0.5
    sb_y = by0 + margin * 0.45
    seg_len = max(w, h) * 0.04   # one segment ≈ 4% of drawing width
    seg_h = unit * 0.4
    # 5-segment alternating bar (0 to 5 × seg_len)
    for i in range(5):
        sx = sb_x0 + i * seg_len
        if i % 2 == 0:
            msp.add_solid(
                [
                    (sx, sb_y),
                    (sx + seg_len, sb_y),
                    (sx + seg_len, sb_y + seg_h),
                    (sx, sb_y + seg_h),
                ],
                dxfattribs={"layer": "PRO_SCALE"},
            )
        else:
            msp.add_lwpolyline(
                [
                    (sx, sb_y),
                    (sx + seg_len, sb_y),
                    (sx + seg_len, sb_y + seg_h),
                    (sx, sb_y + seg_h),
                    (sx, sb_y),
                ],
                dxfattribs={"layer": "PRO_SCALE", "const_width": unit * 0.06},
            )
    # Tick labels (assume drawing units are feet → metric labels at 1:100)
    # 1 ft ≈ 305mm; if seg_len is in feet, label as scaled metres at A1 1:100.
    # Keep it generic:
    for i in [0, 2, 4]:
        msp.add_text(
            str(i), dxfattribs={"layer": "PRO_SCALE", "height": unit * 0.55}
        ).set_placement(
            (sb_x0 + i * seg_len, sb_y - unit * 0.9),
            align=TextEntityAlignment.MIDDLE_CENTER,
        )
    msp.add_text(
        "5 m  (1:100)",
        dxfattribs={"layer": "PRO_SCALE", "height": unit * 0.55},
    ).set_placement(
        (sb_x0 + 5 * seg_len + unit * 0.5, sb_y + seg_h * 0.5),
        align=TextEntityAlignment.LEFT,
    )

    doc.saveas(OUT)
    print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
