from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.cost_calculator import calculate_consent_costs
from app.services.duration_estimator import estimate_duration
from app.services.forecast_summarizer import summarize_forecast
from app.services.mbie_scraper import scrape_mbie_data
from app.services.risk_profiler import build_risk_profile

router = APIRouter()


class ServiceConnections(BaseModel):
    water: bool = False
    wastewater: bool = False
    stormwater: bool = False


class ForecastRequest(BaseModel):
    address: str
    lat: float
    lon: float
    zoneCategory: str
    activeOverlays: list[str]
    projectType: Literal["new_dwelling", "extension", "accessory_building", "deck"]
    estimatedFloorAreaM2: Optional[int] = None
    estimatedConstructionValueNZD: Optional[int] = None
    involvesStructuralWork: bool = False
    involvesEarthworks: bool = False
    existingStructureDemolished: bool = False
    newRoadAccess: bool = False
    yearOfConstruction: Optional[int] = None
    newServiceConnections: ServiceConnections = Field(default_factory=ServiceConnections)
    lodgementMonth: Optional[int] = Field(default=None, ge=1, le=12)


CANTERBURY_COUNCIL_BOUNDS = [
    {"name": "Selwyn", "latMin": -44.0, "latMax": -43.4, "lonMin": 171.6, "lonMax": 172.5},
    {"name": "Waimakariri", "latMin": -43.4, "latMax": -43.1, "lonMin": 172.2, "lonMax": 172.8},
    {"name": "Hurunui", "latMin": -43.1, "latMax": -42.5, "lonMin": 172.0, "lonMax": 173.0},
    {"name": "Ashburton", "latMin": -44.2, "latMax": -43.8, "lonMin": 171.5, "lonMax": 172.2},
]


def resolve_council(lat: float, lon: float) -> str:
    for bounds in CANTERBURY_COUNCIL_BOUNDS:
        if bounds["latMin"] <= lat <= bounds["latMax"] and bounds["lonMin"] <= lon <= bounds["lonMax"]:
            return bounds["name"]
    return "Christchurch City"


@router.post("/forecast")
async def forecast(payload: ForecastRequest) -> dict:
    council = resolve_council(payload.lat, payload.lon)
    mbie = scrape_mbie_data()
    bca_data = mbie.get(council) or mbie.get("Christchurch City")
    duration = estimate_duration(
        bca_performance=bca_data,
        active_overlays=payload.activeOverlays,
        project_type=payload.projectType,
        lodgementMonth=payload.lodgementMonth,
    )
    risk = build_risk_profile(
        zone_category=payload.zoneCategory,
        project_type=payload.projectType,
        active_overlays=payload.activeOverlays,
        duration=duration,
    )
    costs = None
    notes: list[str] = []
    if payload.estimatedConstructionValueNZD is not None:
        costs = calculate_consent_costs(
            constructionValue=float(payload.estimatedConstructionValueNZD),
            zoneCategory=payload.zoneCategory,
            projectType=payload.projectType,
            councilName=council,
        )
    else:
        notes.append("Construction value is missing; cost estimate is unavailable.")

    return {
        "costs": asdict(costs) if costs else None,
        "duration": asdict(duration),
        "risk": asdict(risk),
        "councilName": council,
        "dataFreshness": (bca_data.scrapedAt if bca_data else datetime.now(UTC).isoformat()),
        "notes": notes,
        "disclaimer": (
            "Estimates based on publicly available data. Verify with your council before "
            "making financial commitments."
        ),
    }


class ForecastSummaryRequest(BaseModel):
    address: str | None = None
    projectType: str | None = None
    councilName: str | None = None
    costs: dict | None = None
    duration: dict | None = None
    risk: dict | None = None


@router.post("/forecast/summary")
async def forecast_summary(payload: ForecastSummaryRequest) -> dict:
    summary, error = summarize_forecast(payload.model_dump(exclude_none=True))
    return {"summary": summary, "error": error}
