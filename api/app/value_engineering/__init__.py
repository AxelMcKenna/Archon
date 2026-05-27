"""Value-engineering pass over building plans.

A separate vision pass over the same rendered PDF pages as the RFI
analyser, but with a different prompt + tool schema. Surfaces
cost-reduction opportunities (over-specified materials, code-compliant
cheaper alternatives) rather than RFI risks.

Reuses ``app.plans.render`` and ``app.llm`` infrastructure; does not run
self-consistency voting or a verifier pass in v1 (see plan doc).
"""

from app.value_engineering.analyzer import (
    VALUE_ENGINEERING_VERSION,
    analyse_value_engineering,
)

__all__ = [
    "VALUE_ENGINEERING_VERSION",
    "analyse_value_engineering",
]
