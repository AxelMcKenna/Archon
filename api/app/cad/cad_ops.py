"""Validate and apply proposed-change ops to a DXF.

The op verbs are defined in `api/data/cad_ops.schema.json`. The Pydantic
models here are the runtime gate — anything outside this set is rejected
before it ever touches ezdxf.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, ValidationError


class MoveEntity(BaseModel):
    op: Literal["move_entity"]
    handle: str
    dx: float
    dy: float


class OffsetPolyline(BaseModel):
    op: Literal["offset_polyline"]
    handle: str
    distance: float
    side: Literal["left", "right"] = "right"


class ResizeBlock(BaseModel):
    op: Literal["resize_block"]
    handle: str
    scale_x: float | None = None
    scale_y: float | None = None


class AddDimension(BaseModel):
    op: Literal["add_dimension"]
    from_handle: str
    to_handle: str
    offset: float = 100.0


class AddTextNote(BaseModel):
    op: Literal["add_text_note"]
    anchor_handle: str
    text: str = Field(max_length=200)
    dx: float = 0.0
    dy: float = 0.0
    height: float = 100.0


class ChangeLayer(BaseModel):
    op: Literal["change_layer"]
    handle: str
    layer: str


SnapKind = Literal["endpoint", "midpoint", "center", "intersection"]

# Attributes a `set_attribute` op may write. Anything else is rejected.
_SETTABLE = {"layer", "text", "height", "color"}


class DeleteEntity(BaseModel):
    op: Literal["delete_entity"]
    handle: str


class SetAttribute(BaseModel):
    op: Literal["set_attribute"]
    handle: str
    key: Literal["layer", "text", "height", "color"]
    value: str | float


class PlaceSymbol(BaseModel):
    op: Literal["place_symbol"]
    symbol: Literal[
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
    ]
    anchor_handle: str | None = None
    # Feature-relative placement (preferred): snap to a feature on the anchor
    # entity, then push `offset_mm` perpendicular to it (into the room). Falls
    # back to absolute (x, y) when no anchor is given.
    snap: SnapKind | None = None
    offset_mm: float = 0.0
    x: float | None = None
    y: float | None = None
    label: str | None = Field(default=None, max_length=80)


Op = Annotated[
    MoveEntity
    | OffsetPolyline
    | ResizeBlock
    | AddDimension
    | AddTextNote
    | ChangeLayer
    | PlaceSymbol
    | DeleteEntity
    | SetAttribute,
    Field(discriminator="op"),
]


@dataclass
class OpDelta:
    """Handles touched by an apply pass — lets the client reconcile its scene
    without a full reload. ``added``/``removed``/``changed`` are disjoint."""

    added: list[str]
    removed: list[str]
    changed: list[str]

    def to_dict(self) -> dict[str, list[str]]:
        return {"added": self.added, "removed": self.removed, "changed": self.changed}


class OpEnvelope(BaseModel):
    op: Op


def parse_ops(raw: list[dict[str, Any]]) -> list[Op]:
    """Validate a list of op dicts; raises on anything outside the verb list."""
    parsed: list[Op] = []
    for i, item in enumerate(raw):
        try:
            parsed.append(OpEnvelope(op=item).op)
        except ValidationError as e:
            raise ValueError(f"op[{i}] invalid: {e}") from e
    return parsed


def _serialize(doc: Any) -> bytes:
    out = io.StringIO()
    doc.write(out)
    return out.getvalue().encode("utf-8")


def apply_ops(dxf_bytes: bytes, ops: list[Op]) -> bytes:
    """Apply ops to a DXF, return the revised DXF bytes."""
    from app.cad.cad_loader import load_dxf

    doc = load_dxf(dxf_bytes)
    _apply(doc, ops)
    return _serialize(doc)


def apply_ops_with_delta(dxf_bytes: bytes, ops: list[Op]) -> tuple[bytes, OpDelta]:
    """Apply ops and return (revised DXF bytes, handle delta) so a client can
    reconcile its scene without a full reload."""
    from app.cad.cad_loader import load_dxf

    doc = load_dxf(dxf_bytes)
    delta = _apply(doc, ops)
    return _serialize(doc), delta


def _apply(doc: Any, ops: list[Op]) -> OpDelta:
    msp = doc.modelspace()

    # Delta tracking — snapshot handles before; added entities are diffed at
    # the end, deletes/edits are recorded explicitly as ops execute.
    before_handles = {e.dxf.handle for e in msp}
    changed_handles: set[str] = set()
    removed_handles: set[str] = set()

    def _by_handle(h: str):
        ent = doc.entitydb.get(h)
        if ent is None:
            raise ValueError(f"handle {h!r} not found")
        return ent

    # Drawing extents — used to park notes in the right margin so they
    # don't overlap drawing content.
    from ezdxf import bbox as _bbox

    _ext = _bbox.extents(msp, fast=True)
    if _ext.has_data:
        ext_x0, ext_y0 = _ext.extmin.x, _ext.extmin.y
        ext_x1, ext_y1 = _ext.extmax.x, _ext.extmax.y
    else:
        ext_x0, ext_y0, ext_x1, ext_y1 = 0.0, 0.0, 1000.0, 1000.0
    drawing_w = max(ext_x1 - ext_x0, 1.0)
    drawing_h = max(ext_y1 - ext_y0, 1.0)

    def _anchor_bbox(entity: Any) -> tuple[float, float, float, float]:
        b = _bbox.extents([entity])
        if b.has_data:
            return (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)
        x, y = _anchor_point(entity)
        return (x, y, x, y)

    # Pick a text height that matches the drawing's existing typography.
    # Strategy:
    #  1. If the note's anchor is itself a TEXT/MTEXT, copy its height.
    #  2. Otherwise use the median height across the drawing's TEXT entities
    #     (so we match the body-text size, not the title block).
    text_heights: list[float] = []
    for e in msp:
        if e.dxftype() in ("TEXT", "MTEXT"):
            h = float(getattr(e.dxf, "height", 0) or 0)
            if 0.001 < h < 1e6:
                text_heights.append(h)
    text_heights.sort()
    median_text_height = (
        text_heights[len(text_heights) // 2] if text_heights else None
    )

    def _note_height(anchor: Any) -> float:
        if anchor.dxftype() in ("TEXT", "MTEXT"):
            h = float(getattr(anchor.dxf, "height", 0) or 0)
            if h > 0:
                return h
        if median_text_height:
            return median_text_height
        # Fallback: 0.5% of the drawing's larger model dimension.
        try:
            from ezdxf import bbox as _bbox

            b = _bbox.extents(msp, fast=True)
            if b.has_data:
                w = b.extmax.x - b.extmin.x
                h = b.extmax.y - b.extmin.y
                return max(w, h) * 0.005
        except Exception:
            pass
        return 100.0

    # ── Existing-content obstacle index ────────────────────────────────
    # We only treat visually-meaningful entities as obstacles for new
    # placements. Walls are LINE/LWPOLYLINE — annotations sit on top of
    # white space inside rooms, not on top of walls, so we don't want to
    # avoid every wall segment. The visual clash points are existing
    # text labels, dimensions, and block inserts (fixtures).
    obstacle_rects: list[tuple[float, float, float, float]] = []
    for e in msp:
        if e.dxftype() in ("TEXT", "MTEXT", "DIMENSION", "INSERT"):
            bb = _anchor_bbox(e)
            if bb[2] - bb[0] > 1e-6 and bb[3] - bb[1] > 1e-6:
                obstacle_rects.append(bb)
    placed_rects: list[tuple[float, float, float, float]] = []

    def _overlaps(a, b):
        return not (
            a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3]
        )

    def _find_clear(
        anchor_bb: tuple[float, float, float, float],
        target_w: float,
        target_h: float,
        *,
        prefer: str = "below",
    ) -> tuple[float, float]:
        """Return (x0, y0) for a target_w × target_h rectangle near
        `anchor_bb`, preferring positions that don't overlap any
        obstacle. Best-fit: among all clear candidates, pick the one
        closest to the anchor. This avoids both the "jumped too far" and
        "first-fit landed on a clash" failure modes.
        """
        ax0, ay0, ax1, ay1 = anchor_bb
        acx, acy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
        gap = max(target_w, target_h) * 0.15

        # Dense radial candidate grid covering 8 directions × multiple
        # radii, plus the original "stack below" column. The directional
        # bias is encoded as a small multiplicative penalty per direction.
        candidates: list[tuple[float, float, float]] = []
        # (x0, y0, dir_penalty)

        radii = [1.0, 1.5, 2.0, 2.8, 4.0, 6.0, 9.0]
        # Eight clock positions around the anchor, in (dx, dy, penalty).
        if prefer == "below":
            dirs = [
                (0.0, -1.0, 1.0),    # below — preferred
                (0.5, -1.0, 1.05),   # below-right
                (-0.5, -1.0, 1.05),  # below-left
                (1.0, 0.0, 1.4),     # right
                (-1.0, 0.0, 1.4),    # left
                (0.5, 1.0, 1.8),     # above-right
                (-0.5, 1.0, 1.8),    # above-left
                (0.0, 1.0, 1.6),     # above
            ]
        else:  # "near"
            dirs = [
                (1.0, 0.0, 1.0),     # right — preferred
                (0.0, -1.0, 1.05),   # below
                (-1.0, 0.0, 1.1),    # left
                (1.0, -0.6, 1.15),   # below-right
                (-1.0, -0.6, 1.2),   # below-left
                (0.0, 1.0, 1.4),     # above
                (1.0, 0.6, 1.5),     # above-right
                (-1.0, 0.6, 1.5),    # above-left
            ]

        for r in radii:
            step = max(target_w, target_h) * r
            for dx, dy, pen in dirs:
                # Place rect's centre offset from the anchor's centre
                # by `step` in the chosen direction.
                cx = acx + dx * (step + (ax1 - ax0) / 2 + gap)
                cy = acy + dy * (step + (ay1 - ay0) / 2 + gap)
                x0 = cx - target_w / 2
                y0 = cy - target_h / 2
                candidates.append((x0, y0, pen))

        best: tuple[float, float] | None = None
        best_score = float("inf")
        for x0, y0, pen in candidates:
            rect = (x0, y0, x0 + target_w, y0 + target_h)
            if any(_overlaps(rect, o) for o in obstacle_rects):
                continue
            if any(_overlaps(rect, o) for o in placed_rects):
                continue
            cx = x0 + target_w / 2
            cy = y0 + target_h / 2
            dist = ((cx - acx) ** 2 + (cy - acy) ** 2) ** 0.5
            score = dist * pen
            if score < best_score:
                best = (x0, y0)
                best_score = score
        if best is not None:
            return best
        # Nothing clear in any candidate — return a position straight below
        # at one footprint distance. Better to clash mildly with the
        # anchor's neighbourhood than to fly far across the drawing.
        return (ax0, ay0 - gap - target_h)

    def _est_text_w(text: str, h: float) -> float:
        # Rough mono-ish estimate at 0.6× height per char.
        return max(len(text), 8) * h * 0.6

    # ── Pre-compute text-note placements ───────────────────────────────
    text_notes: list[AddTextNote] = [op for op in ops if isinstance(op, AddTextNote)]
    placements: dict[int, tuple[float, float, float, float, float]] = {}
    # id(op) -> (text_x, text_y, anchor_left, anchor_bottom, height)
    if text_notes:
        # Sort top → bottom so collisions push downward (predictable).
        notes_with_anchor = [
            (n, _anchor_bbox(_by_handle(n.anchor_handle))) for n in text_notes
        ]
        notes_with_anchor.sort(key=lambda t: -((t[1][1] + t[1][3]) / 2))

        for n, ab in notes_with_anchor:
            anchor = _by_handle(n.anchor_handle)
            h = _note_height(anchor)
            tw = _est_text_w(n.text, h)
            th = h * 1.2
            tx, ty_bottom = _find_clear(ab, tw, th, prefer="below")
            # set_placement uses the baseline; the rect's top is roughly
            # `ty_bottom + th`, baseline ≈ ty_bottom + (th - ascender).
            ty = ty_bottom + th * 0.15
            placed_rects.append((tx, ty_bottom, tx + tw, ty_bottom + th))
            placements[id(n)] = (tx, ty, ab[0], ab[1], h)

    ext_cx = (ext_x0 + ext_x1) / 2
    ext_cy = (ext_y0 + ext_y1) / 2

    for op in ops:
        if isinstance(op, MoveEntity):
            ent = _by_handle(op.handle)
            ent.translate(op.dx, op.dy, 0)
            changed_handles.add(op.handle)
        elif isinstance(op, DeleteEntity):
            ent = _by_handle(op.handle)
            msp.delete_entity(ent)
            removed_handles.add(op.handle)
        elif isinstance(op, SetAttribute):
            ent = _by_handle(op.handle)
            _set_attribute(doc, ent, op.key, op.value)
            changed_handles.add(op.handle)
        elif isinstance(op, OffsetPolyline):
            ent = _by_handle(op.handle)
            changed_handles.add(op.handle)
            if ent.dxftype() != "LWPOLYLINE":
                raise ValueError(f"offset_polyline requires LWPOLYLINE, got {ent.dxftype()}")
            d = op.distance if op.side == "right" else -op.distance
            offset = list(ent.virtual_entities()) if False else None  # placeholder
            # ezdxf provides offset via .vertices; use simple normal offset for closed polys
            pts = [(p[0], p[1]) for p in ent.get_points("xy")]
            ent.set_points([(x, y + d) for (x, y) in pts])
            del offset
        elif isinstance(op, ResizeBlock):
            ent = _by_handle(op.handle)
            if op.scale_x is not None:
                ent.dxf.xscale = op.scale_x
            if op.scale_y is not None:
                ent.dxf.yscale = op.scale_y
            changed_handles.add(op.handle)
        elif isinstance(op, AddDimension):
            a = _by_handle(op.from_handle)
            b = _by_handle(op.to_handle)
            ax, ay = _anchor_point(a)
            bx, by = _anchor_point(b)
            msp.add_aligned_dim(
                p1=(ax, ay),
                p2=(bx, by),
                distance=op.offset,
            ).render()
        elif isinstance(op, AddTextNote):
            text_x, text_y, anchor_left, anchor_bottom, height = placements[id(op)]
            msp.add_text(
                op.text,
                dxfattribs={"height": height, "layer": "NOTES"},
            ).set_placement((text_x, text_y))

            # Short tick connecting the anchor's bottom-left to the note,
            # only drawn when the note had to be pushed >1 line below the
            # anchor (e.g. due to collision avoidance with siblings).
            gap = anchor_bottom - text_y
            if gap > height * 1.5:
                msp.add_line(
                    (anchor_left, anchor_bottom),
                    (text_x, text_y + height),
                    dxfattribs={"layer": "NOTES"},
                )
        elif isinstance(op, PlaceSymbol):
            from app.cad.cad_symbols import draw_symbol, footprint

            unit = median_text_height or max(drawing_w, drawing_h) * 0.005
            fp_w, fp_h = footprint(op.symbol, has_label=bool(op.label))
            sym_w = unit * fp_w
            sym_h = unit * fp_h

            if op.anchor_handle and op.snap:
                # Feature-relative: snap to a feature on the anchor, push
                # offset_mm perpendicular, then sibling-collision nudge.
                anchor = _by_handle(op.anchor_handle)
                bx, by = _resolve_anchor_snap(
                    anchor, op.snap, op.offset_mm, (ext_cx, ext_cy)
                )
                ab = (bx - sym_w / 2, by - sym_h / 2, bx + sym_w / 2, by + sym_h / 2)
                cx, cy = _find_clear(ab, sym_w, sym_h, prefer="near")
                sx, sy = cx + sym_w / 2, cy + sym_h / 2
            elif op.x is not None and op.y is not None:
                # Caller-specified coordinates: trust them but still check
                # for sibling collision and nudge if needed.
                sx, sy = op.x, op.y
                ab = (sx - sym_w / 2, sy - sym_h / 2, sx + sym_w / 2, sy + sym_h / 2)
                # Treat the requested centre as the anchor for collision search.
                cx, cy = _find_clear(ab, sym_w, sym_h, prefer="near")
                sx, sy = cx + sym_w / 2, cy + sym_h / 2
            elif op.anchor_handle:
                anchor = _by_handle(op.anchor_handle)
                ab = _anchor_bbox(anchor)
                cx, cy = _find_clear(ab, sym_w, sym_h, prefer="near")
                sx, sy = cx + sym_w / 2, cy + sym_h / 2
            else:
                raise ValueError(
                    "place_symbol requires either (x, y) or anchor_handle"
                )

            placed_rects.append((sx - sym_w / 2, sy - sym_h / 2, sx + sym_w / 2, sy + sym_h / 2))
            if "SYMBOLS" not in doc.layers:
                doc.layers.add("SYMBOLS")
            draw_symbol(
                msp,
                kind=op.symbol,
                x=sx,
                y=sy,
                unit=unit,
                label=op.label,
            )
        elif isinstance(op, ChangeLayer):
            ent = _by_handle(op.handle)
            if op.layer not in doc.layers:
                doc.layers.add(op.layer)
            ent.dxf.layer = op.layer
            changed_handles.add(op.handle)

    after_handles = {e.dxf.handle for e in msp}
    added = after_handles - before_handles
    removed = removed_handles | (before_handles - after_handles)
    changed = (changed_handles - added) - removed
    return OpDelta(
        added=sorted(added),
        removed=sorted(removed),
        changed=sorted(changed),
    )


def _set_attribute(doc: Any, ent: Any, key: str, value: Any) -> None:
    """Write a whitelisted attribute onto an entity."""
    if key == "layer":
        layer = str(value)
        if layer not in doc.layers:
            doc.layers.add(layer)
        ent.dxf.layer = layer
    elif key == "text":
        if ent.dxftype() == "MTEXT":
            ent.text = str(value)
        else:
            ent.dxf.text = str(value)
    elif key == "height":
        ent.dxf.height = float(value)
    elif key == "color":
        ent.dxf.color = int(value)
    else:  # pragma: no cover — guarded by the Pydantic Literal
        raise ValueError(f"unsettable attribute {key!r}")


def _resolve_anchor_snap(
    entity: Any,
    snap: str,
    offset_mm: float,
    center: tuple[float, float],
) -> tuple[float, float]:
    """Resolve a feature point on `entity` for the given snap kind, then push
    `offset_mm` perpendicular to the entity, oriented toward the model center
    (so a fixture lands inside the room, not in the wall)."""
    from math import hypot

    t = entity.dxftype()

    # Base feature point.
    if snap == "center" and t in ("CIRCLE", "ARC"):
        base = (entity.dxf.center.x, entity.dxf.center.y)
    elif snap == "midpoint" and t == "LINE":
        s, e = entity.dxf.start, entity.dxf.end
        base = ((s.x + e.x) / 2, (s.y + e.y) / 2)
    elif snap == "endpoint" and t == "LINE":
        base = (entity.dxf.start.x, entity.dxf.start.y)
    else:
        base = _anchor_point(entity)

    # Perpendicular direction (LINE normal; default +y otherwise).
    nx, ny = 0.0, 1.0
    if t == "LINE":
        s, e = entity.dxf.start, entity.dxf.end
        dx, dy = e.x - s.x, e.y - s.y
        L = hypot(dx, dy)
        if L > 1e-9:
            nx, ny = -dy / L, dx / L
    # Orient toward the model center.
    if (center[0] - base[0]) * nx + (center[1] - base[1]) * ny < 0:
        nx, ny = -nx, -ny
    return (base[0] + nx * offset_mm, base[1] + ny * offset_mm)


def _anchor_point(entity: Any) -> tuple[float, float]:
    """Pick a representative point for an entity (used for dim/text anchoring)."""
    t = entity.dxftype()
    if t == "LINE":
        return (entity.dxf.start.x, entity.dxf.start.y)
    if t in ("TEXT", "MTEXT", "INSERT"):
        return (entity.dxf.insert.x, entity.dxf.insert.y)
    if t == "CIRCLE" or t == "ARC":
        return (entity.dxf.center.x, entity.dxf.center.y)
    if t == "LWPOLYLINE":
        pts = list(entity.get_points("xy"))
        if pts:
            return (pts[0][0], pts[0][1])
    # Fallback: bbox centroid
    from ezdxf import bbox as _bbox

    b = _bbox.extents([entity])
    if b.has_data:
        return ((b.extmin.x + b.extmax.x) / 2, (b.extmin.y + b.extmax.y) / 2)
    return (0.0, 0.0)
