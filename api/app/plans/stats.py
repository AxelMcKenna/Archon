"""Diagnostic bbox-quality stats over a list of analysed flags.

Pure function — no DB, no I/O. Useful for the /bbox-stats endpoint and
for comparing analyser runs across vision models.
"""

from __future__ import annotations

from typing import Any


def compute_bbox_stats(flags: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(flags)
    model_count = sum(1 for f in flags if f.get("bbox_source") == "model")
    fallback_count = sum(1 for f in flags if f.get("bbox_source") == "tile_fallback")
    text_layer_count = sum(1 for f in flags if f.get("bbox_source") == "text_layer")
    ocr_count = sum(1 for f in flags if f.get("bbox_source") == "ocr")

    areas: list[float] = []
    for f in flags:
        bbox = f.get("bbox")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
            continue
        try:
            x0, y0, x1, y1 = (float(v) for v in bbox)
        except (TypeError, ValueError):
            continue
        if x1 > x0 and y1 > y0:
            areas.append((x1 - x0) * (y1 - y0))

    avg_area = sum(areas) / len(areas) if areas else 0.0
    sorted_areas = sorted(areas)
    median_area = sorted_areas[len(sorted_areas) // 2] if sorted_areas else 0.0

    grounded = model_count + text_layer_count + ocr_count
    text_anchored = text_layer_count + ocr_count
    pct = lambda n: round(n / total * 100, 1) if total else 0.0  # noqa: E731

    return {
        "total_flags": total,
        "text_layer": text_layer_count,
        "ocr": ocr_count,
        "model_grounded": model_count,
        "tile_fallback": fallback_count,
        "text_layer_pct": pct(text_layer_count),
        "ocr_pct": pct(ocr_count),
        "text_anchored_pct": pct(text_anchored),
        "grounded_pct": pct(grounded),
        "avg_bbox_area": round(avg_area, 4),
        "median_bbox_area": round(median_area, 4),
    }
