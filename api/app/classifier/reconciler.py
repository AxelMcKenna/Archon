"""Reconciler (FR-2.15 — FR-2.18).

Combines rules engine + AI classifier outputs into a final classification.
Always emits a reconciliation log entry.

Four states:
  - agree            both prongs returned same primary category
  - ai_extends_rules rules empty / 'documentation:other' → take AI's
  - disagree         both specific but different → surface to user
  - rules_override   rules hard-assertion contradicts AI → take rules
"""

from __future__ import annotations

from app.models import (
    AiPrediction,
    FinalClassification,
    ReconciliationStateT,
    RulesPrediction,
)

_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def _is_documentation_other(category: str | None) -> bool:
    return category == "documentation:other" or category is None


def reconcile(
    rfi_item_id: str,
    rules: RulesPrediction,
    ai: AiPrediction,
) -> FinalClassification:
    rules_primary = rules.primary_category
    ai_primary = ai.primary_category
    state: ReconciliationStateT
    final_category: str
    final_confidence = ai.confidence
    final_severity = ai.severity

    if rules.has_hard_assertion and rules_primary and rules_primary != ai_primary:
        state = "rules_override"
        final_category = rules_primary
        # Take severity from the *same* hard assertion that won the category
        # (rules.primary_category prefers hard assertions, highest-confidence
        # first). Selecting the first hard hit in list order could pull
        # severity from a different, lower-priority assertion whose category
        # isn't even the one we're overriding to. Deterministic tie-break:
        # highest confidence among hard hits matching the chosen category.
        rules_hit = max(
            (
                h
                for h in rules.hits
                if h.hard_assertion and h.category == rules_primary
            ),
            key=lambda h: _CONFIDENCE_RANK.get(h.confidence, 0),
        )
        final_severity = rules_hit.severity
        final_confidence = "high"
    elif rules_primary and ai_primary == rules_primary:
        state = "agree"
        final_category = ai_primary
        final_confidence = "high"
    elif _is_documentation_other(rules_primary):
        state = "ai_extends_rules"
        final_category = ai_primary
        final_confidence = ai.confidence if ai.confidence != "high" else "medium"
    elif rules_primary and ai_primary and rules_primary != ai_primary:
        state = "disagree"
        # User-resolution UI shows both; default to AI pending resolution.
        final_category = ai_primary
        final_confidence = "low"
    else:
        state = "ai_extends_rules"
        final_category = ai_primary
        final_confidence = ai.confidence

    return FinalClassification(
        rfi_item_id=rfi_item_id,
        primary_category=final_category,
        secondary_category=ai.secondary_category,
        severity=final_severity,
        confidence=final_confidence,
        state=state,
        rules_output=rules,
        ai_output=ai,
        rules_version=rules.rules_version,
        prompt_version=ai.prompt_version,
    )
