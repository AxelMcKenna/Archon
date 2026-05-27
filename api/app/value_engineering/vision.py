"""Vision pass for the value-engineering analyser.

One LLM call per analysis run in v1 — no voting, no verifier. The
tool schema diverges from the RFI flag schema: each opportunity has
``current_spec`` + ``proposed_alternative`` (two specs) rather than a
single ``verbatim_quote`` + severity.
"""

from __future__ import annotations

from typing import Any

from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool

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
                        "page": {"type": "integer", "minimum": 1},
                        "tile": {
                            "type": "string",
                            "enum": [
                                "top-left",
                                "top-right",
                                "bottom-left",
                                "bottom-right",
                                "full",
                            ],
                        },
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
                        "bbox": {
                            "type": "array",
                            "description": (
                                "Optional bounding box around the cited "
                                "item, in normalised 0-1 coords relative "
                                "to the image you are looking at (tile if "
                                "tiled, otherwise full page). Order: "
                                "[x0, y0, x1, y1] with origin top-left. "
                                "Omit if you cannot localise."
                            ),
                            "minItems": 4,
                            "maxItems": 4,
                            "items": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                    },
                },
            },
        },
    },
}


def run_value_engineering_pass(
    *,
    settings: Any,
    images: list[bytes],
    captions: list[str],
    prompt: str,
) -> tuple[dict[str, Any], int, int]:
    """One VE vision call. Returns (payload, input_tokens, output_tokens)."""
    if settings.plan_analyser_provider == "openrouter":
        result = call_openrouter_tool(
            images=images,
            image_captions=captions,
            prompt=prompt,
            tool_name=OPPORTUNITY_TOOL_SCHEMA["name"],
            tool_description=OPPORTUNITY_TOOL_SCHEMA["description"],
            tool_parameters=OPPORTUNITY_TOOL_SCHEMA["input_schema"],
            max_output_tokens=6000,
            model=settings.openrouter_model,
        )
        return result.payload, result.input_tokens, result.output_tokens

    result = call_gemini_tool(
        images=images,
        image_captions=captions,
        prompt=prompt,
        tool_name=OPPORTUNITY_TOOL_SCHEMA["name"],
        tool_description=OPPORTUNITY_TOOL_SCHEMA["description"],
        tool_parameters=OPPORTUNITY_TOOL_SCHEMA["input_schema"],
        max_output_tokens=6000,
        model=settings.gemini_model,
    )
    return result.payload, result.input_tokens, result.output_tokens
