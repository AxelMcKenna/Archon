from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum

from app.services.duration_estimator import DurationEstimate


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    VERY_HIGH = "VERY_HIGH"


@dataclass
class RiskDimension:
    name: str
    level: RiskLevel
    score: int
    summary: str
    factors: list[str]
    mitigations: list[str]


@dataclass
class RiskProfile:
    overall: RiskDimension
    consentComplexity: RiskDimension
    costOverrun: RiskDimension
    timeline: RiskDimension
    siteRisk: RiskDimension
    generatedAt: str
    additionalSpecialistCostRange: dict[str, int]


COMPLEXITY_OVERLAY_SCORES = {
    "liquefaction": 25,
    "heritage": 22,
    "floodHigh": 18,
    "slopeHazard": 18,
    "coastalErosion": 15,
    "coastalInundation": 15,
    "tsunami": 12,
    "heritageChar": 10,
    "floodPonding": 8,
    "protectedVeg": 8,
    "notableTree": 8,
    "residentialChar": 5,
}
COMPLEXITY_ZONE_SCORES = {
    "commercial": 15,
    "industrial": 20,
    "rural": 10,
    "residential": 0,
    "openspace": 5,
    "general": 0,
}
COMPLEXITY_PROJECT_SCORES = {
    "new_dwelling": 10,
    "extension": 5,
    "accessory_building": 3,
    "deck": 0,
}

COST_OVERLAY_ADDERS = {
    "liquefaction": {"label": "Geotechnical report + peer review", "minCost": 8000, "maxCost": 35000},
    "heritage": {"label": "Heritage impact assessment", "minCost": 5000, "maxCost": 20000},
    "slopeHazard": {"label": "Slope stability assessment", "minCost": 6000, "maxCost": 18000},
    "floodHigh": {"label": "Flood hazard assessment", "minCost": 3000, "maxCost": 10000},
    "coastalErosion": {"label": "Coastal erosion risk assessment", "minCost": 4000, "maxCost": 14000},
    "coastalInundation": {"label": "Coastal inundation assessment", "minCost": 4000, "maxCost": 14000},
    "protectedVeg": {"label": "Arborist report", "minCost": 1500, "maxCost": 5000},
    "notableTree": {"label": "Notable tree assessment", "minCost": 1500, "maxCost": 5000},
    "heritageChar": {"label": "Heritage character assessment", "minCost": 2000, "maxCost": 8000},
    "tsunami": {"label": "Coastal hazard assessment", "minCost": 3000, "maxCost": 10000},
    "floodPonding": {"label": "Stormwater management plan", "minCost": 1500, "maxCost": 5000},
}

SITE_RISK_OVERLAY_SCORES = {
    "liquefaction": 30,
    "floodHigh": 25,
    "slopeHazard": 25,
    "coastalErosion": 20,
    "coastalInundation": 20,
    "tsunami": 15,
    "floodPonding": 10,
    "protectedVeg": 5,
    "notableTree": 5,
}

OVERLAY_MITIGATIONS = {
    "liquefaction": "Commission a site-specific geotechnical report pre-lodgement.",
    "floodHigh": "Obtain a flood certificate and confirm minimum floor levels.",
    "heritage": "Engage a heritage specialist and run a pre-lodgement meeting with council.",
    "slopeHazard": "Commission slope stability assessment before final design.",
    "coastalErosion": "Assess 100-year erosion horizon with sea-level-rise assumptions.",
    "coastalInundation": "Confirm inundation pathways and adaptation measures in design.",
    "tsunami": "Include coastal hazard specialist input in planning report.",
    "floodPonding": "Prepare a stormwater management and discharge strategy early.",
    "protectedVeg": "Engage a qualified arborist before earthworks design finalisation.",
    "notableTree": "Confirm tree protection zones and construction methodology.",
    "heritageChar": "Complete streetscape and heritage character assessment pre-lodgement.",
    "residentialChar": "Use urban design review to align built form with local character.",
}


def _level(score: int) -> RiskLevel:
    if score <= 20:
        return RiskLevel.LOW
    if score <= 45:
        return RiskLevel.MEDIUM
    if score <= 70:
        return RiskLevel.HIGH
    return RiskLevel.VERY_HIGH


def _ensure_mitigation(level: RiskLevel, mitigations: list[str]) -> list[str]:
    if level in {RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.VERY_HIGH} and not mitigations:
        return ["Run a pre-lodgement review with relevant specialists before submission."]
    return mitigations


def build_risk_profile(
    zone_category: str,
    project_type: str,
    active_overlays: list[str],
    duration: DurationEstimate,
) -> RiskProfile:
    complexity_score = min(
        100,
        COMPLEXITY_ZONE_SCORES.get(zone_category, 0)
        + COMPLEXITY_PROJECT_SCORES.get(project_type, 0)
        + sum(COMPLEXITY_OVERLAY_SCORES.get(overlay, 0) for overlay in active_overlays),
    )
    complexity_factors = [f"Overlay: {o}" for o in active_overlays]
    complexity_mitigations = [OVERLAY_MITIGATIONS[o] for o in active_overlays if o in OVERLAY_MITIGATIONS]
    complexity_level = _level(complexity_score)
    consent_complexity = RiskDimension(
        name="Consent Complexity",
        level=complexity_level,
        score=int(complexity_score),
        summary=f"Complexity score is {int(complexity_score)}/100 based on overlays, zone, and project type.",
        factors=complexity_factors or ["No high-complexity overlays detected."],
        mitigations=_ensure_mitigation(complexity_level, complexity_mitigations),
    )

    sum_min = sum(COST_OVERLAY_ADDERS.get(o, {}).get("minCost", 0) for o in active_overlays)
    sum_max = sum(COST_OVERLAY_ADDERS.get(o, {}).get("maxCost", 0) for o in active_overlays)
    cost_score = min(100, int((sum_min / 5000) * 20))
    cost_level = _level(cost_score)
    cost_overrun = RiskDimension(
        name="Cost Overrun",
        level=cost_level,
        score=cost_score,
        summary=f"Specialist scope may add approximately NZD {sum_min:,} to {sum_max:,}.",
        factors=[COST_OVERLAY_ADDERS[o]["label"] for o in active_overlays if o in COST_OVERLAY_ADDERS]
        or ["No major specialist cost drivers identified."],
        mitigations=_ensure_mitigation(
            cost_level, [OVERLAY_MITIGATIONS[o] for o in active_overlays if o in OVERLAY_MITIGATIONS]
        ),
    )

    timeline_score = min(100, int(duration.rfiProbability * 60 + (len(active_overlays) * 5)))
    timeline_level = _level(timeline_score)
    timeline = RiskDimension(
        name="Timeline",
        level=timeline_level,
        score=timeline_score,
        summary=f"Estimated RFI probability is {round(duration.rfiProbability * 100)}%, with P90 at {duration.totalProjectDaysP90} working days.",
        factors=[
            f"RFI probability: {round(duration.rfiProbability * 100)}%",
            f"Overlay count: {len(active_overlays)}",
        ],
        mitigations=_ensure_mitigation(
            timeline_level, [OVERLAY_MITIGATIONS[o] for o in active_overlays if o in OVERLAY_MITIGATIONS]
        ),
    )

    site_score = min(100, sum(SITE_RISK_OVERLAY_SCORES.get(o, 0) for o in active_overlays))
    site_level = _level(site_score)
    site_risk = RiskDimension(
        name="Site Risk",
        level=site_level,
        score=site_score,
        summary=f"Construction-phase site risk score is {site_score}/100 based on physical hazard overlays.",
        factors=[f"Site hazard: {o}" for o in active_overlays if o in SITE_RISK_OVERLAY_SCORES]
        or ["No major construction-phase hazard overlays identified."],
        mitigations=_ensure_mitigation(
            site_level, [OVERLAY_MITIGATIONS[o] for o in active_overlays if o in OVERLAY_MITIGATIONS]
        ),
    )

    overall_score = int(
        round(
            consent_complexity.score * 0.30
            + cost_overrun.score * 0.25
            + timeline.score * 0.25
            + site_risk.score * 0.20
        )
    )
    overall_level = _level(overall_score)
    overall = RiskDimension(
        name="Overall Risk",
        level=overall_level,
        score=overall_score,
        summary=f"Overall risk is {overall_level.value.replace('_', ' ').title()} based on consent, cost, timeline, and site risk.",
        factors=[
            f"Consent complexity: {consent_complexity.score}",
            f"Cost overrun: {cost_overrun.score}",
            f"Timeline: {timeline.score}",
            f"Site risk: {site_risk.score}",
        ],
        mitigations=_ensure_mitigation(
            overall_level, list(dict.fromkeys(consent_complexity.mitigations + timeline.mitigations))
        ),
    )

    return RiskProfile(
        overall=overall,
        consentComplexity=consent_complexity,
        costOverrun=cost_overrun,
        timeline=timeline,
        siteRisk=site_risk,
        generatedAt=datetime.now(UTC).isoformat(),
        additionalSpecialistCostRange={"min": int(sum_min), "max": int(sum_max)},
    )
