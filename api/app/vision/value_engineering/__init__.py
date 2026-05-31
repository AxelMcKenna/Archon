"""Value-engineering vision pass over building plans.

A separate vision pass over the same rendered PDF pages as the RFI
analyser, but with a different prompt + tool schema. Surfaces
cost-reduction opportunities (over-specified materials, code-compliant
cheaper alternatives) rather than RFI risks.

Reuses ``app.vision.core`` and ``app.llm`` infrastructure; does not run
self-consistency voting or a verifier pass in v1.

- ``schema``       — tool schema, prompt filename, analyser version.
- ``vision_pass``  — ``run_value_engineering_pass`` (the single LLM call).
- ``analyzer``     — service entrypoint: ``analyse_value_engineering``.
"""

from app.vision.value_engineering.analyzer import (
    VALUE_ENGINEERING_VERSION,
    analyse_value_engineering,
    analyse_value_engineering_cad,
    analyse_value_engineering_from_images,
)

__all__ = [
    "VALUE_ENGINEERING_VERSION",
    "analyse_value_engineering",
    "analyse_value_engineering_cad",
    "analyse_value_engineering_from_images",
]
