from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from supabase import Client

from app.auth import get_db


class ServiceConnections(BaseModel):
    water: bool = False
    wastewater: bool = False
    stormwater: bool = False


class ProjectDetails(BaseModel):
    projectType: Literal["new_dwelling", "extension", "accessory_building", "deck"]
    estimatedFloorAreaM2: int | None = Field(default=None, ge=0)
    estimatedConstructionValueNZD: int | None = Field(default=None, ge=0)
    involvesStructuralWork: bool = False
    involvesEarthworks: bool = False
    existingStructureDemolished: bool = False
    yearOfConstruction: int | None = None
    newRoadAccess: bool = False
    newServiceConnections: ServiceConnections = Field(default_factory=ServiceConnections)


class ResolveDocumentsRequest(BaseModel):
    zoneCategory: str
    activeOverlays: list[str]
    projectDetails: ProjectDetails


class Document(BaseModel):
    id: str
    title: str
    description: str
    category: str
    trigger: str
    specialist: str | None
    referenceClause: str | None


class ResolveDocumentsResponse(BaseModel):
    documents: list[Document]
    totalCount: int
    specialistCount: int


router = APIRouter()

_CATEGORY_ORDER = {"baseline": 0, "location": 1, "project": 2, "specialist": 3}
_ALLOWED_ZONE_CATEGORIES = {
    "residential",
    "commercial",
    "industrial",
    "rural",
    "openspace",
    "general",
}


def _rules_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "document_rules.json"


with _rules_path().open("r", encoding="utf-8") as f:
    RULES = json.load(f)


def _normalize_zone_category(raw: str) -> str:
    candidate = (raw or "").strip().lower()
    return candidate if candidate in _ALLOWED_ZONE_CATEGORIES else "general"


def _add_docs(target: dict[str, dict], docs: list[dict]) -> None:
    for doc in docs:
        doc_id = doc.get("id")
        if doc_id and doc_id not in target:
            target[doc_id] = doc


@router.post("", response_model=ResolveDocumentsResponse)
async def resolve_documents(
    payload: ResolveDocumentsRequest,
    _db: Client = Depends(get_db),
) -> ResolveDocumentsResponse:
    matched: dict[str, dict] = {}

    _add_docs(matched, RULES.get("baseline", []))

    zone_category = _normalize_zone_category(payload.zoneCategory)
    zone_docs = RULES.get("byZoneCategory", {}).get(zone_category, [])
    _add_docs(matched, zone_docs)

    overlay_map = RULES.get("byOverlay", {})
    for overlay in payload.activeOverlays:
        _add_docs(matched, overlay_map.get(overlay, []))

    project_details = payload.projectDetails
    _add_docs(
        matched,
        RULES.get("byProjectType", {}).get(project_details.projectType, []),
    )

    details_rules = RULES.get("byProjectDetails", {})
    for flag_name in (
        "involvesStructuralWork",
        "involvesEarthworks",
        "existingStructureDemolished",
        "newRoadAccess",
    ):
        if getattr(project_details, flag_name):
            _add_docs(matched, details_rules.get(flag_name, []))

    connections_rules = details_rules.get("newServiceConnections", {})
    for service_name in ("water", "wastewater", "stormwater"):
        if getattr(project_details.newServiceConnections, service_name):
            _add_docs(matched, connections_rules.get(service_name, []))

    thresholds = details_rules.get("thresholds", {})
    floor_area = project_details.estimatedFloorAreaM2 or 0
    value_nzd = project_details.estimatedConstructionValueNZD or 0

    if floor_area > 100:
        _add_docs(matched, thresholds.get("floorAreaOver100m2", []))
    if floor_area > 300:
        _add_docs(matched, thresholds.get("floorAreaOver300m2", []))
    if value_nzd > 500000:
        _add_docs(matched, thresholds.get("constructionValueOver500k", []))
    if value_nzd > 2000000:
        _add_docs(matched, thresholds.get("constructionValueOver2m", []))

    if (
        project_details.existingStructureDemolished
        and project_details.yearOfConstruction is not None
        and project_details.yearOfConstruction < 1990
    ):
        _add_docs(matched, details_rules.get("pre1990Demolition", []))

    ordered_docs = sorted(
        (Document(**doc) for doc in matched.values()),
        key=lambda d: (_CATEGORY_ORDER.get(d.category, 99), d.title.lower()),
    )
    specialist_count = sum(1 for doc in ordered_docs if doc.specialist)

    return ResolveDocumentsResponse(
        documents=ordered_docs,
        totalCount=len(ordered_docs),
        specialistCount=specialist_count,
    )
