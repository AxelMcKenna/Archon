"""Tile-local → page-relative bbox normalisation."""

from __future__ import annotations

from typing import Any

# Page-relative offset/scale per tile. Tiles are quartered so each maps to
# a 0.5×0.5 region of the parent page.
_TILE_TRANSFORM: dict[str, tuple[float, float, float, float]] = {
    # tile_name: (x_offset, y_offset, x_scale, y_scale)
    "top-left":     (0.0, 0.0, 0.5, 0.5),
    "top-right":    (0.5, 0.0, 0.5, 0.5),
    "bottom-left":  (0.0, 0.5, 0.5, 0.5),
    "bottom-right": (0.5, 0.5, 0.5, 0.5),
    "full":         (0.0, 0.0, 1.0, 1.0),
}


def tile_region(tile: str | None) -> tuple[float, float, float, float]:
    """Coarse page-relative bbox covering the entire tile region."""
    ox, oy, sx, sy = _TILE_TRANSFORM.get(tile or "full", _TILE_TRANSFORM["full"])
    return (ox, oy, ox + sx, oy + sy)


def normalise_bbox(
    bbox: Any, tile: str | None
) -> tuple[float, float, float, float] | None:
    """Convert a tile-local bbox to page-relative coords, clamped to [0,1].

    Returns None if the bbox is malformed.
    """
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x0, y0, x1, y1 = (float(v) for v in bbox)
    except (TypeError, ValueError):
        return None
    vals = (x0, y0, x1, y1)
    if any(v != v or v in (float("inf"), float("-inf")) for v in vals):
        return None
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    x0 = max(0.0, min(1.0, x0))
    y0 = max(0.0, min(1.0, y0))
    x1 = max(0.0, min(1.0, x1))
    y1 = max(0.0, min(1.0, y1))
    if x1 <= x0 or y1 <= y0:
        return None
    ox, oy, sx, sy = _TILE_TRANSFORM.get(tile or "full", _TILE_TRANSFORM["full"])
    return (ox + x0 * sx, oy + y0 * sy, ox + x1 * sx, oy + y1 * sy)


def attach_page_bbox(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replace tile-local `bbox` with a page-relative one, falling back to
    the tile region when the model omitted/fumbled the box.
    """
    out: list[dict[str, Any]] = []
    for f in flags:
        tile = f.get("tile") or "full"
        page_bbox = normalise_bbox(f.get("bbox"), tile)
        if page_bbox is None:
            page_bbox = tile_region(tile)
            f = {**f, "bbox_source": "tile_fallback"}
        else:
            f = {**f, "bbox_source": "model"}
        f["bbox"] = list(page_bbox)
        out.append(f)
    return out
