from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.services.mbie_scraper import BCAPerformance

BASE_RFI_RATE = 0.646
OVERLAY_RFI_MODIFIERS = {
    "liquefaction": 0.18,
    "floodHigh": 0.15,
    "heritage": 0.20,
    "slopeHazard": 0.12,
    "coastalErosion": 0.10,
    "coastalInundation": 0.10,
    "floodPonding": 0.05,
    "heritageChar": 0.08,
    "tsunami": 0.08,
    "protectedVeg": 0.06,
    "notableTree": 0.06,
    "residentialChar": 0.04,
}
PROJECT_TYPE_RFI_MODIFIERS = {
    "new_dwelling": 0.0,
    "extension": -0.05,
    "accessory_building": -0.15,
    "deck": -0.25,
}
PEAK_MONTHS = {10, 11, 12, 1, 2}


@dataclass
class DurationEstimate:
    statutoryProcessingDays: int
    rfiProbability: float
    expectedRfiSuspensionDays: int
    p50TotalElapsedDays: int
    p90TotalElapsedDays: int
    cccAdditionalDays: int
    totalProjectDaysP50: int
    totalProjectDaysP90: int
    calendarWeeksP50: float
    calendarWeeksP90: float
    notes: list[str]


def estimate_duration(
    bca_performance: BCAPerformance | None,
    active_overlays: list[str],
    project_type: str,
    lodgementMonth: int | None = None,
) -> DurationEstimate:
    month = lodgementMonth or datetime.now(UTC).month
    statutory = int(round(bca_performance.medianProcessingDaysResidential or 13)) if bca_performance else 13
    p50 = int(round(bca_performance.medianTotalElapsedDays or statutory)) if bca_performance else statutory
    ccc_days = 4

    rfi = BASE_RFI_RATE
    rfi += PROJECT_TYPE_RFI_MODIFIERS.get(project_type, 0.0)
    rfi += sum(OVERLAY_RFI_MODIFIERS.get(overlay, 0.0) for overlay in active_overlays)
    rfi = max(0.0, min(0.97, rfi))

    if month in PEAK_MONTHS:
        statutory = int(round(statutory * 1.15))
        p50 = int(round(p50 * 1.15))

    expected_rfi_days = int(round(rfi * 15))
    p90 = int(round(p50 * 1.4))
    total_p50 = p50 + ccc_days
    total_p90 = p90 + ccc_days
    notes = [
        "RFI probability is an estimate based on overlays and project type.",
        "Working-day estimates exclude statutory holiday effects.",
    ]
    if month in PEAK_MONTHS:
        notes.append("Peak-season lodgement adjustment applied (+15% for Oct-Feb).")

    return DurationEstimate(
        statutoryProcessingDays=statutory,
        rfiProbability=round(rfi, 3),
        expectedRfiSuspensionDays=expected_rfi_days,
        p50TotalElapsedDays=p50,
        p90TotalElapsedDays=p90,
        cccAdditionalDays=ccc_days,
        totalProjectDaysP50=total_p50,
        totalProjectDaysP90=total_p90,
        calendarWeeksP50=round(total_p50 / 5, 1),
        calendarWeeksP90=round(total_p90 / 5, 1),
        notes=notes,
    )
