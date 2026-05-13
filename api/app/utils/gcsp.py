"""GCSP MapServer queries for zone and overlay information.

Queries the publicly accessible Christchurch City Council GCSP MapServer
at https://gis.ccc.govt.nz/arcgis/rest/services/OpenData/GCSP/MapServer
"""

import asyncio
import logging

import httpx

GCSP_BASE_URL = "https://gis.ccc.govt.nz/arcgis/rest/services/OpenData/GCSP/MapServer"
logger = logging.getLogger(__name__)

# GCSP layer IDs
LAYERS = {
    "zone": 0,
    "liquefaction": 6,
    "flood": 7,
    "slope": 8,
    "tsunami": 9,
    "coastal_erosion": 10,
    "coastal_inundation": 11,
    "heritage_item": 12,
    "heritage_character": 13,
    "residential_character": 14,
    "protected_vegetation": 15,
    "notable_trees": 16,
}


async def query_zone(x: float, y: float) -> dict | None:
    """
    Query the GCSP Zone layer (layer 0) for zone information at NZTM2000 coordinate.
    
    Args:
        x: NZTM2000 easting coordinate
        y: NZTM2000 northing coordinate
    
    Returns:
        Dict with ZoneCode, ZoneType, SourceCouncil, or None if no zone found
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            params = {
                "geometry": f"{x},{y}",
                "geometryType": "esriGeometryPoint",
                "inSR": "2193",
                "spatialRel": "esriSpatialRelIntersects",
                "where": "1=1",
                "outFields": "ZoneCode,ZoneType,SourceCouncil",
                "returnGeometry": False,
                "f": "json",
            }

            url = f"{GCSP_BASE_URL}/{LAYERS['zone']}/query"
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            features = data.get("features") or []
            logger.info(
                "GCSP zone query x=%s y=%s status=%s features=%s",
                round(x, 3),
                round(y, 3),
                response.status_code,
                len(features),
            )
            if not features:
                logger.info("GCSP zone query empty response snippet=%s", str(data)[:500])

            if features:
                attrs = features[0].get("attributes", {})
                return {
                    "zone_code": attrs.get("ZoneCode"),
                    "zone_type": attrs.get("ZoneType"),
                    "source_council": attrs.get("SourceCouncil", "ccc").lower(),
                }
    except Exception as e:
        logger.exception("GCSP zone query failed x=%s y=%s error=%s", x, y, e)
        raise
    
    return None


async def query_overlay(x: float, y: float, overlay_name: str) -> bool:
    """
    Query if a coordinate intersects with a specific overlay.
    
    Args:
        x: NZTM2000 easting coordinate
        y: NZTM2000 northing coordinate
        overlay_name: Name of overlay (key in LAYERS dict)
    
    Returns:
        True if coordinate intersects overlay, False otherwise
    """
    if overlay_name not in LAYERS:
        return False
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            params = {
                "geometry": f"{x},{y}",
                "geometryType": "esriGeometryPoint",
                "inSR": "2193",
                "spatialRel": "esriSpatialRelIntersects",
                "where": "1=1",
                "outFields": "OBJECTID",
                "returnGeometry": False,
                "f": "json",
            }
            
            url = f"{GCSP_BASE_URL}/{LAYERS[overlay_name]}/query"
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            logger.debug(
                "GCSP overlay query overlay=%s x=%s y=%s status=%s features=%s",
                overlay_name,
                round(x, 3),
                round(y, 3),
                response.status_code,
                len(data.get("features") or []),
            )
            
            return bool(data.get("features"))
    except Exception as e:
        logger.exception(
            "GCSP overlay query failed overlay=%s x=%s y=%s error=%s",
            overlay_name, x, y, e,
        )
        # If query fails, assume overlay does not apply
        return False


async def query_all_overlays(x: float, y: float) -> dict[str, bool]:
    """
    Query all overlays in parallel for a given coordinate.
    
    Args:
        x: NZTM2000 easting coordinate
        y: NZTM2000 northing coordinate
    
    Returns:
        Dict mapping overlay names to boolean presence
    """
    overlay_keys = [k for k in LAYERS if k != "zone"]
    
    # Run queries concurrently
    tasks = [query_overlay(x, y, overlay) for overlay in overlay_keys]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Combine results, treating exceptions as False
    results = {}
    for overlay, result in zip(overlay_keys, results_list, strict=True):
        if isinstance(result, Exception):
            results[overlay] = False
        else:
            results[overlay] = result
    
    return results
