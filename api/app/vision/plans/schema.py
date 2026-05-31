"""Tool schemas + prompt filenames for the plan analyser's two LLM calls."""

from __future__ import annotations

from typing import Any

from app.vision.core.localization import page_tile_bbox_props

ACTIVE_ANALYSIS_PROMPT = "plan_analyser_v2.md"
ACTIVE_VERIFICATION_PROMPT = "plan_verification_v2.md"

ANALYSIS_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_plan_analysis",
    "description": "Record the structured analysis of a building plan.",
    "input_schema": {
        "type": "object",
        "required": ["flags", "summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 20},
            "flags": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "page",
                        "area",
                        "category",
                        "severity",
                        "confidence",
                        "verbatim_quote",
                        "reason",
                        "recommended_action",
                    ],
                    "properties": {
                        **page_tile_bbox_props(),
                        "area": {"type": "string", "minLength": 4, "maxLength": 200},
                        "category": {"type": "string"},
                        "severity": {"enum": ["must_resolve", "nice_to_have"]},
                        "confidence": {"enum": ["high", "medium", "low"]},
                        "verbatim_quote": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 200,
                        },
                        "reason": {"type": "string", "minLength": 12, "maxLength": 500},
                        "recommended_action": {
                            "type": "string",
                            "minLength": 8,
                            "maxLength": 500,
                        },
                    },
                },
            },
        },
    },
}

VERIFICATION_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_verification",
    "description": (
        "Verify each flag against the drawing and any supplied "
        "Acceptable Solution clauses. Drop flags that are ungrounded "
        "OR that the drawing visibly satisfies per AS."
    ),
    "input_schema": {
        "type": "object",
        "required": ["verifications"],
        "properties": {
            "verifications": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["flag_id", "verified"],
                    "properties": {
                        "flag_id": {"type": "integer", "minimum": 0},
                        "verified": {"type": "boolean"},
                        "as_compliant": {
                            "type": "boolean",
                            "description": (
                                "True when the drawing visibly satisfies "
                                "one of the supplied Acceptable Solution "
                                "clauses for this flag — the pipeline "
                                "drops the flag in that case."
                            ),
                        },
                        "verification_note": {"type": "string", "maxLength": 200},
                    },
                },
            },
        },
    },
}
