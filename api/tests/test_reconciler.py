from app.classifier.reconciler import reconcile
from app.models import AiPrediction, RuleHit, RulesPrediction


def _ai(category: str = "building_code:B1", **kw) -> AiPrediction:
    return AiPrediction(
        primary_category=category,
        severity=kw.get("severity", "must_resolve"),
        confidence=kw.get("confidence", "medium"),
        reasoning="x" * 20,
        prompt_version="1.0.0",
    )


def _rules(*hits: RuleHit) -> RulesPrediction:
    return RulesPrediction(hits=list(hits), rules_version="1.0.0")


def _hit(category: str, hard: bool = False) -> RuleHit:
    return RuleHit(
        rule_id=f"r-{category}",
        category=category,
        confidence="high",
        severity="must_resolve",
        hard_assertion=hard,
    )


def test_agree():
    f = reconcile("i", _rules(_hit("building_code:B1")), _ai("building_code:B1"))
    assert f.state == "agree"
    assert f.primary_category == "building_code:B1"
    assert f.confidence == "high"


def test_ai_extends_when_rules_empty():
    f = reconcile("i", _rules(), _ai("building_code:E2"))
    assert f.state == "ai_extends_rules"
    assert f.primary_category == "building_code:E2"


def test_disagree():
    f = reconcile(
        "i",
        _rules(_hit("building_code:E2")),  # not hard
        _ai("building_code:B1"),
    )
    assert f.state == "disagree"
    assert f.confidence == "low"


def test_rules_override_on_hard_assertion():
    f = reconcile(
        "i",
        _rules(_hit("documentation:producer_statements", hard=True)),
        _ai("building_code:B1"),
    )
    assert f.state == "rules_override"
    assert f.primary_category == "documentation:producer_statements"
    assert f.confidence == "high"
