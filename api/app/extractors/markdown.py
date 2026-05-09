"""Deterministic markdown rendering of canonical RFI JSON (FR-1.6).

Same input → same output. Used to build AI prompts; never used as the source
of truth (canonical JSON is).
"""

from __future__ import annotations

from app.models import CanonicalRfi, RfiItem


def render_letter(rfi: CanonicalRfi) -> str:
    letter = rfi.rfi_letter
    lines = [f"# RFI Letter — {letter.bca}"]
    if letter.application_ref:
        lines.append(f"- Application: {letter.application_ref}")
    if letter.rfi_number is not None:
        lines.append(f"- RFI #: {letter.rfi_number}")
    if letter.issue_date:
        lines.append(f"- Issued: {letter.issue_date.isoformat()}")
    if letter.response_deadline:
        lines.append(f"- Deadline: {letter.response_deadline.isoformat()}")
    if letter.officer_name:
        lines.append(f"- Officer: {letter.officer_name}")
    lines.append("")
    lines.append("## Items")
    for item in letter.items:
        lines.append(render_item(item))
    return "\n".join(lines)


def render_item(item: RfiItem) -> str:
    parts = [f"### Item {item.raw_number or item.item_id}"]
    parts.append(item.raw_text.strip())
    e = item.extracted
    facets: list[str] = []
    if e.clause_references:
        facets.append(f"clauses=[{', '.join(e.clause_references)}]")
    if e.document_references:
        facets.append(f"docs=[{', '.join(e.document_references)}]")
    if e.standards_references:
        facets.append(f"standards=[{', '.join(e.standards_references)}]")
    if e.professional_references:
        facets.append(f"profs=[{', '.join(e.professional_references)}]")
    if e.dimensions:
        dims = ", ".join(f"{d.value}{d.unit}" for d in e.dimensions)
        facets.append(f"dimensions=[{dims}]")
    if facets:
        parts.append(f"_extracted: {' '.join(facets)}_")
    return "\n\n".join(parts)
