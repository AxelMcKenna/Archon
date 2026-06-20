"""Deterministic RFI rules for material / product data sheets.

Mirrors spec_rules: Python against the datasheet text layer, no LLM. Flags use
the shared flag contract + existing taxonomy ids.
"""

from __future__ import annotations

from typing import Any

from app.extractors.material_text import MaterialExtraction
from app.extractors.spec_text import _SUPERSEDED_STANDARDS


def _flag(
    *,
    severity: str,
    confidence: str,
    area: str,
    category: str,
    quote: str,
    reason: str,
    action: str,
    rule: str,
) -> dict[str, Any]:
    return {
        "page": 1,
        "area": area[:500],
        "category": category,
        "severity": severity,
        "confidence": confidence,
        "verbatim_quote": quote[:500],
        "reason": reason,
        "recommended_action": action,
        "_rule": rule,
    }


def flag_missing_appraisal_number(ex: MaterialExtraction) -> list[dict[str, Any]]:
    """A BRANZ Appraisal / CodeMark is named on the datasheet without a number -
    the BCA can't verify an unnumbered assurance."""
    if ex.has_numbered_assurance:
        return []
    bare = [r for r in ex.assurance_refs if not r.numbered]
    if not bare:
        return []
    return [
        _flag(
            severity="must_resolve",
            confidence="high",
            area="Product assurance - missing certificate number",
            category="documentation:product_assurance",
            quote=bare[0].text,
            reason=(
                "The product data sheet references a BRANZ Appraisal or CodeMark "
                "certificate but gives no number. The BCA cannot look up an "
                "unnumbered assurance and will RFI for it."
            ),
            action=(
                "State the BRANZ Appraisal number / CodeMark certificate number "
                "and its conditions of use."
            ),
            rule="missing_appraisal_number",
        )
    ]


def flag_scope_limitation_noted(ex: MaterialExtraction) -> list[dict[str, Any]]:
    """The datasheet states a scope / conditions of use - surface it so the user
    confirms the application stays inside the appraised limits (low-FP nudge)."""
    if not ex.scope_of_use:
        return []
    first = ex.scope_of_use[0]
    return [
        _flag(
            severity="nice_to_have",
            confidence="medium",
            area="Product scope / conditions of use",
            category="documentation:product_assurance",
            quote=first.snippet,
            reason=(
                "This product carries scope / conditions of use. Council commonly "
                "RFIs to confirm the product is used within its appraised scope "
                "(wind/exposure zone, height, substrate) for this building."
            ),
            action=(
                "Confirm the design keeps the product within its stated scope of "
                "use, and note the basis on the drawings / specification."
            ),
            rule="scope_limitation_noted",
        )
    ]


def flag_superseded_standards(ex: MaterialExtraction) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    for std in ex.standards:
        current = _SUPERSEDED_STANDARDS.get(std.upper())
        if not current:
            continue
        flags.append(
            _flag(
                severity="nice_to_have",
                confidence="high",
                area="Standards currency",
                category="documentation:specifications",
                quote=std,
                reason=(
                    f"The data sheet cites {std}, which has been superseded by "
                    f"{current}. Citing a withdrawn edition commonly draws an RFI."
                ),
                action=f"Confirm assurance against {current}.",
                rule="superseded_standard",
            )
        )
    return flags


def run_material_rules(ex: MaterialExtraction) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    flags.extend(flag_missing_appraisal_number(ex))
    flags.extend(flag_scope_limitation_noted(ex))
    flags.extend(flag_superseded_standards(ex))
    return flags
