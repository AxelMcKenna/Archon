"""Coordinate system conversion utilities.

Handles conversion between WGS84 (lat/lon) and NZTM2000 (EPSG:2193) using
Transverse Mercator projection parameters specific to New Zealand.
"""

import math
from functools import lru_cache

from pyproj import Transformer


# NZTM2000 (EPSG:2193) projection parameters
NZTM_PARAMS = {
    "lat_origin": -41.0,
    "lon_origin": 173.0,
    "false_easting": 2000000.0,
    "false_northing": 3000000.0,
    "scale_factor": 0.9996,
    "semi_major_axis": 6378137.0,  # WGS84 / GRS80
    "semi_minor_axis": 6356752.31414,  # WGS84 / GRS80
}


def calculate_eccentricity():
    """Calculate eccentricity values for the WGS84 ellipsoid."""
    a = NZTM_PARAMS["semi_major_axis"]
    b = NZTM_PARAMS["semi_minor_axis"]
    e2 = 1 - (b * b) / (a * a)
    e = math.sqrt(e2)
    ep2 = e2 / (1 - e2)
    return e, ep2, e2


def wgs84_to_nztm2000(lat: float, lon: float) -> tuple[float, float]:
    """
    Convert WGS84 coordinates to NZTM2000 (EPSG:2193).
    
    Args:
        lat: Latitude in decimal degrees (WGS84)
        lon: Longitude in decimal degrees (WGS84)
    
    Returns:
        Tuple of (easting, northing) in NZTM2000 coordinates
    """
    transformer = _wgs84_to_nztm_transformer()
    easting, northing = transformer.transform(lon, lat)
    return float(easting), float(northing)


@lru_cache(maxsize=1)
def _wgs84_to_nztm_transformer() -> Transformer:
    # always_xy=True => input/output is lon,lat ordering for geographic CRS
    return Transformer.from_crs("EPSG:4326", "EPSG:2193", always_xy=True)


def nztm2000_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    """
    Convert NZTM2000 (EPSG:2193) coordinates to WGS84.
    
    Args:
        easting: Easting in NZTM2000 coordinates
        northing: Northing in NZTM2000 coordinates
    
    Returns:
        Tuple of (latitude, longitude) in decimal degrees (WGS84)
    """
    e, ep2, e2 = calculate_eccentricity()
    a = NZTM_PARAMS["semi_major_axis"]
    b = NZTM_PARAMS["semi_minor_axis"]
    k0 = NZTM_PARAMS["scale_factor"]
    
    # Remove false easting/northing
    x = easting - NZTM_PARAMS["false_easting"]
    y = northing - NZTM_PARAMS["false_northing"]
    
    # Calculate footpoint latitude
    M = y / k0
    mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256))
    
    phi1_rad = (
        mu
        + (3*e2/8 + 3*e2*e2/32 - 45*e2*e2*e2/1024) * math.sin(2*mu)
        + (15*e2*e2/256 - 45*e2*e2*e2/1024) * math.sin(4*mu)
        + (35*e2*e2*e2/3072) * math.sin(6*mu)
    )
    
    # Calculate latitude and longitude
    N1 = a / math.sqrt(1 - e2 * math.sin(phi1_rad) ** 2)
    T1 = math.tan(phi1_rad) ** 2
    C1 = ep2 * math.cos(phi1_rad) ** 2
    R1 = a * (1 - e2) / math.sqrt((1 - e2 * math.sin(phi1_rad) ** 2) ** 3)
    D = x / (N1 * k0)
    
    lat_rad = (
        phi1_rad
        - (N1 * math.tan(phi1_rad) / R1) * (
            (D**2/2) - (D**4/24) * (5 + 3*T1 + 10*C1 - 4*C1**2 - 9*ep2)
            + (D**6/720) * (61 + 90*T1 + 28*T1**2 + 45*C1**2 - 252*ep2 - 3*C1**2**2)
        )
    )
    
    lon_rad = (
        math.radians(NZTM_PARAMS["lon_origin"])
        + (D - (D**3/6) * (1 + 2*T1 + C1)
           + (D**5/120) * (1 - 2*C1 + T1**2 + 61*C1**2 - 58*ep2))
        / math.cos(phi1_rad)
    )
    
    return math.degrees(lat_rad), math.degrees(lon_rad)
