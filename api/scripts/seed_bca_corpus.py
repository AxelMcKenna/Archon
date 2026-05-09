"""Seed bca_corpus with synthetic RFI items per BCA.

Distribution mirrors BRANZ findings:
  B1 ~30%, E2 ~22%, docs ~25%, others ~23%.

Run:
    uv run python -m scripts.seed_bca_corpus

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
This is the synthetic seed PRD §7.1 calls for; replace with OIA data later.
"""

from __future__ import annotations

import os
import sys
from typing import Any

from supabase import create_client

# (category, severity, example_text, trigger, resolution)
SEED_ITEMS: list[tuple[str, str, str, str, str]] = [
    # B1 — structure
    ("building_code:B1", "must_resolve",
     "Provide structural calculations demonstrating compliance with B1 for first-floor framing.",
     "Multi-storey or non-trivial framing without engineer input",
     "Engineer-stamped calcs (PS1) covering vertical, lateral and seismic loads."),
    ("building_code:B1", "must_resolve",
     "Bracing line layout per NZS 3604:2011 is required.",
     "Schedule method bracing not shown",
     "Bracing schedule with achieved BUs vs demand BUs by line."),
    ("building_code:B1", "must_resolve",
     "Foundation design for soil class E requires CPEng review.",
     "Site soils not type 1-3",
     "Geotech report + foundation PS1."),
    ("building_code:B1", "must_resolve",
     "Wind zone calculations and lateral load resistance details required.",
     "Wind exposure not derived from NZS 3604/3604:2011 contour map",
     "Wind zone calc + bracing schedule that meets the wind demand."),
    ("building_code:B1", "must_resolve",
     "Steel beam over the garage opening requires manufacturer cert or PS1.",
     "Specific engineering design (SED) element not certified",
     "PS1 from CPEng covering the SED beam."),
    ("building_code:B1", "must_resolve",
     "Seismic detailing for chimney attachment is missing.",
     "Free-standing or partially restrained masonry chimney",
     "Detail showing tie-down to structure or a producer statement."),
    ("building_code:B1", "must_resolve",
     "Retaining wall over 1.5m requires specific engineering design.",
     "Wall height triggers SED threshold",
     "SED + PS1 from a CPEng."),
    ("building_code:B1", "nice_to_have",
     "Confirm timber framing grade for the rafters (SG8 or better).",
     "Grade not stated on the framing plan",
     "Note the grade on plans / specs."),

    # E2 — external moisture
    ("building_code:E2", "must_resolve",
     "Show flashings to head, jamb and sill at all window penetrations. Refer E2/AS1.",
     "Window flashings not detailed",
     "E2/AS1 figure references with project-specific dimensions."),
    ("building_code:E2", "must_resolve",
     "Provide weathertightness details at the cladding-to-roof junction.",
     "Junction unresolved on elevations",
     "Section drawing with apron flashing, kickout and cavity drainage."),
    ("building_code:E2", "must_resolve",
     "Cladding fixings detail required for the proposed direct-fixed weatherboard.",
     "Direct-fix outside E2/AS1 risk envelope",
     "Specifier statement or alternative solution."),
    ("building_code:E2", "must_resolve",
     "Show drained and ventilated cavity to all external wall framing.",
     "Cavity not shown on details",
     "20mm cavity + cavity battens + base vent details."),
    ("building_code:E2", "must_resolve",
     "Head and sill flashing details for the patio doors are unclear — please amend.",
     "Patio door junction unclear",
     "Detail referencing E2/AS1 figure 72."),
    ("building_code:E2", "must_resolve",
     "Roof underlay specification is missing from the wall-roof junction.",
     "Roof underlay missing on detail",
     "Specify self-supporting underlay continuous over wall top plate."),

    # Documentation
    ("documentation:producer_statements", "must_resolve",
     "Please provide PS1 from a CPEng for the proposed retaining wall over 1.5m.",
     "SED element listed without PS1",
     "Engineer-issued PS1 referencing the wall design."),
    ("documentation:producer_statements", "must_resolve",
     "PS3 (Construction Review) will be required prior to CCC issue.",
     "Project requires construction observation",
     "PS3 lodged with each inspection record."),
    ("documentation:producer_statements", "must_resolve",
     "PS4 from the structural engineer required upon completion of the steelwork.",
     "Steel SED element",
     "PS4 covering installed steelwork."),
    ("documentation:lbp", "must_resolve",
     "Provide LBP details for the licensed building practitioner doing RBW.",
     "RBW disclosure not on application",
     "LBP licence number, class, signed disclosure."),
    ("documentation:fees", "must_resolve",
     "Outstanding fee shortfall of $450 must be paid before processing continues.",
     "Initial deposit insufficient",
     "Pay fee via the BCA's online portal; quote app reference."),
    ("documentation:plans", "must_resolve",
     "Site plan does not show north arrow or scale bar. Please amend.",
     "Drawing standards not met",
     "Add north arrow, scale bar, dimensions to boundaries."),
    ("documentation:plans", "must_resolve",
     "Setback distance from the southern boundary not dimensioned on the site plan.",
     "Boundary setback not shown",
     "Dimension setbacks to all boundaries; reference rules."),
    ("documentation:specifications", "must_resolve",
     "Material specifications are missing for the cladding system.",
     "Cladding spec not provided",
     "Manufacturer literature, BRANZ appraisal, finishing schedule."),

    # G — services and facilities
    ("building_code:G", "must_resolve",
     "Provide a drainage layout including stormwater and sewer connection.",
     "Drainage drawing missing",
     "G12/G13 drainage plan with falls and discharge points."),
    ("building_code:G", "must_resolve",
     "Plumbing details for the second bathroom missing — provide G12 schedule.",
     "Plumbing schedule incomplete",
     "Compliance schedule per G12/AS1."),

    # F — safety of users
    ("building_code:F", "must_resolve",
     "Balustrade height to deck must comply with F4 safety glazing.",
     "Barrier height/glazing not detailed",
     "Detail showing 1m height + Grade A safety glass."),
    ("building_code:F", "must_resolve",
     "Provide barrier details for stairs over 1m drop including handrail at 900mm.",
     "Stair barrier not shown",
     "Section detail of stair, handrail, balustrade height."),

    # H1 — energy
    ("building_code:H1", "must_resolve",
     "Confirm wall insulation R-value meets H1 schedule method for climate zone 6.",
     "R-value calc absent",
     "H1 schedule method calc + product R-values."),
    ("building_code:H1", "must_resolve",
     "Double glazing with low-e coating required for thermal performance.",
     "Glazing thermal spec missing",
     "Product datasheet + R-value of glazing unit."),

    # C — fire
    ("building_code:C", "must_resolve",
     "Provide fire-rated separation between attached garage and habitable spaces.",
     "Garage/habitable separation not detailed",
     "30/30/30 lining plus self-closing door per C/AS1."),

    # E3 — internal moisture
    ("building_code:E3", "must_resolve",
     "Wet area waterproofing details required for the en-suite shower.",
     "Tanking detail missing",
     "Tanking spec + edge upturn detail."),
]

BCAS = ("ccc", "selwyn", "waimakariri")


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        return 1
    client = create_client(url, key)

    rows: list[dict[str, Any]] = []
    for bca in BCAS:
        for category, severity, example, trigger, resolution in SEED_ITEMS:
            rows.append(
                {
                    "bca": bca,
                    "category": category,
                    "severity": severity,
                    "example_text": example,
                    "trigger_description": trigger,
                    "resolution_hint": resolution,
                    "source": "synthetic",
                }
            )

    res = client.table("bca_corpus").insert(rows).execute()
    print(f"inserted {len(res.data)} rows across {len(BCAS)} BCAs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
