"""Tool schema and prompt metadata for the RFI vision extractor."""

from __future__ import annotations

from typing import Any

EXTRACTOR_VERSION = "1.0.0"
ACTIVE_PROMPT = "rfi_extract_v1.md"

# The RFI page cap is now configurable via ``settings.rfi_max_pages`` (default
# 50; 0 = unlimited, bounded only by the 25MB upload cap) and enforced in the
# /extract route. The extractor sends all pages in a single vision call, so the
# cap bounds context/cost on that request — see app/routes/extract.py.

RFI_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_rfi_letter",
    "description": "Record the parsed structure of an RFI letter.",
    "input_schema": {
        "type": "object",
        "required": ["items"],
        "properties": {
            "application_ref": {"type": ["string", "null"]},
            "rfi_number": {"type": ["integer", "null"]},
            "issue_date": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
            "response_deadline": {"type": ["string", "null"]},
            "officer_name": {"type": ["string", "null"]},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["raw_number", "raw_text", "page"],
                    "properties": {
                        "raw_number": {"type": "string"},
                        "raw_text": {"type": "string"},
                        "page": {"type": "integer"},
                    },
                },
            },
        },
    },
}
