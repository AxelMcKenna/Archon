"""Tests for the shared CAD grounding helpers (RFI + VE)."""

from __future__ import annotations

from app.cad.cad_grounding import (
    build_text_index,
    image_bboxes_for_handles,
    index_bbox_by_handle,
    recover_handles_from_quote,
    summarise_for_llm,
)

_ENTS = [
    {
        "handle": "A",
        "type": "TEXT",
        "text": "H1.2 timber treatment " + "x" * 200,
        "layer": "NOTES",
        "bbox": [0.0, 0.0, 10.0, 10.0],
        "points": [1, 2, 3],  # bulky field that must be dropped for the LLM
    },
    {
        "handle": "B",
        "type": "LINE",
        "layer": "WALLS",
        "bbox": [90.0, 90.0, 100.0, 100.0],
    },
]


def test_summarise_for_llm_slims_and_clips():
    slim = summarise_for_llm(_ENTS)
    assert slim[0].keys() <= {
        "handle", "type", "layer", "text", "length", "block", "rotation"
    }
    assert "points" not in slim[0]
    assert len(slim[0]["text"]) == 120  # clipped


def test_summarise_for_llm_respects_limit():
    assert len(summarise_for_llm(_ENTS, limit=1)) == 1


def test_index_bbox_by_handle():
    bbh = index_bbox_by_handle(_ENTS)
    assert bbh == {
        "A": (0.0, 0.0, 10.0, 10.0),
        "B": (90.0, 90.0, 100.0, 100.0),
    }


def test_recover_handles_from_quote():
    idx = build_text_index(_ENTS)
    # substring match either direction
    assert recover_handles_from_quote("timber treatment", idx) == ["A"]
    assert recover_handles_from_quote("zzz", idx) == []
    assert recover_handles_from_quote("ab", idx) == []  # too short


def test_image_bboxes_projection_with_y_flip():
    bbh = index_bbox_by_handle(_ENTS)
    # View extents 0..100; handle A's model box 0..10 maps to x 0-0.1, and
    # y flips (top of image = max model y) so y spans 0.9-1.0.
    out = image_bboxes_for_handles(["A"], bbh, {"Model": (0.0, 0.0, 100.0, 100.0)})
    assert out is not None
    x0, y0, x1, y1 = out["Model"]
    assert abs(x0 - 0.0) < 1e-6 and abs(x1 - 0.1) < 1e-6
    assert abs(y0 - 0.9) < 1e-6 and abs(y1 - 1.0) < 1e-6


def test_image_bboxes_unions_multiple_handles():
    bbh = index_bbox_by_handle(_ENTS)
    out = image_bboxes_for_handles(["A", "B"], bbh, {"Model": (0.0, 0.0, 100.0, 100.0)})
    assert out is not None
    x0, y0, x1, y1 = out["Model"]
    # Union spans the full 0..100 model box → full normalised extent.
    assert abs(x0 - 0.0) < 1e-6 and abs(x1 - 1.0) < 1e-6
    assert abs(y0 - 0.0) < 1e-6 and abs(y1 - 1.0) < 1e-6


def test_image_bboxes_unknown_handles_returns_none():
    bbh = index_bbox_by_handle(_ENTS)
    assert image_bboxes_for_handles(["Z"], bbh, {"Model": (0.0, 0.0, 100.0, 100.0)}) is None
    assert image_bboxes_for_handles([], bbh, {"Model": (0.0, 0.0, 100.0, 100.0)}) is None


def test_point_like_bbox_is_padded():
    # A degenerate (point) box should be padded so it renders as a visible rect.
    bbh = {"P": (50.0, 50.0, 50.0, 50.0)}
    out = image_bboxes_for_handles(["P"], bbh, {"Model": (0.0, 0.0, 100.0, 100.0)})
    assert out is not None
    x0, y0, x1, y1 = out["Model"]
    assert x1 > x0 and y1 > y0  # non-degenerate after padding
