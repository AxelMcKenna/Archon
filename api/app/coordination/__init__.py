"""Project coordination - cross-document reconciliation.

The single-document analysers (plan flagger, spec flagger) each look at one
file. This package treats a project as one *related set* of documents and
surfaces where they disagree: a system specified in the spec with no drawing to
match, a fire-rated schedule the spec never mentions, a standard cited at two
editions across the set.

Tier 1 (here) is deterministic - it cross-references the structured entities the
single-document extractors already produce, so every flag cites >=2 documents
and there is no LLM cost. Tier 2 (gated, follow-on) adds semantic reconciliation.
"""

from app.coordination.engine import CoordinationResult, run_project_coordination

__all__ = ["CoordinationResult", "run_project_coordination"]
