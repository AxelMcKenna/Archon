"""Generate a tiny test DXF with planted RFI-bait issues.

Outputs `tmp/test-house.dxf` — a simple rectangular dwelling near a rear
boundary, with the setback dimension labelled at 2400 (under the 3000 council
minimum). Perfect for end-to-end testing of the CAD analyser.
"""

from __future__ import annotations

from pathlib import Path

import ezdxf

OUT = Path(__file__).resolve().parents[2] / "tmp" / "test-house.dxf"
OUT.parent.mkdir(exist_ok=True)


def main() -> None:
    doc = ezdxf.new(setup=True)
    doc.units = ezdxf.units.MM
    msp = doc.modelspace()

    for layer, colour in [
        ("BOUNDARY", 1),  # red
        ("WALLS", 7),     # white/black
        ("LABELS", 3),    # green
        ("DIMS", 4),      # cyan
    ]:
        if layer not in doc.layers:
            doc.layers.add(layer, color=colour)

    # Site rectangle: 20m × 25m
    site = [(0, 0), (20000, 0), (20000, 25000), (0, 25000), (0, 0)]
    msp.add_lwpolyline(site, dxfattribs={"layer": "BOUNDARY", "closed": True})

    # House: 12m × 10m, sitting near the REAR boundary (y=25000)
    # Rear wall at y=22600 → rear setback = 2400mm  (under 3000 minimum)
    house = [(4000, 5000), (16000, 5000), (16000, 22600), (4000, 22600), (4000, 5000)]
    msp.add_lwpolyline(house, dxfattribs={"layer": "WALLS", "closed": True})

    # Label the rooms (vector-text — what the analyser will read)
    msp.add_text(
        "GARAGE",
        dxfattribs={"layer": "LABELS", "height": 400},
    ).set_placement((5000, 7000))
    msp.add_text(
        "LIVING",
        dxfattribs={"layer": "LABELS", "height": 400},
    ).set_placement((10500, 12000))
    msp.add_text(
        "BEDROOM 1",
        dxfattribs={"layer": "LABELS", "height": 400},
    ).set_placement((5000, 18000))
    msp.add_text(
        "BEDROOM 2",
        dxfattribs={"layer": "LABELS", "height": 400},
    ).set_placement((11500, 18000))

    # The setback dim — explicitly labelled at 2400mm (the planted issue)
    msp.add_text(
        "REAR BOUNDARY 2400",
        dxfattribs={"layer": "DIMS", "height": 350},
    ).set_placement((6500, 23500))

    # Front setback (compliant — 5000mm)
    msp.add_text(
        "FRONT BOUNDARY 5000",
        dxfattribs={"layer": "DIMS", "height": 350},
    ).set_placement((6500, 2500))

    # Title block-ish
    msp.add_text(
        "PROPOSED DWELLING — 12 EXAMPLE STREET",
        dxfattribs={"layer": "LABELS", "height": 600},
    ).set_placement((1000, 26500))
    msp.add_text(
        "GROUND FLOOR PLAN  1:100",
        dxfattribs={"layer": "LABELS", "height": 450},
    ).set_placement((1000, 27500))

    doc.saveas(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
