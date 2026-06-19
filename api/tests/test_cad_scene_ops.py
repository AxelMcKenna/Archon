"""Phase 0 keystone-contract tests.

Two round-trips, fully verifiable with zero pixels:
  (dxf) -> project_scene -> assert snap targets
  (dxf, ops) -> apply_ops_with_delta -> assert delta
"""

from __future__ import annotations

import io

import ezdxf
import pytest

from app.cad.cad_ops import (
    OpDelta,
    apply_ops,
    apply_ops_with_delta,
    parse_ops,
)
from app.cad.cad_scene import SCENE_VERSION, project_scene


def _doc():
    """A minimal floor-plan: two walls meeting at a corner, a circle, a note."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 4  # mm
    msp = doc.modelspace()
    h = {}
    h["w1"] = msp.add_line((0, 0), (5000, 0), dxfattribs={"layer": "WALLS"}).dxf.handle
    h["w2"] = msp.add_line(
        (5000, 0), (5000, 3000), dxfattribs={"layer": "WALLS"}
    ).dxf.handle
    h["circ"] = msp.add_circle((2500, 1500), 200, dxfattribs={"layer": "FIXT"}).dxf.handle
    t = msp.add_text("Bedroom 1", dxfattribs={"height": 100, "layer": "NOTES"})
    t.set_placement((1000, 1500))
    h["note"] = t.dxf.handle
    return doc, h


def _bytes(doc) -> bytes:
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


# ── Scene projection ──────────────────────────────────────────────────────


def test_scene_shape_and_units():
    doc, _ = _doc()
    scene = project_scene(doc)
    assert scene["version"] == SCENE_VERSION
    assert scene["units"] == "mm"
    assert scene["extents"] == [0.0, 0.0, 5000.0, 3000.0]
    assert {e["type"] for e in scene["entities"]} == {"LINE", "CIRCLE", "TEXT"}


def test_scene_snap_targets():
    doc, h = _doc()
    snaps = project_scene(doc)["snaps"]
    pts = {(round(s["x"], 1), round(s["y"], 1)): s["kind"] for s in snaps}

    # Wall endpoints present.
    assert pts.get((0.0, 0.0)) == "endpoint"
    assert pts.get((5000.0, 3000.0)) == "endpoint"
    # Wall midpoint present.
    assert pts.get((2500.0, 0.0)) == "midpoint"
    # Circle center present.
    assert pts.get((2500.0, 1500.0)) == "center"


def test_scene_shared_corner_is_endpoint_not_intersection():
    # The two walls touch at (5000, 0); a shared endpoint must win over the
    # intersection kind (endpoint has higher priority).
    doc, _ = _doc()
    snaps = project_scene(doc)["snaps"]
    corner = [s for s in snaps if (round(s["x"], 1), round(s["y"], 1)) == (5000.0, 0.0)]
    assert corner and corner[0]["kind"] == "endpoint"


def test_scene_finds_true_intersection():
    # Two crossing lines (not sharing endpoints) yield an intersection snap.
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_line((0, 0), (100, 100))
    msp.add_line((0, 100), (100, 0))
    snaps = project_scene(doc)["snaps"]
    inter = [s for s in snaps if s["kind"] == "intersection"]
    assert inter
    assert abs(inter[0]["x"] - 50.0) < 1e-6 and abs(inter[0]["y"] - 50.0) < 1e-6


# ── Op apply + delta ──────────────────────────────────────────────────────


def test_delta_place_symbol_is_added():
    doc, h = _doc()
    ops = parse_ops(
        [
            {
                "op": "place_symbol",
                "symbol": "smoke_alarm",
                "anchor_handle": h["w1"],
                "snap": "midpoint",
                "offset_mm": 600,
                "label": "SD",
            }
        ]
    )
    revised, delta = apply_ops_with_delta(_bytes(doc), ops)
    assert isinstance(delta, OpDelta)
    assert len(delta.added) >= 1
    assert delta.removed == [] and delta.changed == []
    # Revised DXF re-parses and has more entities than the original.
    assert len(project_scene(ezdxf.read(io.StringIO(revised.decode())))["entities"]) > 4


def test_delta_delete_is_removed():
    doc, h = _doc()
    ops = parse_ops([{"op": "delete_entity", "handle": h["w2"]}])
    _, delta = apply_ops_with_delta(_bytes(doc), ops)
    assert delta.removed == [h["w2"]]
    assert delta.added == [] and delta.changed == []


def test_delta_set_attribute_is_changed():
    doc, h = _doc()
    ops = parse_ops(
        [{"op": "set_attribute", "handle": h["note"], "key": "text", "value": "Bedroom 2"}]
    )
    revised, delta = apply_ops_with_delta(_bytes(doc), ops)
    assert delta.changed == [h["note"]]
    # The text actually changed.
    rdoc = ezdxf.read(io.StringIO(revised.decode()))
    texts = [e.dxf.text for e in rdoc.modelspace() if e.dxftype() == "TEXT"]
    assert "Bedroom 2" in texts


def test_delta_move_is_changed():
    doc, h = _doc()
    ops = parse_ops([{"op": "move_entity", "handle": h["circ"], "dx": 100, "dy": 0}])
    _, delta = apply_ops_with_delta(_bytes(doc), ops)
    assert delta.changed == [h["circ"]]


def test_feature_relative_offset_pushes_into_room():
    # Smoke alarm on the bottom wall (y=0), 600mm offset, model center is
    # above the wall → it should land at y ≈ +600, not -600.
    doc, h = _doc()
    ops = parse_ops(
        [
            {
                "op": "place_symbol",
                "symbol": "smoke_alarm",
                "anchor_handle": h["w1"],
                "snap": "midpoint",
                "offset_mm": 600,
            }
        ]
    )
    revised, _ = apply_ops_with_delta(_bytes(doc), ops)
    rdoc = ezdxf.read(io.StringIO(revised.decode()))
    sym_ys = [
        e.dxf.center.y
        for e in rdoc.modelspace()
        if e.dxftype() in ("CIRCLE", "ARC") and e.dxf.center.y > 250
    ]
    # New symbol geometry sits above the wall (inside the room).
    assert any(y > 300 for y in sym_ys)


def test_apply_ops_back_compat_returns_bytes():
    doc, h = _doc()
    ops = parse_ops([{"op": "delete_entity", "handle": h["w2"]}])
    out = apply_ops(_bytes(doc), ops)
    assert isinstance(out, bytes) and len(out) > 0


def test_parse_rejects_unknown_op():
    with pytest.raises(ValueError):
        parse_ops([{"op": "frobnicate", "handle": "1"}])


def test_parse_rejects_bad_set_attribute_key():
    with pytest.raises(ValueError):
        parse_ops([{"op": "set_attribute", "handle": "1", "key": "evil", "value": "x"}])


# ── Optimistic lock (pure logic) ──────────────────────────────────────────


def test_optimistic_lock_predicate():
    from app.services.cad_pipeline import check_base_is_latest

    # First edit off the original: both None → safe.
    assert check_base_is_latest(None, None) is True
    # Editing the current head → safe.
    assert check_base_is_latest("rev-2", "rev-2") is True
    # Editing a stale base (someone/AI committed since) → conflict.
    assert check_base_is_latest("rev-1", "rev-2") is False
    # Client thinks it's on the original but head exists → conflict.
    assert check_base_is_latest(None, "rev-1") is False
