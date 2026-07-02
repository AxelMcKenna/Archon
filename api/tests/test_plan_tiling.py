"""Tests for the v2 plan flagger rendering + dedup pipeline."""

from __future__ import annotations

import io

from PIL import Image

from app.plans.vote import dedup_flags as _dedup_flags
from app.vision.core.renderer import (
    MAX_IMAGE_BYTES,
    TILE_PIXEL_THRESHOLD,
    RenderedImage,
    encode_capped,
    needs_tiling,
)
from app.vision.core.renderer import (
    png_bytes as _png_bytes,
)
from app.vision.core.renderer import (
    tile_image as _tile_image,
)


def _solid_image(w: int, h: int, color: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    return Image.new("RGB", (w, h), color)


def test_tile_image_returns_four_overlapping_tiles():
    img = _solid_image(1000, 800)
    tiles = _tile_image(img, overlap=0.10)
    assert set(tiles.keys()) == {
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
    }
    # Overlap means each tile is wider/taller than half the image.
    for tile in tiles.values():
        assert tile.width > 500  # > w/2
        assert tile.height > 400  # > h/2


def test_tile_overlap_seam_content_is_shared():
    """Pixels near the centre line should appear in two adjacent tiles."""
    img = _solid_image(1000, 800)
    # Paint a vertical red stripe right at the seam.
    for x in range(495, 505):
        for y in range(800):
            img.putpixel((x, y), (255, 0, 0))
    tiles = _tile_image(img, overlap=0.10)
    # Both top-left and top-right should still contain red somewhere.
    for name in ("top-left", "top-right"):
        colors = tiles[name].getcolors(maxcolors=10_000) or []
        assert any(c[1] == (255, 0, 0) for c in colors), f"{name} missing seam content"


def test_dedup_keeps_higher_confidence_for_same_key():
    flags = [
        {
            "page": 2,
            "area": "Bracing schedule, top-right of page",
            "category": "building_code:B1",
            "severity": "must_resolve",
            "confidence": "low",
            "verbatim_quote": "BU DEMAND",
            "reason": "schedule incomplete",
            "recommended_action": "add achieved column",
        },
        {
            "page": 2,
            "area": "Bracing schedule,  top-right of page  ",  # whitespace differs
            "category": "building_code:B1",
            "severity": "must_resolve",
            "confidence": "high",
            "verbatim_quote": "BU DEMAND 120",
            "reason": "schedule incomplete",
            "recommended_action": "add achieved column",
        },
    ]
    out = _dedup_flags(flags)
    assert len(out) == 1
    assert out[0]["confidence"] == "high"
    assert out[0]["verbatim_quote"] == "BU DEMAND 120"


def test_dedup_preserves_distinct_flags():
    flags = [
        {
            "page": 2,
            "area": "Bracing schedule",
            "category": "building_code:B1",
            "severity": "must_resolve",
            "confidence": "high",
            "verbatim_quote": "x",
            "reason": "y",
            "recommended_action": "z",
        },
        {
            "page": 3,
            "area": "Bracing schedule",
            "category": "building_code:B1",
            "severity": "must_resolve",
            "confidence": "high",
            "verbatim_quote": "x",
            "reason": "y",
            "recommended_action": "z",
        },
        {
            "page": 2,
            "area": "Cladding detail",
            "category": "building_code:E2",
            "severity": "must_resolve",
            "confidence": "high",
            "verbatim_quote": "x",
            "reason": "y",
            "recommended_action": "z",
        },
    ]
    assert len(_dedup_flags(flags)) == 3


def test_png_bytes_round_trips():
    img = _solid_image(50, 50, (10, 20, 30))
    raw = _png_bytes(img)
    reopened = Image.open(io.BytesIO(raw))
    assert reopened.size == (50, 50)
    # Sanity check on the constant we threshold against.
    assert MAX_IMAGE_BYTES > 100_000


def test_rendered_image_shape():
    rendered = RenderedImage(page=1, tile="top-left", png=b"abc", dpi=300)
    assert rendered.tile == "top-left"
    assert rendered.dpi == 300


def test_tiling_decided_by_pixels_not_png_bytes():
    # The tiling decision must be a pure function of rendered dimensions
    # (wiki/issues/0006) — content/encoder cannot flip it. An A3@200dpi-sized
    # page stays full; a page one pixel over the budget tiles.
    assert not needs_tiling(_solid_image(3308, 2339))  # 7.7 MP
    w, h = 6000, TILE_PIXEL_THRESHOLD // 6000  # just under the budget
    assert not needs_tiling(_solid_image(w, h))
    assert needs_tiling(_solid_image(w, h + 1))


def test_encode_capped_downscales_to_fit_but_never_retiles():
    # Noise compresses terribly — a 5 MP noise PNG blows the byte cap, so
    # encode_capped must downscale it under MAX_IMAGE_BYTES. The structure
    # decision is untouched: 5 MP is still well under the tiling budget.
    noisy = Image.effect_noise((2500, 2000), 100).convert("RGB")
    assert len(_png_bytes(noisy)) > MAX_IMAGE_BYTES  # would have tiled under the old rule
    assert not needs_tiling(noisy)
    capped = encode_capped(noisy)
    assert len(capped) <= MAX_IMAGE_BYTES
    reopened = Image.open(io.BytesIO(capped))
    # Halved (possibly repeatedly), aspect preserved.
    assert reopened.width in (1250, 625) and reopened.height in (1000, 500)


def test_encode_capped_leaves_small_images_untouched():
    img = _solid_image(800, 600)
    assert encode_capped(img) == _png_bytes(img)
