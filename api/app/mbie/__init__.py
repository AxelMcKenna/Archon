"""MBIE Acceptable Solutions retrieval (vision-time grounding).

The verifier (``app.vision.plans.vision_pass``) queries ``mbie_clauses``
to ground flag verdicts: if a flagged detail matches an Acceptable
Solution clause, the verifier drops the flag instead of asking for an
RFI.

The PDF-ingestion side (clause chunking + writes) lives in
``app.ingestion.mbie``.
"""

from app.mbie.retriever import (
    code_clause_for_category,
    format_hits_for_prompt,
    retrieve_for_flag,
)

__all__ = [
    "code_clause_for_category",
    "format_hits_for_prompt",
    "retrieve_for_flag",
]
