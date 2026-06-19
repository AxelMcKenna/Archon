"""Scene projection — the engine↔client contract.

``project_scene(doc)`` walks a DXF and emits a compact, render-ready JSON
scene: per-entity geometry the browser can draw + hit-test, a flat list of
snap targets (endpoints / midpoints / centers / intersections) that feeds the
client's spatial index, and the model-space extents/units needed to map
model↔screen.

This is a superset of ``cad_loader.summarise`` (which is tuned for the LLM and
caps entity count). The scene is for *humans* editing geometry, so it keeps
draw geometry and snap points rather than text-bearing summaries.

Versioned: bump ``SCENE_VERSION`` on any breaking shape change.
"""

from __future__ import annotations

from typing import Any

from ezdxf.document import Drawing

SCENE_VERSION = "scene/v1"

# ezdxf $INSUNITS code → human label. Only the ones we actually see on NZ
# residential plans; everything else is reported as the raw code.
_INSUNITS = {
    0: "unitless",
    1: "in",
    2: "ft",
    4: "mm",
    5: "cm",
    6: "m",
}

# Computing all pairwise LINE intersections is O(n²). Above this many LINE
# entities we skip intersection snaps (endpoints/midpoints still carry the
# precision that matters); the client never relies on intersections existing.
_MAX_LINES_FOR_INTERSECTIONS = 400

# Snap coordinates are deduped at this rounding (model units, typically mm).
_SNAP_ROUND = 3

# Snap kind priority when two kinds land on the same coordinate (lower wins).
_SNAP_PRIORITY = {"endpoint": 0, "center": 1, "intersection": 2, "midpoint": 3}


def _units(doc: Drawing) -> str:
    try:
        code = int(doc.header.get("$INSUNITS", 0))
    except Exception:
        code = 0
    return _INSUNITS.get(code, f"code:{code}")


def _bbox_of(entity: Any) -> list[float] | None:
    try:
        from ezdxf import bbox as _bbox

        b = _bbox.extents([entity])
        if not b.has_data:
            return None
        return [b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y]
    except Exception:
        return None


def _arc_point(cx: float, cy: float, r: float, angle_deg: float) -> tuple[float, float]:
    from math import cos, radians, sin

    a = radians(angle_deg)
    return (cx + r * cos(a), cy + r * sin(a))


def _seg_intersection(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    p4: tuple[float, float],
) -> tuple[float, float] | None:
    """Intersection of segments p1p2 and p3p4, or None if they don't cross
    within both segments (parallel/collinear returns None)."""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom
    if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return None


class _SnapAccumulator:
    """Collects snap points, deduping by rounded (x, y). When two kinds hit
    the same coordinate the higher-priority kind wins (endpoint > center >
    intersection > midpoint)."""

    def __init__(self) -> None:
        self._by_xy: dict[tuple[float, float], dict[str, Any]] = {}

    def add(self, x: float, y: float, kind: str, handle: str | None) -> None:
        key = (round(x, _SNAP_ROUND), round(y, _SNAP_ROUND))
        existing = self._by_xy.get(key)
        if existing is None:
            self._by_xy[key] = {"x": key[0], "y": key[1], "kind": kind, "handle": handle}
            return
        if _SNAP_PRIORITY.get(kind, 99) < _SNAP_PRIORITY.get(existing["kind"], 99):
            existing["kind"] = kind
            existing["handle"] = handle

    def to_list(self) -> list[dict[str, Any]]:
        return list(self._by_xy.values())


def _entity_geometry(e: Any) -> dict[str, Any] | None:
    """Render geometry for an entity, plus the raw points used for snapping.

    Returns a dict with at least ``type``; geometry keys mirror
    ``cad_loader.summarise`` so the client and the LLM agree on shapes.
    """
    t = e.dxftype()
    if t == "LINE":
        s, end = e.dxf.start, e.dxf.end
        return {"start": [s.x, s.y], "end": [end.x, end.y]}
    if t == "LWPOLYLINE":
        return {
            "points": [[p[0], p[1]] for p in e.get_points("xy")],
            "closed": bool(e.closed),
        }
    if t == "POLYLINE":
        return {"points": [[v.dxf.location.x, v.dxf.location.y] for v in e.vertices]}
    if t == "CIRCLE":
        return {"center": [e.dxf.center.x, e.dxf.center.y], "radius": e.dxf.radius}
    if t == "ARC":
        return {
            "center": [e.dxf.center.x, e.dxf.center.y],
            "radius": e.dxf.radius,
            "start_angle": e.dxf.start_angle,
            "end_angle": e.dxf.end_angle,
        }
    if t in ("TEXT", "MTEXT"):
        from app.cad.cad_loader import _clean_dxf_text

        txt = getattr(e.dxf, "text", None) or getattr(e, "text", "")
        if t == "MTEXT" and hasattr(e, "plain_text"):
            txt = e.plain_text()
        ins = getattr(e.dxf, "insert", None)
        return {
            "text": _clean_dxf_text(txt or ""),
            "insert": [ins.x, ins.y] if ins is not None else None,
            "height": float(getattr(e.dxf, "height", 0) or 0),
        }
    if t == "INSERT":
        ins = e.dxf.insert
        return {
            "block": e.dxf.name,
            "insert": [ins.x, ins.y],
            "scale": [
                float(getattr(e.dxf, "xscale", 1.0)),
                float(getattr(e.dxf, "yscale", 1.0)),
            ],
            "rotation": float(getattr(e.dxf, "rotation", 0.0)),
        }
    if t == "DIMENSION":
        return {"measurement": float(getattr(e, "measurement", 0.0) or 0.0)}
    return None


def _collect_snaps(e: Any, geom: dict[str, Any], snaps: _SnapAccumulator) -> None:
    """Add an entity's endpoint/midpoint/center snap targets."""
    t = e.dxftype()
    h = e.dxf.handle

    def _mid(a: list[float], b: list[float]) -> tuple[float, float]:
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    if t == "LINE":
        s, en = geom["start"], geom["end"]
        snaps.add(s[0], s[1], "endpoint", h)
        snaps.add(en[0], en[1], "endpoint", h)
        mx, my = _mid(s, en)
        snaps.add(mx, my, "midpoint", h)
    elif t in ("LWPOLYLINE", "POLYLINE"):
        pts = geom.get("points") or []
        for p in pts:
            snaps.add(p[0], p[1], "endpoint", h)
        ring = pts + ([pts[0]] if geom.get("closed") and pts else [])
        for a, b in zip(ring, ring[1:]):
            mx, my = _mid(a, b)
            snaps.add(mx, my, "midpoint", h)
    elif t == "CIRCLE":
        c = geom["center"]
        snaps.add(c[0], c[1], "center", h)
    elif t == "ARC":
        c, r = geom["center"], geom["radius"]
        snaps.add(c[0], c[1], "center", h)
        sx, sy = _arc_point(c[0], c[1], r, geom["start_angle"])
        ex, ey = _arc_point(c[0], c[1], r, geom["end_angle"])
        snaps.add(sx, sy, "endpoint", h)
        snaps.add(ex, ey, "endpoint", h)
    elif t == "INSERT":
        ins = geom["insert"]
        snaps.add(ins[0], ins[1], "endpoint", h)


def project_scene(doc: Drawing) -> dict[str, Any]:
    """Walk modelspace → render-ready scene dict (see ``SCENE_VERSION``)."""
    from app.cad.cad_loader import model_extents

    msp = doc.modelspace()
    entities: list[dict[str, Any]] = []
    snaps = _SnapAccumulator()
    line_segments: list[tuple[tuple[float, float], tuple[float, float]]] = []

    for e in msp:
        t = e.dxftype()
        geom = _entity_geometry(e)
        if geom is None:
            continue
        ent: dict[str, Any] = {
            "handle": e.dxf.handle,
            "type": t,
            "layer": getattr(e.dxf, "layer", "") or "",
            "bbox": _bbox_of(e),
        }
        ent.update(geom)
        entities.append(ent)
        _collect_snaps(e, geom, snaps)
        if t == "LINE":
            line_segments.append(
                ((geom["start"][0], geom["start"][1]), (geom["end"][0], geom["end"][1]))
            )

    # Intersection snaps — bounded to avoid O(n²) blow-up on busy drawings.
    if len(line_segments) <= _MAX_LINES_FOR_INTERSECTIONS:
        for i in range(len(line_segments)):
            a1, a2 = line_segments[i]
            for j in range(i + 1, len(line_segments)):
                b1, b2 = line_segments[j]
                pt = _seg_intersection(a1, a2, b1, b2)
                if pt is not None:
                    snaps.add(pt[0], pt[1], "intersection", None)

    x0, y0, x1, y1 = model_extents(doc)
    return {
        "version": SCENE_VERSION,
        "units": _units(doc),
        "extents": [x0, y0, x1, y1],
        "entities": entities,
        "snaps": snaps.to_list(),
    }
