"""Deterministic documentation rules for the plan flagger.

These flags are produced by Python logic against the PDF text layer, not
by the vision model. They merge into the final analyser response with
`confidence: "high"` and bypass the verification pass — the rule itself
is the verification.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.extractors.plan_text import PlanTextExtraction, RegisterEntry, TitleBlock


def flag_missing_sheets(
    register: list[RegisterEntry],
    title_blocks: list[TitleBlock],
) -> list[dict[str, Any]]:
    """Register entries that are not present as title blocks in the upload."""
    present = {tb.sheet_number for tb in title_blocks if tb.sheet_number}
    flags: list[dict[str, Any]] = []
    for entry in register:
        if entry.sheet_number in present:
            continue
        title = entry.title or "(untitled)"
        flags.append(
            {
                "page": 1,
                "tile": "full",
                "area": f"Drawing register, sheet {entry.sheet_number}",
                "category": "documentation:missing_sheets",
                "severity": "must_resolve",
                "confidence": "high",
                "verbatim_quote": f"{entry.sheet_number} {title}"[:200],
                "reason": (
                    f"Drawing register lists sheet {entry.sheet_number} "
                    f"({title}) but that sheet is not present in the upload."
                ),
                "recommended_action": (
                    f"Include sheet {entry.sheet_number} in the consent set, "
                    "or remove it from the drawing register if it has been superseded."
                ),
                "_rule": "missing_sheets",
            }
        )
    return flags


def flag_revision_mismatch(
    title_blocks: list[TitleBlock],
) -> list[dict[str, Any]]:
    """Sheets with inconsistent revision letters across the same set."""
    revs = [tb.revision for tb in title_blocks if tb.revision]
    if len(revs) < 2:
        return []
    counts = Counter(revs)
    if len(counts) < 2:
        return []
    # The dominant revision is the "expected" one; everything else is
    # called out.
    dominant, _ = counts.most_common(1)[0]
    odd_sheets = [
        tb for tb in title_blocks if tb.revision and tb.revision != dominant
    ]
    if not odd_sheets:
        return []
    sheet_list = ", ".join(
        f"{tb.sheet_number or '?'} (Rev {tb.revision})" for tb in odd_sheets[:6]
    )
    return [
        {
            "page": odd_sheets[0].page,
            "tile": "full",
            "area": "Title blocks across the set",
            "category": "documentation:revision_mismatch",
            "severity": "nice_to_have",
            "confidence": "high",
            "verbatim_quote": sheet_list[:200],
            "reason": (
                f"Most sheets are at revision {dominant}, but the following "
                f"sheets carry a different revision: {sheet_list}. This usually "
                "indicates a revision-sync issue; the BCA will RFI."
            ),
            "recommended_action": (
                "Re-issue the affected sheets at the dominant revision, or "
                "confirm the register/title-block revisions match."
            ),
            "_rule": "revision_mismatch",
        }
    ]


def run_doc_rules(extraction: PlanTextExtraction) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    flags.extend(flag_missing_sheets(extraction.drawing_register, extraction.title_blocks))
    flags.extend(flag_revision_mismatch(extraction.title_blocks))
    return flags
