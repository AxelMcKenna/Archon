"""POST /address-to-checklist — accept an address, return zone info and required documents.

Flow:
1. Geocode address using Nominatim
2. Convert WGS84 to NZTM2000
3. Query GCSP FeatureServer for zone and overlays
4. Map results to required documents using rules engine
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

from app.utils.geocoding import geocode_address
from app.utils.coordinates import wgs84_to_nztm2000
from app.utils.gcsp import query_zone, query_all_overlays
from app.utils.document_rules import get_required_documents


class AddressQuery(BaseModel):
    address: str
    city: str = ""
    postalcode: str = ""


class DocumentRequirement(BaseModel):
    document_type: str
    category: str
    reason: str
    triggered_by: list[str]


class AddressChecklistResponse(BaseModel):
    address: str
    coordinates: dict
    zone_info: dict
    overlays: dict
    required_documents: list[DocumentRequirement]


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", response_model=AddressChecklistResponse)
async def address_to_checklist(query: AddressQuery) -> AddressChecklistResponse:
    """
    Convert an address to a resource consent checklist.
    
    Steps:
    1. Geocode the address (WGS84)
    2. Convert to NZTM2000
    3. Query GCSP for zone and overlays
    4. Generate required documents list
    """
    
    # Step 1: Geocode
    try:
        geocoding_result = await geocode_address(query.address, query.city, query.postalcode)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Geocoding service error: {str(e)}"
        )
    
    if not geocoding_result:
        raise HTTPException(
            status_code=404,
            detail=f"Could not geocode address: {query.address}. Try including suburb/city name (e.g., '100 Bealey Ave, Christchurch')."
        )
    
    lat = geocoding_result["lat"]
    lon = geocoding_result["lon"]
    logger.info(
        "Address checklist geocoded input_address=%r city=%r postalcode=%r lat=%s lon=%s display_name=%r",
        query.address,
        query.city,
        query.postalcode,
        lat,
        lon,
        geocoding_result.get("display_name"),
    )
    
    # Step 2: Convert to NZTM2000
    try:
        nztm_x, nztm_y = wgs84_to_nztm2000(lat, lon)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Coordinate conversion error: {str(e)}"
        )
    
    logger.info(
        "Address checklist projected lat=%s lon=%s nztm_x=%s nztm_y=%s",
        lat,
        lon,
        round(nztm_x, 3),
        round(nztm_y, 3),
    )

    # Step 3: Query GCSP
    try:
        zone_info = await query_zone(nztm_x, nztm_y)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"GCSP FeatureServer error: {str(e)}"
        )
    
    if not zone_info:
        logger.warning(
            "Address checklist zone miss input_address=%r lat=%s lon=%s nztm_x=%s nztm_y=%s",
            query.address,
            lat,
            lon,
            round(nztm_x, 3),
            round(nztm_y, 3),
        )
        raise HTTPException(
            status_code=404,
            detail=f"Address is outside Canterbury councils' jurisdiction (CCC, Selwyn, Waimakariki)"
        )
    
    try:
        overlays = await query_all_overlays(nztm_x, nztm_y)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Overlay query error: {str(e)}"
        )
    
    # Step 4: Generate documents list
    try:
        required_docs = get_required_documents(zone_info.get("zone_code"), overlays)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Document rules error: {str(e)}"
        )
    
    return AddressChecklistResponse(
        address=geocoding_result.get("display_name", query.address),
        coordinates={
            "nztm_x": round(nztm_x, 2),
            "nztm_y": round(nztm_y, 2),
            "lat": lat,
            "lon": lon,
        },
        zone_info=zone_info,
        overlays=overlays,
        required_documents=[
            DocumentRequirement(**doc) for doc in required_docs
        ],
    )
