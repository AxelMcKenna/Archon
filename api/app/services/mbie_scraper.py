from __future__ import annotations

import json
import threading
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

CANTERBURY_BCAS = {
    "Christchurch City",
    "Waimakariri",
    "Selwyn",
    "Hurunui",
    "Ashburton",
}

MBIE_URL = (
    "https://www.mbie.govt.nz/building-and-energy/building/"
    "building-system-insights-programme/building-consent-system-performance-monitoring"
)
CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / "mbie_cache.json"
CACHE_TTL_HOURS = 24


@dataclass
class BCAPerformance:
    bca: str
    medianProcessingDaysAllApplications: float | None
    medianProcessingDaysBuildingConsents: float | None
    medianProcessingDaysResidential: float | None
    medianTotalElapsedDays: float | None
    scrapedAt: str


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_bca_name(name: str) -> str | None:
    value = (name or "").strip().lower()
    if "christchurch" in value:
        return "Christchurch City"
    if "waimakariri" in value:
        return "Waimakariri"
    if "selwyn" in value:
        return "Selwyn"
    if "hurunui" in value:
        return "Hurunui"
    if "ashburton" in value:
        return "Ashburton"
    return None


def _fallback_data() -> dict[str, BCAPerformance]:
    scraped_at = _utc_now().isoformat()
    return {
        "Christchurch City": BCAPerformance(
            bca="Christchurch City",
            medianProcessingDaysAllApplications=None,
            medianProcessingDaysBuildingConsents=None,
            medianProcessingDaysResidential=13,
            medianTotalElapsedDays=17,
            scrapedAt=scraped_at,
        ),
        "Waimakariri": BCAPerformance(
            bca="Waimakariri",
            medianProcessingDaysAllApplications=None,
            medianProcessingDaysBuildingConsents=None,
            medianProcessingDaysResidential=11,
            medianTotalElapsedDays=18,
            scrapedAt=scraped_at,
        ),
        "Selwyn": BCAPerformance(
            bca="Selwyn",
            medianProcessingDaysAllApplications=None,
            medianProcessingDaysBuildingConsents=None,
            medianProcessingDaysResidential=8,
            medianTotalElapsedDays=10,
            scrapedAt=scraped_at,
        ),
    }


def _load_cache(ignore_ttl: bool = False) -> dict[str, BCAPerformance] | None:
    if not CACHE_PATH.exists():
        return None
    raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    scraped_at = datetime.fromisoformat(raw.get("scrapedAt", "1970-01-01T00:00:00+00:00"))
    if not ignore_ttl and _utc_now() - scraped_at > timedelta(hours=CACHE_TTL_HOURS):
        return None
    data = raw.get("data", {})
    return {name: BCAPerformance(**row) for name, row in data.items()}


def _save_cache(data: dict[str, BCAPerformance]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "scrapedAt": _utc_now().isoformat(),
        "data": {name: asdict(value) for name, value in data.items()},
    }
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _parse_value(value: str) -> float | None:
    cleaned = (value or "").replace(",", "").strip()
    if not cleaned or cleaned in {"-", "n/a", "N/A"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_tables(html: str) -> dict[str, BCAPerformance]:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    figure_tables = tables[:4]
    scraped_at = _utc_now().isoformat()
    result: dict[str, BCAPerformance] = {
        bca: BCAPerformance(
            bca=bca,
            medianProcessingDaysAllApplications=None,
            medianProcessingDaysBuildingConsents=None,
            medianProcessingDaysResidential=None,
            medianTotalElapsedDays=None,
            scrapedAt=scraped_at,
        )
        for bca in CANTERBURY_BCAS
    }
    keys = [
        "medianProcessingDaysAllApplications",
        "medianProcessingDaysBuildingConsents",
        "medianProcessingDaysResidential",
        "medianTotalElapsedDays",
    ]
    for idx, table in enumerate(figure_tables):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["th", "td"])
            if len(cells) < 2:
                continue
            bca_name = _normalize_bca_name(cells[0].get_text(" ", strip=True))
            if bca_name not in CANTERBURY_BCAS:
                continue
            value = _parse_value(cells[1].get_text(" ", strip=True))
            setattr(result[bca_name], keys[idx], value)
    return result


def _refresh_background() -> None:
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            response = client.get(MBIE_URL)
            response.raise_for_status()
        parsed = _parse_tables(response.text)
        _save_cache(parsed)
    except Exception:
        return


def scrape_mbie_data() -> dict[str, BCAPerformance]:
    fresh_cache = _load_cache(ignore_ttl=False)
    if fresh_cache:
        return fresh_cache

    stale_cache = _load_cache(ignore_ttl=True)
    if stale_cache:
        threading.Thread(target=_refresh_background, daemon=True).start()
        return stale_cache

    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            response = client.get(MBIE_URL)
            response.raise_for_status()
        parsed = _parse_tables(response.text)
        _save_cache(parsed)
        return parsed
    except Exception:
        stale_cache = _load_cache(ignore_ttl=True)
        if stale_cache:
            return stale_cache
        return _fallback_data()
