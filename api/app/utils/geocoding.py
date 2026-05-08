"""Geocoding utilities using Nominatim (OpenStreetMap's free geocoder).

No API key required. Returns WGS84 coordinates.
Note: Nominatim requires a proper User-Agent header and respects rate limiting.
"""

import httpx
import asyncio
from typing import Optional


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


async def geocode_address(address: str, city: str = "", postalcode: str = "") -> Optional[dict]:
    """
    Geocode an address string to WGS84 coordinates using Nominatim.
    
    Args:
        address: Address string (e.g., "100 Bealey Ave, Christchurch")
    
    Returns:
        Dict with lat, lon, and display_name, or None if not found
    """
    # Nominatim requires proper User-Agent and respects rate limiting
    headers = {
        "User-Agent": "ConsentIQ/1.0 (https://consentiq.nz)",
    }
    
    address = address.strip()
    city = city.strip()
    postalcode = postalcode.strip()

    free_text_params = {
        "q": address,
        "countrycodes": "nz",
        "format": "json",
        "addressdetails": 1,
        "limit": 1,
    }

    structured_params = {
        "street": address,
        "city": city,
        "postalcode": postalcode,
        "country": "nz",
        "format": "json",
        "addressdetails": 1,
        "limit": 1,
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(NOMINATIM_URL, params=free_text_params, headers=headers)
            
            # Handle 429 (rate limit) with backoff
            if response.status_code == 429:
                await asyncio.sleep(1)
                return await geocode_address(address, city, postalcode)  # Retry once
            
            # Handle other errors more gracefully
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
                if structured_response.status_code != 200:
                    raise Exception(
                        f"Nominatim error {structured_response.status_code}: {structured_response.text}"
                    )
                data = structured_response.json()

            if data:
                result = data[0]
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
        raise Exception(f"Geocoding request failed: {str(e)}")
    
    return None
