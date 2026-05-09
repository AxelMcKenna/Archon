"""Regression suite for the rules engine (FR-2.10, AC-8).

Reads /api/tests/rules_regression.yaml and asserts that each case's expected
category appears in the rules engine output. CI must run this on every change
to /api/rules/rfi_classification.yaml.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.classifier.rules import evaluate, load_ruleset
from app.extractors.entities import extract_entities
from app.models import ExtractedEntities, RfiItem

REGRESSION_PATH = Path(__file__).parent / "rules_regression.yaml"


def _load_cases() -> list[dict]:
    return yaml.safe_load(REGRESSION_PATH.read_text())["cases"]


@pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["id"])
def test_rule_matches(case: dict):
    rs = load_ruleset()
    item = RfiItem(
        item_id=case["id"],
        raw_text=case["raw_text"],
        extracted=extract_entities(case["raw_text"]) or ExtractedEntities(),
    )
    pred = evaluate(item, rs)
    categories = [h.category for h in pred.hits]
    assert case["expected_category"] in categories, (
        f"{case['id']}: expected {case['expected_category']} in {categories}"
    )
    if "expected_rule" in case:
        rule_ids = [h.rule_id for h in pred.hits]
        assert case["expected_rule"] in rule_ids, (
            f"{case['id']}: expected rule {case['expected_rule']} in {rule_ids}"
        )
