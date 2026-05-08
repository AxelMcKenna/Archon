"""Pure-Python rules engine (FR-2.4 — FR-2.10).

- Loads `/api/rules/rfi_classification.yaml`
- Stateless: input = canonical RFI item, output = ranked RuleHit list
- Supports two matcher types: `entity` and `regex`
- Honours `hard_assertion`: a matched hard rule overrides AI in reconciliation
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.models import (
    ConfidenceT,
    RfiItem,
    RuleHit,
    RulesPrediction,
    SeverityT,
)

DEFAULT_RULES_PATH = Path(__file__).parent.parent.parent / "rules" / "rfi_classification.yaml"


@dataclass(frozen=True)
class Rule:
    id: str
    description: str
    matcher_type: str  # "entity" | "regex"
    matcher_field: str
    matcher_pattern: str | None
    matcher_contains: str | None
    category: str
    confidence: ConfidenceT
    severity_default: SeverityT
    hard_assertion: bool
    deprecated: bool


@dataclass(frozen=True)
class RuleSet:
    version: str
    content_hash: str
    rules: tuple[Rule, ...]
    raw_yaml: str


def load_ruleset(path: Path | None = None) -> RuleSet:
    p = path or DEFAULT_RULES_PATH
    raw = p.read_text(encoding="utf-8")
    data: dict[str, Any] = yaml.safe_load(raw)
    rules: list[Rule] = []
    for r in data.get("rules", []):
        m = r["matcher"]
        rules.append(
            Rule(
                id=r["id"],
                description=r.get("description", ""),
                matcher_type=m["type"],
                matcher_field=m["field"],
                matcher_pattern=m.get("pattern"),
                matcher_contains=m.get("contains"),
                category=r["category"],
                confidence=r.get("confidence", "medium"),
                severity_default=r.get("severity_default", "must_resolve"),
                hard_assertion=r.get("hard_assertion", False),
                deprecated=r.get("deprecated", False),
            )
        )
    return RuleSet(
        version=data["version"],
        content_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        rules=tuple(rules),
        raw_yaml=raw,
    )


def _resolve_field(item: RfiItem, dotted: str) -> Any:
    parts = dotted.split(".")
    obj: Any = item
    for p in parts:
        if hasattr(obj, p):
            obj = getattr(obj, p)
        elif isinstance(obj, dict):
            obj = obj.get(p)
        else:
            return None
    return obj


def _entity_match(rule: Rule, item: RfiItem) -> bool:
    field_value = _resolve_field(item, rule.matcher_field)
    if not isinstance(field_value, list):
        return False
    target = (rule.matcher_contains or "").strip().lower()
    return any(target in str(v).lower() for v in field_value)


def _regex_match(rule: Rule, item: RfiItem) -> bool:
    field_value = _resolve_field(item, rule.matcher_field)
    if not isinstance(field_value, str):
        return False
    if rule.matcher_pattern is None:
        return False
    return bool(re.search(rule.matcher_pattern, field_value))


def evaluate(item: RfiItem, ruleset: RuleSet) -> RulesPrediction:
    hits: list[RuleHit] = []
    for r in ruleset.rules:
        if r.deprecated:
            continue
        matched = (
            _entity_match(r, item) if r.matcher_type == "entity"
            else _regex_match(r, item) if r.matcher_type == "regex"
            else False
        )
        if matched:
            hits.append(
                RuleHit(
                    rule_id=r.id,
                    category=r.category,
                    confidence=r.confidence,
                    severity=r.severity_default,
                    hard_assertion=r.hard_assertion,
                )
            )
    return RulesPrediction(hits=hits, rules_version=ruleset.version)
