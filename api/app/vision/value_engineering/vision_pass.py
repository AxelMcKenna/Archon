"""Single LLM call for the VE vision pass.

One LLM call per analysis run in v1 — no voting, no verifier. The
tool schema diverges from the RFI flag schema: each opportunity has
``current_spec`` + ``proposed_alternative`` (two specs) rather than a
single ``verbatim_quote`` + severity.
"""

from __future__ import annotations

from typing import Any

from app.vision.core.invoker import run_tool_pass
from app.vision.value_engineering.schema import OPPORTUNITY_TOOL_SCHEMA


def run_value_engineering_pass(
    *,
    settings: Any,
    images: list[bytes],
    captions: list[str],
    prompt: str,
    schema: dict[str, Any] = OPPORTUNITY_TOOL_SCHEMA,
    max_output_tokens: int = 6000,
) -> tuple[dict[str, Any], int, int]:
    """One VE vision call. Returns (payload, input_tokens, output_tokens).

    ``schema`` selects the tool contract — the PDF page/bbox variant
    (default) or the DXF handle variant (``CAD_OPPORTUNITY_TOOL_SCHEMA``).
    """
    return run_tool_pass(
        settings=settings,
        schema=schema,
        images=images,
        captions=captions,
        prompt=prompt,
        max_output_tokens=max_output_tokens,
    )
