"""Deterministic cross-document coordination rules.

Each rule reads the project's ``DocumentClaims`` set and emits flags that cite
**two or more documents** — so a coordination flag can never be ungrounded
single-source noise. Flags use the same dict contract as the single-document
flaggers, plus a ``citations`` list and a ``tier`` marker.

Category is the existing taxonomy id ``documentation:plans:design_coordination``.
All rules are conservative: they only fire when there is positive evidence on
*both* sides (e.g. a system is specified AND the drawing set is classified but
lacks the relevant discipline), so an unclassified residential set never trips
them.
"""

from __future__ import annotations

from typing import Any

from app.coordination.claims import (
    SYSTEM_DISCIPLINES,
    DocumentClaims,
    standard_family,
    standard_year,
)

CATEGORY = "documentation:plans:design_coordination"

_SYSTEM_LABEL = {
    "sprinklers": "sprinkler",
    "fire_alarm": "fire alarm / detection",
    "emergency_lighting": "emergency lighting",
    "hydrants": "hydrant / hose reel",
    "smoke_control": "smoke control",
    "cladding_system": "cladding",
    "membrane": "membrane / waterproofing",
}


def _flag(
    *,
    severity: str,
    confidence: str,
    area: str,
    reason: str,
    action: str,
    rule: str,
    citations: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "category": CATEGORY,
        "severity": severity,
        "confidence": confidence,
        "area": area[:500],
        "reason": reason,
        "recommended_action": action,
        "_rule": rule,
        "tier": "deterministic",
        "citations": citations,
    }


def _split(claims: list[DocumentClaims]) -> tuple[list[DocumentClaims], list[DocumentClaims]]:
    specs = [c for c in claims if c.source_kind == "spec"]
    drawings = [c for c in claims if c.source_kind == "drawing"]
    return specs, drawings


def flag_system_specified_not_drawn(
    claims: list[DocumentClaims],
) -> list[dict[str, Any]]:
    """A system specified in a spec has no drawing of a discipline that would
    carry it. Guarded: only fires when the drawing set is actually classified
    (>=1 known discipline), so absence is meaningful."""
    specs, drawings = _split(claims)
    if not specs or not drawings:
        return []
    drawing_disciplines: set[str] = set()
    drawing_systems: set[str] = set()
    for d in drawings:
        drawing_disciplines |= d.disciplines
        drawing_systems |= d.systems
    if not drawing_disciplines:
        return []  # unclassified set — can't assert a discipline is missing

    flags: list[dict[str, Any]] = []
    seen: set[str] = set()
    for spec in specs:
        for sysname in sorted(spec.systems):
            if sysname in seen:
                continue
            expected = SYSTEM_DISCIPLINES.get(sysname)
            if not expected:
                continue
            if (expected & drawing_disciplines) or sysname in drawing_systems:
                continue
            seen.add(sysname)
            label = _SYSTEM_LABEL.get(sysname, sysname.replace("_", " "))
            disc_list = ", ".join(sorted(drawing_disciplines))
            flags.append(
                _flag(
                    severity="must_resolve",
                    confidence="medium",
                    area=f"Spec specifies {label}; no matching drawing",
                    reason=(
                        f"The specification specifies a {label} system, but the "
                        f"drawing set (disciplines present: {disc_list}) contains "
                        f"no {'/'.join(sorted(expected))} drawing for it. The BCA "
                        "will RFI for the missing design."
                    ),
                    action=(
                        f"Add the {label} drawing(s) to the set, or remove the "
                        "system from the specification if it is not part of the "
                        "work."
                    ),
                    rule="system_specified_not_drawn",
                    citations=[
                        spec.citation(sysname),
                        {
                            "source_kind": "drawing",
                            "source_id": drawings[0].source_id,
                            "filename": "drawing set",
                            "page": 1,
                            "quote": f"disciplines: {disc_list}",
                        },
                    ],
                )
            )
    return flags


def flag_drawn_fire_rating_spec_silent(
    claims: list[DocumentClaims],
) -> list[dict[str, Any]]:
    """The drawings carry fire-rated content (fire discipline or FRR schedule)
    but no spec references fire-rated construction."""
    specs, drawings = _split(claims)
    if not specs or not drawings:
        return []
    if any(s.fire_rated for s in specs):
        return []
    fire_drawing = next((d for d in drawings if d.fire_rated), None)
    if fire_drawing is None:
        return []
    cite = fire_drawing.citation(
        "discipline:fire"
        if "fire" in fire_drawing.disciplines
        else next(iter(fire_drawing.evidence), "")
    )
    return [
        _flag(
            severity="must_resolve",
            confidence="medium",
            area="Drawings are fire-rated; spec is silent on fire",
            reason=(
                "The drawing set includes fire-rated construction (a fire sheet "
                "or a fire-rating schedule), but no specification references "
                "fire-rated systems, FRRs, or passive fire. The BCA will RFI to "
                "confirm the specified fire performance."
            ),
            action=(
                "Add the fire-rated systems (FRRs, passive fire, fire doors) to "
                "the specification so it matches the drawings."
            ),
            rule="drawn_fire_rating_spec_silent",
            citations=[
                cite,
                {
                    "source_kind": "spec",
                    "source_id": specs[0].source_id,
                    "filename": specs[0].filename,
                    "page": 1,
                    "quote": "(no fire reference)",
                },
            ],
        )
    ]


def flag_standard_edition_mismatch(
    claims: list[DocumentClaims],
) -> list[dict[str, Any]]:
    """The same standard family is cited at different editions across documents."""
    # family -> {year -> citation}
    by_family: dict[str, dict[str, dict[str, Any]]] = {}
    for c in claims:
        for std in c.standards:
            year = standard_year(std)
            if not year:
                continue
            fam = standard_family(std)
            by_family.setdefault(fam, {}).setdefault(
                year,
                {
                    "source_kind": c.source_kind,
                    "source_id": c.source_id,
                    "filename": c.filename,
                    "page": 1,
                    "quote": std,
                },
            )

    flags: list[dict[str, Any]] = []
    for fam, years in by_family.items():
        if len(years) < 2:
            continue
        ordered = sorted(years.items())
        citations = [c for _, c in ordered]
        listed = ", ".join(f"{y} ({c['filename']})" for y, c in ordered)
        flags.append(
            _flag(
                severity="nice_to_have",
                confidence="high",
                area=f"{fam} cited at different editions",
                reason=(
                    f"{fam} is cited at more than one edition across the document "
                    f"set: {listed}. Inconsistent standard editions across a "
                    "consent set commonly draw an RFI."
                ),
                action=(
                    f"Align every reference to {fam} on the same (current) "
                    "edition across the specification and drawings."
                ),
                rule="standard_edition_mismatch",
                citations=citations,
            )
        )
    return flags


def flag_proprietary_system_no_drawing(
    claims: list[DocumentClaims],
) -> list[dict[str, Any]]:
    """A proprietary envelope system (cladding/membrane) is specified but no
    drawing references cladding/elevation/waterproofing. Guarded on a classified
    architectural set so it doesn't fire on unclassified uploads."""
    specs, drawings = _split(claims)
    if not specs or not drawings:
        return []
    drawing_disciplines: set[str] = set()
    drawing_systems: set[str] = set()
    for d in drawings:
        drawing_disciplines |= d.disciplines
        drawing_systems |= d.systems
    if "architectural" not in drawing_disciplines:
        return []  # need a classified architectural set to assert absence

    flags: list[dict[str, Any]] = []
    seen: set[str] = set()
    for spec in specs:
        for token in ("cladding_system", "membrane"):
            if token not in spec.systems or token in seen:
                continue
            if token in drawing_systems:
                continue
            seen.add(token)
            label = _SYSTEM_LABEL[token]
            flags.append(
                _flag(
                    severity="must_resolve",
                    confidence="medium",
                    area=f"Spec specifies {label}; not shown on drawings",
                    reason=(
                        f"The specification specifies a proprietary {label} "
                        "system, but no architectural drawing (elevation, "
                        "section, or schedule) references it. The BCA will RFI to "
                        "see the system documented on the drawings."
                    ),
                    action=(
                        f"Show the {label} system on the relevant elevations / "
                        "details, or align the spec with the drawn design."
                    ),
                    rule="proprietary_system_no_drawing",
                    citations=[
                        spec.citation(token),
                        {
                            "source_kind": "drawing",
                            "source_id": drawings[0].source_id,
                            "filename": "drawing set",
                            "page": 1,
                            "quote": "architectural set has no cladding/elevation reference",
                        },
                    ],
                )
            )
    return flags


def run_coordination_rules(claims: list[DocumentClaims]) -> list[dict[str, Any]]:
    """Run every deterministic coordination rule over the project's claims."""
    flags: list[dict[str, Any]] = []
    flags.extend(flag_system_specified_not_drawn(claims))
    flags.extend(flag_drawn_fire_rating_spec_silent(claims))
    flags.extend(flag_standard_edition_mismatch(claims))
    flags.extend(flag_proprietary_system_no_drawing(claims))
    return flags
