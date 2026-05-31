"""Geocoding utilities using Nominatim (OpenStreetMap's free geocoder).

No API key required. Returns WGS84 coordinates.
Note: Nominatim requires a proper User-Agent header and respects rate limiting.
"""

import logging
import os
import time

import httpx

from app.config import get_settings

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
ANTIMERIDIAN_SAFE_CANTERBURY_VIEWBOX = "171.6,-42.2,173.4,-44.4"
ALLOWED_TERRITORIAL_AUTHORITIES = {
    "christchurch city",
    "selwyn district",
    "waimakariri district",
}
logger = logging.getLogger(__name__)
GEOAPIFY_AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete"

# Shared in-process Nominatim cooldown — once 429'd, fail fast for N seconds
# instead of stalling every keystroke / checklist click.
_NOMINATIM_BLOCKED_UNTIL: float = 0.0
_NOMINATIM_BLOCK_SECONDS: float = 300.0


async def geocode_address(address: str, city: str = "", postalcode: str = "") -> dict | None:
    """
    Geocode an address string to WGS84 coordinates using Nominatim.
    
    Args:
        address: Address string (e.g., "100 Bealey Ave, Christchurch")
    
    Returns:
        Dict with lat, lon, and display_name, or None if not found
    """
    # Nominatim requires proper User-Agent and respects rate limiting
    headers = {
        "User-Agent": "ARCHON/1.0 (https://archon.co.nz)",
    }
    
    address = address.strip()
    city = city.strip()
    postalcode = postalcode.strip()

    free_text_params = {
        "q": address,
        "countrycodes": "nz",
        "viewbox": ANTIMERIDIAN_SAFE_CANTERBURY_VIEWBOX,
        "bounded": 1,
        "format": "json",
        "addressdetails": 1,
        "limit": 1,
    }

    structured_params = {
        "street": address,
        "city": city,
        "postalcode": postalcode,
        "country": "nz",
        "viewbox": ANTIMERIDIAN_SAFE_CANTERBURY_VIEWBOX,
        "bounded": 1,
        "format": "json",
        "addressdetails": 1,
        "limit": 1,
    }
    
    global _NOMINATIM_BLOCKED_UNTIL
    if time.monotonic() < _NOMINATIM_BLOCKED_UNTIL:
        logger.info("geocode_address provider=nominatim cooldown_active address=%r", address)
        return None

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(NOMINATIM_URL, params=free_text_params, headers=headers)

            if response.status_code == 429:
                _NOMINATIM_BLOCKED_UNTIL = time.monotonic() + _NOMINATIM_BLOCK_SECONDS
                logger.warning(
                    "geocode_address provider=nominatim rate_limited address=%r — cooldown %ss",
                    address,
                    _NOMINATIM_BLOCK_SECONDS,
                )
                return None

            if response.status_code != 200:
                raise Exception(
                    f"Nominatim error {response.status_code}: {response.text}"
                )

            data = response.json()
            if not data and (city or postalcode):
                structured_response = await client.get(
                    NOMINATIM_URL,
                    params=structured_params,
                    headers=headers,
                )
                if structured_response.status_code == 429:
                    _NOMINATIM_BLOCKED_UNTIL = time.monotonic() + _NOMINATIM_BLOCK_SECONDS
                    return None
                if structured_response.status_code != 200:
                    raise Exception(
                        f"Nominatim error {structured_response.status_code}: "
                        f"{structured_response.text}"
                    )
                data = structured_response.json()

            if data:
                result = data[0]
                if not _is_within_supported_region(result):
                    return None
                lat = result.get("lat")
                lon = result.get("lon")
                if lat is None or lon is None:
                    return None
                return {
                    "lat": float(lat),
                    "lon": float(lon),
                    "display_name": result.get("display_name"),
                }
    except httpx.RequestError as e:
        raise Exception(f"Geocoding request failed: {e!s}") from e
    
    return None


async def suggest_addresses(query: str, limit: int = 6) -> list[dict]:
    query = query.strip()
    if len(query) < 3:
        return []
    effective_limit = max(1, min(limit, 10))

    settings = get_settings()
    geoapify_key = (
        settings.geoapify_api_key.strip()
        or os.getenv("GEOAPIFY_API_KEY", "").strip()
    )
    logger.info("address suggest geoapify_key_present=%s", bool(geoapify_key))
    if geoapify_key:
        geoapify_results = await _suggest_addresses_geoapify(query, effective_limit, geoapify_key)
        if geoapify_results:
            logger.info(
                "address suggest provider=geoapify q=%r requested=%s returned=%s",
                query,
                effective_limit,
                len(geoapify_results),
            )
            return geoapify_results
        logger.info(
            "address suggest provider=geoapify q=%r requested=%s returned=0 falling_back=nominatim",
            query,
            effective_limit,
        )

    # Honour cooldown set by a previous 429 — fail fast instead of stalling
    # the UI for every subsequent keystroke.
    global _NOMINATIM_BLOCKED_UNTIL
    if time.monotonic() < _NOMINATIM_BLOCKED_UNTIL:
        logger.info("address suggest provider=nominatim cooldown_active q=%r", query)
        return []

    headers = {
        "User-Agent": "ARCHON/1.0 (https://archon.co.nz)",
    }
    params = {
        "q": query,
        "countrycodes": "nz",
        "viewbox": ANTIMERIDIAN_SAFE_CANTERBURY_VIEWBOX,
        "bounded": 0,
        "format": "json",
        "addressdetails": 1,
        "limit": max(10, effective_limit * 3),
    }

    try:
        # Tight timeout — autocomplete must feel instant, not "wait 15s for
        # a hint." If upstream is sluggish, return nothing and let the user
        # finish typing.
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(NOMINATIM_URL, params=params, headers=headers)
            if response.status_code == 429:
                _NOMINATIM_BLOCKED_UNTIL = time.monotonic() + _NOMINATIM_BLOCK_SECONDS
                logger.warning(
                    "address suggest provider=nominatim rate_limited q=%r — cooldown %ss",
                    query,
                    _NOMINATIM_BLOCK_SECONDS,
                )
                return []
            if response.status_code != 200:
                return []

            combined: list[dict] = []
            seen_names: set[str] = set()
            for item in response.json():
                display_name = item.get("display_name")
                if display_name and display_name not in seen_names:
                    seen_names.add(display_name)
                    combined.append(item)

            results: list[dict] = []
            for item in combined:
                if _is_within_supported_region(item):
                    display_name = item.get("display_name")
                    if display_name:
                        results.append(
                            {
                                "display_name": display_name,
                                "lat": item.get("lat"),
                                "lon": item.get("lon"),
                            }
                        )

            query_tokens = [t.lower() for t in query.replace(",", " ").split() if t.strip()]

            def rank(item: dict) -> tuple[int, int]:
                name = str(item.get("display_name", "")).lower()
                token_hits = sum(1 for token in query_tokens if token in name)
                starts = 1 if name.startswith(query.lower()) else 0
                return (starts, token_hits)

            ranked = sorted(results, key=rank, reverse=True)[:effective_limit]
            logger.info(
                "address suggest provider=nominatim q=%r requested=%s returned=%s",
                query,
                effective_limit,
                len(ranked),
            )
            return ranked
    except httpx.RequestError:
        logger.exception("address suggest provider=nominatim request_error q=%r", query)
        return []


async def _suggest_addresses_geoapify(query: str, limit: int, api_key: str) -> list[dict]:
    params = {
        "text": query,
        "filter": "countrycode:nz",
        "bias": "proximity:172.6362,-43.5321",
        "limit": max(1, min(limit, 10)),
        "format": "json",
        "apiKey": api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(GEOAPIFY_AUTOCOMPLETE_URL, params=params)
            if response.status_code != 200:
                logger.warning(
                    "address suggest provider=geoapify non_200 q=%r status=%s body=%s",
                    query,
                    response.status_code,
                    response.text[:300],
                )
                return []
            payload = response.json()
            rows = payload.get("results", []) if isinstance(payload, dict) else []
            logger.info(
                "address suggest provider=geoapify q=%r raw_count=%s",
                query,
                len(rows),
            )
            out: list[dict] = []
            for row in rows:
                if not _is_geoapify_within_supported_region(row):
                    continue
                display_name = row.get("formatted")
                if not display_name:
                    continue
                out.append(
                    {
                        "display_name": display_name,
                        "lat": str(row.get("lat")) if row.get("lat") is not None else None,
                        "lon": str(row.get("lon")) if row.get("lon") is not None else None,
                    }
                )
            logger.info(
                "address suggest provider=geoapify q=%r filtered_count=%s",
                query,
                len(out),
            )
            return out
    except httpx.RequestError:
        logger.exception("address suggest provider=geoapify request_error q=%r", query)
        return []


def _is_within_supported_region(result: dict) -> bool:
    address = result.get("address", {})
    county = str(address.get("county", "")).lower().strip()
    city = str(address.get("city", "")).lower().strip()
    town = str(address.get("town", "")).lower().strip()
    municipality = str(address.get("municipality", "")).lower().strip()
    state = str(address.get("state", "")).lower().strip()
    display_name = str(result.get("display_name", "")).lower()

    if county in ALLOWED_TERRITORIAL_AUTHORITIES:
        return True
    if city == "christchurch" or town == "christchurch":
        return True
    if municipality in {"selwyn", "waimakariri"}:
        return True
    return "canterbury" in state and any(
        token in display_name
        for token in ("christchurch", "selwyn", "waimakariri")
    )


def _is_geoapify_within_supported_region(result: dict) -> bool:
    county = str(result.get("county", "")).lower().strip()
    city = str(result.get("city", "")).lower().strip()
    state = str(result.get("state", "")).lower().strip()
    formatted = str(result.get("formatted", "")).lower()
    if county in ALLOWED_TERRITORIAL_AUTHORITIES:
        return True
    if city == "christchurch":
        return True
    return "canterbury" in state and any(
        token in formatted
        for token in ("christchurch", "selwyn", "waimakariri")
    )
