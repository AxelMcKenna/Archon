"""Procedural drafting symbols.

Each symbol is built from primitives (circles, lines, text, polylines) at
apply-time, sized relative to the drawing's typography. Callers pass an
anchor point and a `unit` (typically the drawing's median text height);
the symbol's visual size scales with that unit so it looks at home
regardless of whether the drawing is in mm or feet.

Symbol kinds are grouped:
  Fire & life safety: smoke_alarm, heat_detector, sprinkler,
    fire_extinguisher, emergency_light, exit_sign
  Electrical:         gpo, gpo_double, light_fitting, light_switch,
                      data_outlet, tv_outlet
  Plumbing fixtures:  toilet, basin, shower, bath, kitchen_sink,
                      hot_water_cylinder
  Mechanical:         mechanical_extract, thermostat
  Accessibility:      accessible
"""

from __future__ import annotations

from typing import Literal

from ezdxf.enums import TextEntityAlignment
from ezdxf.layouts import BaseLayout

SymbolKind = Literal[
    # fire & life safety
    "smoke_alarm",
    "heat_detector",
    "sprinkler",
    "fire_extinguisher",
    "emergency_light",
    "exit_sign",
    # electrical
    "gpo",
    "gpo_double",
    "light_fitting",
    "light_switch",
    "data_outlet",
    "tv_outlet",
    # plumbing fixtures
    "toilet",
    "basin",
    "shower",
    "bath",
    "kitchen_sink",
    "hot_water_cylinder",
    # mechanical
    "mechanical_extract",
    "thermostat",
    # accessibility
    "accessible",
]

VALID_SYMBOLS: set[str] = {
    "smoke_alarm",
    "heat_detector",
    "sprinkler",
    "fire_extinguisher",
    "emergency_light",
    "exit_sign",
    "gpo",
    "gpo_double",
    "light_fitting",
    "light_switch",
    "data_outlet",
    "tv_outlet",
    "toilet",
    "basin",
    "shower",
    "bath",
    "kitchen_sink",
    "hot_water_cylinder",
    "mechanical_extract",
    "thermostat",
    "accessible",
}


def draw_symbol(
    msp: BaseLayout,
    *,
    kind: str,
    x: float,
    y: float,
    unit: float,
    label: str | None = None,
    layer: str = "SYMBOLS",
) -> None:
    """Place a symbol of the given kind at (x, y), sized in `unit`."""
    fn = _DISPATCH.get(kind)
    if fn is None:
        raise ValueError(f"unknown symbol {kind!r}")
    fn(msp, x, y, unit, layer)
    if label:
        _label(msp, x, y, unit, label, layer, _LABEL_OFFSET.get(kind, 1.4))


# ── helpers ────────────────────────────────────────────────────────────


def _circle(msp, x, y, r, layer):
    msp.add_circle((x, y), radius=r, dxfattribs={"layer": layer})


def _line(msp, x0, y0, x1, y1, layer):
    msp.add_line((x0, y0), (x1, y1), dxfattribs={"layer": layer})


def _rect(msp, x0, y0, x1, y1, layer):
    msp.add_lwpolyline(
        [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)],
        dxfattribs={"layer": layer},
    )


def _txt(msp, x, y, h, text, layer, align=TextEntityAlignment.MIDDLE_CENTER):
    msp.add_text(text, dxfattribs={"layer": layer, "height": h}).set_placement(
        (x, y), align=align
    )


def _label(msp, x, y, unit, text, layer, offset_x_mult: float):
    _txt(
        msp,
        x + unit * offset_x_mult,
        y,
        unit * 0.7,
        text,
        layer,
        align=TextEntityAlignment.LEFT,
    )


# ── fire & life safety ─────────────────────────────────────────────────


def _smoke_alarm(msp, x, y, unit, layer):
    """Standard smoke detector: circle with horizontal divider + 'SD'."""
    r = unit * 1.6
    _circle(msp, x, y, r, layer)
    _line(msp, x - r, y, x + r, y, layer)
    _txt(msp, x, y + r * 0.35, unit * 0.9, "SD", layer)


def _heat_detector(msp, x, y, unit, layer):
    r = unit * 1.6
    _circle(msp, x, y, r, layer)
    _line(msp, x - r, y, x + r, y, layer)
    _txt(msp, x, y + r * 0.35, unit * 0.9, "HD", layer)


def _sprinkler(msp, x, y, unit, layer):
    r = unit * 1.4
    _circle(msp, x, y, r, layer)
    _line(msp, x - r * 0.7, y, x + r * 0.7, y, layer)
    _line(msp, x, y - r * 0.7, x, y + r * 0.7, layer)


def _fire_extinguisher(msp, x, y, unit, layer):
    w, h = unit * 1.4, unit * 2.2
    _rect(msp, x - w / 2, y - h / 2, x + w / 2, y + h / 2, layer)
    _txt(msp, x, y, unit * 0.7, "FE", layer)


def _emergency_light(msp, x, y, unit, layer):
    w = unit * 2.0
    _rect(msp, x - w / 2, y - w / 2, x + w / 2, y + w / 2, layer)
    _txt(msp, x, y, unit * 0.75, "EM", layer)


def _exit_sign(msp, x, y, unit, layer):
    w, h = unit * 4.0, unit * 1.6
    _rect(msp, x - w / 2, y - h / 2, x + w / 2, y + h / 2, layer)
    _txt(msp, x, y, h * 0.55, "EXIT", layer)


# ── electrical ─────────────────────────────────────────────────────────


def _gpo(msp, x, y, unit, layer):
    """Single GPO: small circle with two short verticals (NZ convention)."""
    r = unit * 1.0
    _circle(msp, x, y, r, layer)
    _line(msp, x - r * 0.35, y - r * 0.45, x - r * 0.35, y + r * 0.45, layer)
    _line(msp, x + r * 0.35, y - r * 0.45, x + r * 0.35, y + r * 0.45, layer)


def _gpo_double(msp, x, y, unit, layer):
    """Double GPO: circle with four verticals."""
    r = unit * 1.1
    _circle(msp, x, y, r, layer)
    for dx in (-0.55, -0.18, 0.18, 0.55):
        _line(
            msp,
            x + r * dx,
            y - r * 0.45,
            x + r * dx,
            y + r * 0.45,
            layer,
        )


def _light_fitting(msp, x, y, unit, layer):
    """Ceiling light: circle with diagonal cross."""
    r = unit * 1.2
    _circle(msp, x, y, r, layer)
    d = r * 0.7
    _line(msp, x - d, y - d, x + d, y + d, layer)
    _line(msp, x - d, y + d, x + d, y - d, layer)


def _light_switch(msp, x, y, unit, layer):
    """Small 'S' tag inside a circle stub."""
    r = unit * 0.7
    _circle(msp, x, y, r, layer)
    _txt(msp, x, y, r * 0.9, "S", layer)


def _data_outlet(msp, x, y, unit, layer):
    w = unit * 1.4
    _rect(msp, x - w / 2, y - w / 2, x + w / 2, y + w / 2, layer)
    _txt(msp, x, y, unit * 0.7, "D", layer)


def _tv_outlet(msp, x, y, unit, layer):
    w = unit * 1.6
    _rect(msp, x - w / 2, y - w * 0.35, x + w / 2, y + w * 0.35, layer)
    _txt(msp, x, y, unit * 0.6, "TV", layer)


# ── plumbing fixtures (top-down plan view) ─────────────────────────────


def _toilet(msp, x, y, unit, layer):
    """Top-down WC: tank rectangle + bowl ellipse-ish."""
    tank_w, tank_h = unit * 3.0, unit * 1.5
    bowl_r = unit * 1.6
    # Tank to the rear (top in plan)
    _rect(msp, x - tank_w / 2, y, x + tank_w / 2, y + tank_h, layer)
    # Bowl in front
    _circle(msp, x, y - bowl_r * 0.4, bowl_r, layer)


def _basin(msp, x, y, unit, layer):
    """Top-down basin: rectangle with inset bowl."""
    w, h = unit * 4.0, unit * 2.5
    _rect(msp, x - w / 2, y - h / 2, x + w / 2, y + h / 2, layer)
    # Inset oval-ish bowl
    bw, bh = w * 0.7, h * 0.55
    _rect(msp, x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2, layer)


def _shower(msp, x, y, unit, layer):
    """Top-down shower: square with diagonal cross indicating drainage."""
    s = unit * 5.0
    _rect(msp, x - s / 2, y - s / 2, x + s / 2, y + s / 2, layer)
    _line(msp, x - s / 2, y - s / 2, x + s / 2, y + s / 2, layer)
    _line(msp, x - s / 2, y + s / 2, x + s / 2, y - s / 2, layer)


def _bath(msp, x, y, unit, layer):
    """Top-down bath: rectangle with inset tub."""
    w, h = unit * 9.0, unit * 4.0
    _rect(msp, x - w / 2, y - h / 2, x + w / 2, y + h / 2, layer)
    bw, bh = w * 0.85, h * 0.7
    _rect(msp, x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2, layer)
    # Drain end indicator
    _circle(msp, x - w * 0.35, y, unit * 0.4, layer)


def _kitchen_sink(msp, x, y, unit, layer):
    """Top-down double-bowl kitchen sink."""
    w, h = unit * 6.0, unit * 3.5
    _rect(msp, x - w / 2, y - h / 2, x + w / 2, y + h / 2, layer)
    bw, bh = w * 0.45, h * 0.7
    _rect(msp, x - w * 0.25 - bw / 2, y - bh / 2, x - w * 0.25 + bw / 2, y + bh / 2, layer)
    _rect(msp, x + w * 0.25 - bw / 2, y - bh / 2, x + w * 0.25 + bw / 2, y + bh / 2, layer)


def _hot_water_cylinder(msp, x, y, unit, layer):
    """HWC: circle with 'HWC' label inside."""
    r = unit * 2.0
    _circle(msp, x, y, r, layer)
    _txt(msp, x, y, unit * 0.85, "HWC", layer)


# ── mechanical ─────────────────────────────────────────────────────────


def _mechanical_extract(msp, x, y, unit, layer):
    """Extract fan: circle with upward arrow."""
    r = unit * 1.3
    _circle(msp, x, y, r, layer)
    # Upward arrow
    _line(msp, x, y - r * 0.6, x, y + r * 0.6, layer)
    _line(msp, x - r * 0.3, y + r * 0.2, x, y + r * 0.6, layer)
    _line(msp, x + r * 0.3, y + r * 0.2, x, y + r * 0.6, layer)


def _thermostat(msp, x, y, unit, layer):
    w = unit * 1.6
    _rect(msp, x - w / 2, y - w * 0.5, x + w / 2, y + w * 0.5, layer)
    _txt(msp, x, y, unit * 0.7, "T", layer)


# ── accessibility ──────────────────────────────────────────────────────


def _accessible(msp, x, y, unit, layer):
    """Stylised accessibility badge: circle with 'A' (international symbol
    proper requires a wheelchair pictogram which is too detailed for
    procedural generation; the badge convention is acceptable)."""
    r = unit * 1.5
    _circle(msp, x, y, r, layer)
    _txt(msp, x, y, unit * 1.1, "♿", layer)


# ── dispatch table ─────────────────────────────────────────────────────

_DISPATCH = {
    "smoke_alarm": _smoke_alarm,
    "heat_detector": _heat_detector,
    "sprinkler": _sprinkler,
    "fire_extinguisher": _fire_extinguisher,
    "emergency_light": _emergency_light,
    "exit_sign": _exit_sign,
    "gpo": _gpo,
    "gpo_double": _gpo_double,
    "light_fitting": _light_fitting,
    "light_switch": _light_switch,
    "data_outlet": _data_outlet,
    "tv_outlet": _tv_outlet,
    "toilet": _toilet,
    "basin": _basin,
    "shower": _shower,
    "bath": _bath,
    "kitchen_sink": _kitchen_sink,
    "hot_water_cylinder": _hot_water_cylinder,
    "mechanical_extract": _mechanical_extract,
    "thermostat": _thermostat,
    "accessible": _accessible,
}

# How far to the right of the symbol's centre to place its label.
# Symbols with a wider footprint need a larger offset.
_LABEL_OFFSET = {
    "exit_sign": 2.5,
    "shower": 3.0,
    "bath": 5.0,
    "kitchen_sink": 3.5,
    "basin": 2.5,
    "hot_water_cylinder": 2.4,
}


# Each symbol's drawn footprint in `unit` multiples — (width, height).
# Used by the placement search to test for collisions accurately. Width
# is the bare symbol; the apply path adds extra width for an attached
# label.
FOOTPRINT: dict[str, tuple[float, float]] = {
    # fire & life safety
    "smoke_alarm": (3.2, 3.2),
    "heat_detector": (3.2, 3.2),
    "sprinkler": (2.8, 2.8),
    "fire_extinguisher": (1.4, 2.2),
    "emergency_light": (2.0, 2.0),
    "exit_sign": (4.0, 1.6),
    # electrical
    "gpo": (2.0, 2.0),
    "gpo_double": (2.2, 2.2),
    "light_fitting": (2.4, 2.4),
    "light_switch": (1.4, 1.4),
    "data_outlet": (1.4, 1.4),
    "tv_outlet": (1.6, 1.1),
    # plumbing fixtures (top-down)
    "toilet": (3.0, 3.5),
    "basin": (4.0, 2.5),
    "shower": (5.0, 5.0),
    "bath": (9.0, 4.0),
    "kitchen_sink": (6.0, 3.5),
    "hot_water_cylinder": (4.0, 4.0),
    # mechanical
    "mechanical_extract": (2.6, 2.6),
    "thermostat": (1.6, 0.8),
    # accessibility
    "accessible": (3.0, 3.0),
}


def footprint(kind: str, has_label: bool) -> tuple[float, float]:
    """Return (w, h) in `unit` multiples for the drawn symbol."""
    base = FOOTPRINT.get(kind, (3.0, 3.0))
    if has_label:
        # Labels extend ~6 chars worth to the right at 0.6 height each.
        return (base[0] + 5.0, base[1])
    return base
