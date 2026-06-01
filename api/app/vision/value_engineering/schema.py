"""Tool schema and prompt metadata for the VE vision pass."""

from __future__ import annotations

from typing import Any

from app.vision.core.localization import page_tile_bbox_props, to_cad_schema

VALUE_ENGINEERING_VERSION = "1.1.0"
ACTIVE_PROMPT = "value_engineering_v1.md"

OPPORTUNITY_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_value_opportunities",
    "description": (
        "Record cost-reduction (value-engineering) opportunities found "
        "in a residential building plan set."
    ),
    "input_schema": {
        "type": "object",
        "required": ["opportunities", "summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 10},
            "opportunities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "page",
                        "area",
                        "category",
                        "current_spec",
                        "proposed_alternative",
                        "cost_impact",
                        "confidence",
                        "rationale",
                    ],
                    "properties": {
                        **page_tile_bbox_props(),
                        "area": {"type": "string", "minLength": 4, "maxLength": 200},
                        "category": {
                            "type": "string",
                            "enum": [
                                "material_substitution",
                                "structural_oversize",
                                "treatment_downgrade",
                                "product_alternative",
                                "detail_simplification",
                                "finish_downgrade",
                            ],
                        },
                        "current_spec": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 300,
                        },
                        "proposed_alternative": {
                            "type": "string",
                            "minLength": 8,
                            "maxLength": 500,
                        },
                        "cost_impact": {"enum": ["low", "medium", "high"]},
                        "confidence": {"enum": ["low", "medium", "high"]},
                        "rationale": {
                            "type": "string",
                            "minLength": 12,
                            "maxLength": 600,
                        },
                        "code_considerations": {
                            "type": "string",
                            "maxLength": 400,
                        },
                        # Short retail search terms for the proposed alternative,
                        # used to look up an indicative Bunnings price post-hoc
                        # (see app.services.ve_pricing). Keep them generic and
                        # product-like — material, grade, size — not full
                        # sentences. Optional: omit for non-material items
                        # (e.g. detail simplification) where no SKU applies.
                        "material_keywords": {
                            "type": "string",
                            "maxLength": 120,
                        },
                    },
                },
            },
        },
    },
}


# DXF variant: localise opportunities by entity handle instead of a
# page/tile/pixel bbox. Overlay boxes are computed geometrically from the
# handles' model-space bboxes (see ``app.cad.cad_grounding``), exactly like the
# RFI CAD path. Derived from the base schema so the two stay in sync.
CAD_OPPORTUNITY_TOOL_SCHEMA: dict[str, Any] = to_cad_schema(
    OPPORTUNITY_TOOL_SCHEMA, array_key="opportunities"
)
