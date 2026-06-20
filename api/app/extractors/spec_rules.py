"""Deterministic RFI rules for specification / product documents.

Mirrors ``doc_rules`` (the plan-side deterministic flagger): every flag here is
produced by Python against the spec text layer, not by an LLM, so each carries
``confidence: "high"`` (or "medium" for the heuristic product-coverage rule) and
needs no verification pass.

Flags use the same dict contract the plan flagger emits, minus the drawing-only
geometry fields (no ``tile``/``bbox``). Categories reuse the taxonomy ids that
already exist for the spec layer:
  - documentation:specifications
  - documentation:product_assurance
  - documentation:specified_systems
"""

from __future__ import annotations

from typing import Any

from app.extractors.spec_text import _SUPERSEDED_STANDARDS, SpecExtraction


def _flag(
    *,
    page: int,
    area: str,
    category: str,
    severity: str,
    confidence: str,
    quote: str,
    reason: str,
    action: str,
    rule: str,
) -> dict[str, Any]:
    return {
        "page": page,
        "area": area[:500],
        "category": category,
        "severity": severity,
        "confidence": confidence,
        "verbatim_quote": quote[:500],
        "reason": reason,
        "recommended_action": action,
        "_rule": rule,
    }


def flag_incomplete_assurance(ex: SpecExtraction) -> list[dict[str, Any]]:
    """A BRANZ Appraisal / CodeMark is named but with no certificate number.

    The bare reference is unassessable - the BCA can't look it up - so it is one
    of the most common product-assurance RFIs. One flag per bare reference."""
    flags: list[dict[str, Any]] = []
    for ref in ex.assurance_refs:
        if ref.numbered:
            continue
        flags.append(
            _flag(
                page=ref.page,
                area=f"Product assurance, page {ref.page}",
                category="documentation:product_assurance",
                severity="must_resolve",
                confidence="high",
                quote=ref.text,
                reason=(
                    "A product assurance (BRANZ Appraisal or CodeMark) is "
                    "referenced without a certificate/appraisal number. The BCA "
                    "cannot verify an unnumbered assurance and will RFI for it."
                ),
                action=(
                    "Add the BRANZ Appraisal number or CodeMark certificate "
                    "number (and its conditions of use) to the specification."
                ),
                rule="incomplete_assurance",
            )
        )
    return flags


def flag_unassured_products(ex: SpecExtraction) -> list[dict[str, Any]]:
    """Assurance-requiring product categories are named but the document carries
    no product-assurance reference at all. Heuristic (medium confidence): one
    aggregate flag listing the categories seen."""
    if ex.has_any_assurance_ref:
        return []
    mentions = [p for p in ex.product_mentions if not p.has_assurance_on_line]
    if not mentions:
        return []
    keywords = sorted({p.keyword for p in mentions})
    first = mentions[0]
    listed = ", ".join(keywords[:8])
    return [
        _flag(
            page=first.page,
            area="Specification - product assurance",
            category="documentation:product_assurance",
            severity="must_resolve",
            confidence="medium",
            quote=first.snippet,
            reason=(
                "The specification names product categories that usually require "
                f"product assurance ({listed}) but cites no BRANZ Appraisal or "
                "CodeMark anywhere. The BCA typically RFIs for compliance "
                "documentation (appraisal, CodeMark, or an alternative-solution "
                "pathway) on these systems."
            ),
            action=(
                "Cite the BRANZ Appraisal / CodeMark certificate for each "
                "proprietary system, or document the alternative-solution "
                "compliance pathway."
            ),
            rule="unassured_products",
        )
    ]


def flag_placeholder_language(ex: SpecExtraction) -> list[dict[str, Any]]:
    """Hedge / placeholder phrases ("or similar approved", "TBC", "by others")
    that defer a decision the consent set should resolve. One aggregate flag."""
    if not ex.hedge_phrases:
        return []
    phrases = sorted({h.phrase for h in ex.hedge_phrases})
    first = ex.hedge_phrases[0]
    listed = ", ".join(f'"{p}"' for p in phrases[:8])
    count = len(ex.hedge_phrases)
    return [
        _flag(
            page=first.page,
            area="Specification - unresolved selections",
            category="documentation:specifications",
            severity="must_resolve",
            confidence="high",
            quote=first.snippet,
            reason=(
                f"The specification contains {count} placeholder/hedge "
                f"reference(s) ({listed}). Deferred or open-ended selections "
                "cannot be assessed for compliance and are a routine RFI."
            ),
            action=(
                "Resolve each placeholder to a specific product/system (or note "
                "the compliance basis where a true equivalent is intended)."
            ),
            rule="placeholder_language",
        )
    ]


def flag_specified_system_without_standard(ex: SpecExtraction) -> list[dict[str, Any]]:
    """A specified system (sprinklers, alarms, emergency lighting...) is named
    but its expected compliance standard isn't referenced anywhere in the
    document. One flag per system."""
    if not ex.specified_systems:
        return []
    # Match against the document-wide standards list, token-prefix aware so
    # "NZS 4541:2020" satisfies an expected "NZS 4541".
    referenced = " ".join(ex.standards).upper()
    flags: list[dict[str, Any]] = []
    for cue in ex.specified_systems:
        token = cue.expected_standard.upper()
        # F6 is a Building Code clause, not an AS/NZS standard - check clauses.
        if token == "F6":
            if any(c.upper().startswith("F6") for c in ex.clauses) or "F6" in referenced:
                continue
        elif token.replace(" ", "") in referenced.replace(" ", ""):
            continue
        flags.append(
            _flag(
                page=cue.page,
                area=f"Specified system - {cue.system.replace('_', ' ')}",
                category="documentation:specified_systems",
                severity="must_resolve",
                confidence="high",
                quote=cue.snippet,
                reason=(
                    f"The specification names a {cue.system.replace('_', ' ')} "
                    f"system but does not cite {cue.expected_standard}. Specified "
                    "systems must reference their compliance standard and be "
                    "carried onto the Compliance Schedule; the BCA will RFI."
                ),
                action=(
                    f"Cite {cue.expected_standard} for the "
                    f"{cue.system.replace('_', ' ')} system and confirm it is "
                    "listed on the Compliance Schedule (Specified Systems)."
                ),
                rule="specified_system_without_standard",
            )
        )
    return flags


def flag_superseded_standards(ex: SpecExtraction) -> list[dict[str, Any]]:
    """A referenced AS/NZS standard edition is in the curated superseded map."""
    flags: list[dict[str, Any]] = []
    for std in ex.standards:
        current = _SUPERSEDED_STANDARDS.get(std.upper())
        if not current:
            continue
        flags.append(
            _flag(
                page=1,
                area="Specification - standards currency",
                category="documentation:specifications",
                severity="nice_to_have",
                confidence="high",
                quote=std,
                reason=(
                    f"The specification cites {std}, which has been superseded by "
                    f"{current}. Citing a withdrawn edition commonly draws an RFI."
                ),
                action=f"Update the reference to {current}.",
                rule="superseded_standard",
            )
        )
    return flags


def run_spec_rules(ex: SpecExtraction) -> list[dict[str, Any]]:
    """Run every deterministic spec rule and return the merged flag list."""
    flags: list[dict[str, Any]] = []
    flags.extend(flag_incomplete_assurance(ex))
    flags.extend(flag_unassured_products(ex))
    flags.extend(flag_placeholder_language(ex))
    flags.extend(flag_specified_system_without_standard(ex))
    flags.extend(flag_superseded_standards(ex))
    return flags
