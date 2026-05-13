"""Pydantic models matching /shared/canonical_rfi.schema.json (schema v1.0)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field  # type: ignore

ExtractorKind = Literal["pdfplumber", "claude-vision"]
SeverityT = Literal["must_resolve", "nice_to_have"]
ConfidenceT = Literal["low", "medium", "high"]
ReconciliationStateT = Literal["agree", "ai_extends_rules", "disagree", "rules_override"]


class Dimension(BaseModel):
    value: float
    unit: str
    context: str | None = None


class ExtractedEntities(BaseModel):
    clause_references: list[str] = Field(default_factory=list)
    document_references: list[str] = Field(default_factory=list)
    professional_references: list[str] = Field(default_factory=list)
    standards_references: list[str] = Field(default_factory=list)
    dimensions: list[Dimension] = Field(default_factory=list)


class RfiItem(BaseModel):
    item_id: str
    raw_number: str | None = None
    raw_text: str
    page: int | None = None
    bbox: tuple[float, float, float, float] | None = None
    extracted: ExtractedEntities


class ExtractionMeta(BaseModel):
    extractor: ExtractorKind
    extractor_version: str
    processed_at: datetime
    warnings: list[str] = Field(default_factory=list)


class RfiLetter(BaseModel):
    rfi_id: UUID
    project_id: UUID
    bca: str
    application_ref: str | None = None
    rfi_number: int | None = None
    issue_date: date | None = None
    response_deadline: date | None = None
    officer_name: str | None = None
    extraction: ExtractionMeta
    items: list[RfiItem]


class CanonicalRfi(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    rfi_letter: RfiLetter


# ── Classification ───────────────────────────────────────────────────────────


class RuleHit(BaseModel):
    rule_id: str
    category: str
    confidence: ConfidenceT
    severity: SeverityT
    hard_assertion: bool


class RulesPrediction(BaseModel):
    """Output of the rules engine for a single line item."""

    hits: list[RuleHit] = Field(default_factory=list)
    rules_version: str

    @property
    def primary_category(self) -> str | None:
        if not self.hits:
            return None
        # Prefer hard assertions; otherwise highest confidence.
        confidence_rank = {"high": 3, "medium": 2, "low": 1}
        sorted_hits = sorted(
            self.hits,
            key=lambda h: (h.hard_assertion, confidence_rank[h.confidence]),
            reverse=True,
        )
        return sorted_hits[0].category

    @property
    def has_hard_assertion(self) -> bool:
        return any(h.hard_assertion for h in self.hits)


class AiPrediction(BaseModel):
    primary_category: str
    secondary_category: str | None = None
    severity: SeverityT
    confidence: ConfidenceT
    reasoning: str
    prompt_version: str


class FinalClassification(BaseModel):
    rfi_item_id: str
    primary_category: str
    secondary_category: str | None = None
    severity: SeverityT
    confidence: ConfidenceT
    state: ReconciliationStateT
    rules_output: RulesPrediction
    ai_output: AiPrediction
    rules_version: str
    prompt_version: str
