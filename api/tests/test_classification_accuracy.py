"""Classification accuracy harness for AC-2a / AC-2b / AC-2c.

Modes:
  - default (rules-only): asserts AC-2a (>=60% top-1 from rules engine).
    Cheap; runs in CI on every push.
  - full (ARRO_RUN_AI=1 in env): runs both prongs and reconciler against
    the labelled set, prints a report with rules / ai / reconciled accuracy,
    asserts AC-2c (>=85% reconciled).

The full path costs Anthropic credits. Don't run it in default CI.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml

from app.classifier.rules import evaluate, load_ruleset
from app.extractors.entities import extract_entities
from app.models import RfiItem

TEST_SET_PATH = Path(__file__).parent / "classification_test_set.yaml"


def _load() -> list[dict]:
    return yaml.safe_load(TEST_SET_PATH.read_text())["cases"]


def _make_item(case: dict) -> RfiItem:
    return RfiItem(
        item_id=case["id"],
        raw_text=case["raw_text"],
        extracted=extract_entities(case["raw_text"]),
    )


def _rules_top1(item: RfiItem, ruleset) -> str | None:
    pred = evaluate(item, ruleset)
    return pred.primary_category


def test_rules_engine_top1_accuracy_at_least_60pct():
    """AC-2a: rules engine alone >= 60% top-1 on the test set."""
    cases = _load()
    ruleset = load_ruleset()
    correct = 0
    misses: list[str] = []
    for case in cases:
        item = _make_item(case)
        top1 = _rules_top1(item, ruleset)
        if top1 == case["expected"]:
            correct += 1
        else:
            misses.append(f"{case['id']}: expected {case['expected']}, got {top1}")
    accuracy = correct / len(cases)
    print(f"\nrules-only accuracy: {accuracy:.1%} ({correct}/{len(cases)})")
    if misses:
        print("\nmisses:")
        for m in misses[:10]:
            print(f"  - {m}")
    assert accuracy >= 0.60, f"rules accuracy {accuracy:.1%} < 60% (AC-2a)"


@pytest.mark.skipif(
    os.environ.get("ARRO_RUN_AI") != "1",
    reason="set ARRO_RUN_AI=1 to run AI classifier accuracy (costs Anthropic credits)",
)
def test_full_pipeline_top1_accuracy_at_least_85pct():
    """AC-2b/2c: AI alone >= 75%, reconciled >= 85%."""
    from app.classifier import ai as ai_classifier
    from app.classifier import reconciler

    cases = _load()
    ruleset = load_ruleset()
    rules_correct = ai_correct = final_correct = 0
    misses: list[str] = []

    for case in cases:
        item = _make_item(case)
        rules_pred = evaluate(item, ruleset)
        ai_pred = ai_classifier.classify(
            item, bca="ccc", project_type="new_dwelling", project_description=""
        )
        final = reconciler.reconcile(case["id"], rules_pred, ai_pred)

        if rules_pred.primary_category == case["expected"]:
            rules_correct += 1
        if ai_pred.primary_category == case["expected"]:
            ai_correct += 1
        if final.primary_category == case["expected"]:
            final_correct += 1
        else:
            misses.append(
                f"{case['id']}: expected {case['expected']}, "
                f"got {final.primary_category} ({final.state})"
            )

    n = len(cases)
    print(f"\nrules:  {rules_correct/n:.1%} ({rules_correct}/{n})")
    print(f"ai:     {ai_correct/n:.1%} ({ai_correct}/{n})")
    print(f"final:  {final_correct/n:.1%} ({final_correct}/{n})")
    if misses:
        print("\nfinal misses:")
        for m in misses:
            print(f"  - {m}")

    assert rules_correct / n >= 0.60, "AC-2a: rules <60%"
    assert ai_correct / n >= 0.75, "AC-2b: ai <75%"
    assert final_correct / n >= 0.85, "AC-2c: reconciled <85%"
