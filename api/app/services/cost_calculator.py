from __future__ import annotations

from dataclasses import dataclass

CCC_FEE_SCHEDULE = [
    {"min": 0, "max": 19999, "baseFee": 640, "perThousand": 0},
    {"min": 20000, "max": 49999, "baseFee": 640, "perThousand": 9.50},
    {"min": 50000, "max": 99999, "baseFee": 925, "perThousand": 8.20},
    {"min": 100000, "max": 249999, "baseFee": 1335, "perThousand": 7.10},
    {"min": 250000, "max": 499999, "baseFee": 2400, "perThousand": 6.50},
    {"min": 500000, "max": 999999, "baseFee": 4025, "perThousand": 5.80},
    {"min": 1000000, "max": None, "baseFee": 6925, "perThousand": 5.20},
]

MBIE_LEVY_RATE = 0.001092
MBIE_LEVY_THRESHOLD = 20444

CCC_DEV_CONTRIBUTIONS = {
    "residential": 14200,
    "commercial": 22500,
    "industrial": 8900,
    "rural": 4100,
    "openspace": 0,
    "general": 14200,
}
SELWYN_DEV_CONTRIBUTIONS = {"residential": 18400, "general": 18400}
WAIMAKARIRI_DEV_CONTRIBUTIONS = {"residential": 12800, "general": 12800}


@dataclass
class CostEstimate:
    consentFee: float
    mbieLevey: float
    developmentContribution: float
    total: float
    breakdown: list[dict]
    notes: list[str]
    councilName: str


def _consent_fee(value: float) -> float:
    for band in CCC_FEE_SCHEDULE:
        max_value = band["max"]
        if max_value is None or value <= max_value:
            variable = ((value - band["min"]) / 1000) * band["perThousand"]
            return round(band["baseFee"] + max(0.0, variable), 2)
    return 0.0


def _dev_contribution(council_name: str, zone_category: str) -> float:
    zone = zone_category if zone_category in CCC_DEV_CONTRIBUTIONS else "general"
    if council_name == "Selwyn":
        return float(SELWYN_DEV_CONTRIBUTIONS.get(zone, SELWYN_DEV_CONTRIBUTIONS["general"]))
    if council_name == "Waimakariri":
        return float(
            WAIMAKARIRI_DEV_CONTRIBUTIONS.get(zone, WAIMAKARIRI_DEV_CONTRIBUTIONS["general"])
        )
    return float(CCC_DEV_CONTRIBUTIONS.get(zone, CCC_DEV_CONTRIBUTIONS["general"]))


def calculate_consent_costs(
    constructionValue: float,
    zoneCategory: str,
    projectType: str,
    councilName: str = "Christchurch City",
) -> CostEstimate:
    value = max(0.0, float(constructionValue))
    consent_fee = _consent_fee(value)
    mbie_levy = round(max(0.0, (value - MBIE_LEVY_THRESHOLD) * MBIE_LEVY_RATE), 2)
    notes = [
        "Council processing fees are estimate-only and may vary based on complexity and inspections.",
        "MBIE levy threshold is indexed annually.",
    ]

    if projectType == "new_dwelling":
        dev = _dev_contribution(councilName, zoneCategory)
    else:
        dev = 0.0
        notes.append("Development contributions apply to new dwellings only.")

    total = round(consent_fee + mbie_levy + dev, 2)
    breakdown = [
        {"label": "Council consent processing fee", "amount": consent_fee},
        {"label": "MBIE building levy", "amount": mbie_levy},
        {"label": "Development contribution", "amount": dev},
    ]
    return CostEstimate(
        consentFee=consent_fee,
        mbieLevey=mbie_levy,
        developmentContribution=dev,
        total=total,
        breakdown=breakdown,
        notes=notes,
        councilName=councilName,
    )
