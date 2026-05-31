"""Shared localisation sub-schemas for vision tool schemas.

Both the RFI flag schema and the VE opportunity schema localise findings the
same way: a PDF page + optional tile + optional normalised bbox, with a DXF
variant that swaps all three for entity ``target_handles``. Defining the
fragments once keeps the four schemas (RFI/VE × PDF/CAD) in lock-step.
"""

from __future__ import annotations

import copy
from typing import Any

TILE_ENUM = ["top-left", "top-right", "bottom-left", "bottom-right", "full"]

_BBOX_DESCRIPTION = (
    "Optional bounding box around the cited feature, in normalised 0-1 "
    "coordinates RELATIVE TO THE IMAGE YOU ARE LOOKING AT (the tile if "
    "tiled, otherwise the full page). Order: [x0, y0, x1, y1] with origin "
    "at top-left. Omit if you cannot localise."
)


def page_tile_bbox_props() -> dict[str, Any]:
    """Fresh ``{page, tile, bbox}`` properties for a PDF tool-schema item.

    Returns a new dict each call so callers can mutate the result freely.
    """
    return {
        "page": {"type": "integer", "minimum": 1},
        "tile": {"type": "string", "enum": list(TILE_ENUM)},
        "bbox": {
            "type": "array",
            "description": _BBOX_DESCRIPTION,
            "minItems": 4,
            "maxItems": 4,
            "items": {"type": "number", "minimum": 0, "maximum": 1},
        },
    }


def target_handles_prop() -> dict[str, Any]:
    """Fresh ``target_handles`` property for a DXF tool-schema item."""
    return {
        "type": "array",
        "description": (
            "Handles of the DXF entities this finding refers to, drawn from "
            "the entity list provided in the prompt. These ground it to the "
            "drawing so it can be highlighted."
        ),
        "items": {"type": "string"},
    }


def to_cad_schema(schema: dict[str, Any], *, array_key: str) -> dict[str, Any]:
    """Derive the DXF variant of a PDF tool schema.

    Drops ``page``/``tile``/``bbox`` from each item, makes ``page`` no longer
    required, and adds a required ``target_handles`` so the model localises by
    entity handle instead of a pixel bbox (overlay boxes are then computed
    geometrically — see ``app.cad.cad_grounding``). ``array_key`` names the
    item array property (``"flags"`` or ``"opportunities"``).
    """
    out = copy.deepcopy(schema)
    item = out["input_schema"]["properties"][array_key]["items"]
    for pdf_only in ("page", "tile", "bbox"):
        item["properties"].pop(pdf_only, None)
    item["properties"]["target_handles"] = target_handles_prop()
    item["required"] = [r for r in item.get("required", []) if r != "page"] + [
        "target_handles"
    ]
    return out
