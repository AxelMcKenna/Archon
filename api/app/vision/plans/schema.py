"""Tool schemas + prompt filenames for the plan analyser's two LLM calls."""

from __future__ import annotations

from typing import Any

from app.vision.core.localization import page_tile_bbox_props

ACTIVE_ANALYSIS_PROMPT = "plan_analyser_v2.md"
ACTIVE_VERIFICATION_PROMPT = "plan_verification_v2.md"
ACTIVE_RECONCILIATION_PROMPT = "plan_reconciliation_v1.md"

VIEW_TYPE_ENUM = [
    "plan",
    "section",
    "elevation",
    "detail",
    "schedule",
    "site",
    "3d",
    "other",
]

# Normalised 0-1 bbox shared by view anchor items (datums, callouts). Same
# convention as the flag bbox, but relative to the full sheet image.
_ANCHOR_BBOX = {
    "type": "array",
    "description": (
        "Optional [x0, y0, x1, y1] in normalised 0-1 coordinates relative to "
        "the full sheet, origin top-left. Omit if you can't localise."
    ),
    "minItems": 4,
    "maxItems": 4,
    "items": {"type": "number", "minimum": 0, "maximum": 1},
}

# Optional per-sheet view descriptor. Requested only when cross-view
# reconciliation is enabled (the prompt section is appended conditionally);
# absent in the default single-sheet path, so it is NOT in `required`.
VIEW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "description": (
        "What this sheet depicts and the registration anchors it exposes, so "
        "views of the same building can be cross-checked."
    ),
    "properties": {
        "view_type": {"type": "string", "enum": list(VIEW_TYPE_ENUM)},
        "level_id": {
            "type": "string",
            "maxLength": 60,
            "description": (
                "The storey/level this view depicts, as labelled on the sheet "
                "(e.g. 'Ground Floor', 'Level 1', 'RL 100.500'). Omit if the "
                "view spans no single level (e.g. an elevation showing all)."
            ),
        },
        "scale": {"type": "string", "maxLength": 30},
        "datums": {
            "type": "array",
            "description": (
                "Floor levels / reduced levels stated on this sheet (FFL, RL, "
                "datum notes). One entry per stated level."
            ),
            "items": {
                "type": "object",
                "required": ["label", "value", "verbatim_quote"],
                "properties": {
                    "label": {"type": "string", "maxLength": 60},
                    "value": {"type": "string", "maxLength": 40},
                    "verbatim_quote": {"type": "string", "minLength": 1, "maxLength": 120},
                    "bbox": _ANCHOR_BBOX,
                },
            },
        },
        "callouts": {
            "type": "array",
            "description": (
                "Section / detail markers on this sheet that reference another "
                "drawing (e.g. a section bubble 'A-A' pointing to sheet S2.01)."
            ),
            "items": {
                "type": "object",
                "required": ["marker", "verbatim_quote"],
                "properties": {
                    "marker": {"type": "string", "maxLength": 40},
                    "target_sheet": {"type": "string", "maxLength": 40},
                    "verbatim_quote": {"type": "string", "minLength": 1, "maxLength": 120},
                    "bbox": _ANCHOR_BBOX,
                },
            },
        },
    },
}

ANALYSIS_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_plan_analysis",
    "description": "Record the structured analysis of a building plan.",
    "input_schema": {
        "type": "object",
        "required": ["flags", "summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 20},
            "view": VIEW_SCHEMA,
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
        "OR that the drawing visibly satisfies per AS. For surviving "
        "flags, note whether an Alternative Solution pathway could "
        "resolve the issue instead of the Acceptable Solution."
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
                                "drops the flag in that case, but ONLY when "
                                "as_compliant_quote and as_compliant_clause "
                                "are also supplied and grounded."
                            ),
                        },
                        "as_compliant_quote": {
                            "type": "string",
                            "maxLength": 200,
                            "description": (
                                "Required when as_compliant is true: the "
                                "verbatim text or dimension visible on the "
                                "drawing that shows the compliant detail "
                                "(e.g. '35mm cavity'). This is what makes the "
                                "drop auditable — without it the flag is kept."
                            ),
                        },
                        "as_compliant_clause": {
                            "type": "string",
                            "maxLength": 60,
                            "description": (
                                "Required when as_compliant is true: the "
                                "specific clause number (from the supplied "
                                "acceptable_solution_clauses) that the drawing "
                                "satisfies. Must match one of the retrieved "
                                "clauses or the flag is kept."
                            ),
                        },
                        "alt_solution_available": {
                            "type": "boolean",
                            "description": (
                                "True when the flagged detail deviates from "
                                "the Acceptable Solution but could plausibly "
                                "comply with the Building Code via an "
                                "Alternative Solution (Building Act s19(1)(b)) "
                                "rather than the prescriptive AS path. Does "
                                "NOT drop the flag — the RFI still stands "
                                "because the council needs supporting evidence."
                            ),
                        },
                        "alt_solution_pathway": {
                            "type": "string",
                            "maxLength": 400,
                            "description": (
                                "When alt_solution_available is true, a brief "
                                "description of the Alternative Solution route "
                                "and the supporting evidence a designer would "
                                "supply (e.g. producer statement PS1, test "
                                "report to the relevant standard, specific "
                                "engineering design, expert opinion). Cite the "
                                "Building Code performance clause being met."
                            ),
                        },
                        "verification_note": {"type": "string", "maxLength": 200},
                    },
                },
            },
        },
    },
}

# One citation in a cross-view discrepancy: a page + the verbatim text/value
# read on that page, optionally localised.
_RECON_CITATION = {
    "type": "object",
    "required": ["page", "verbatim_quote"],
    "properties": {
        "page": {"type": "integer", "minimum": 1},
        "verbatim_quote": {"type": "string", "minLength": 1, "maxLength": 160},
        "bbox": _ANCHOR_BBOX,
    },
}

RECONCILIATION_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_cross_view_discrepancies",
    "description": (
        "Record contradictions between views that depict the same part of the "
        "building. Only emit a discrepancy when the SAME level/datum is stated "
        "differently on two views, each grounded by a verbatim quote."
    ),
    "input_schema": {
        "type": "object",
        "required": ["discrepancies"],
        "properties": {
            "discrepancies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "citation_a",
                        "citation_b",
                        "severity",
                        "confidence",
                        "reason",
                        "recommended_action",
                    ],
                    "properties": {
                        "citation_a": _RECON_CITATION,
                        "citation_b": _RECON_CITATION,
                        "severity": {"enum": ["must_resolve", "nice_to_have"]},
                        "confidence": {"enum": ["high", "medium", "low"]},
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
