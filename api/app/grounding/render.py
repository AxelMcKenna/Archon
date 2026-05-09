"""Template-rendered suggested fixes + covering letter.

Deterministic. No LLM calls. Inputs: rfi_items + their grounding evidence.
Outputs: per-item fix descriptions and a markdown covering letter.

The product story this enables: "we tell you exactly what to change on your
plan, then write the council reply for you" — verifiable line by line.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from supabase import Client


def _format_op(op: dict[str, Any] | None) -> str | None:
    """Render a DXF proposed_change op as one English sentence."""
    if not op:
        return None
    kind = op.get("op")
    anchor = op.get("anchor_handle")
    if kind == "place_symbol":
        sym = (op.get("symbol") or "symbol").replace("_", " ")
        if anchor:
            return f"Place a {sym} symbol on the DXF, anchored to entity {anchor}."
        return f"Place a {sym} symbol on the DXF at the location indicated."
    if kind == "add_text_note":
        text = op.get("text") or "(note)"
        if anchor:
            return f'Add the note "{text}" near entity {anchor}.'
        return f'Add the note "{text}" at the location indicated.'
    if kind == "move_entity":
        return f"Move entity {anchor} per the analyser detail."
    if kind == "offset_polyline":
        return f"Offset the polyline at entity {anchor} per the analyser detail."
    if kind == "add_dimension":
        return f"Add a dimension at entity {anchor}."
    if kind == "resize_block":
        return f"Resize block at entity {anchor} per the analyser detail."
    return f"Apply the analyser's `{kind}` change at entity {anchor or '?'}."


def _format_location(
    plan_format: str | None, ev: dict[str, Any]
) -> str:
    handles = ev.get("target_handles") or []
    page = ev.get("page")
    quote = ev.get("verbatim_quote")
    bits: list[str] = []
    if plan_format == "dxf" and handles:
        bits.append(f"DXF entity {', '.join(handles)}")
    if page is not None:
        bits.append(f"page {page}")
    if quote:
        bits.append(f'plan text "{quote}"')
    return "; ".join(bits) or "(location not recorded)"


def render_suggested_fix(
    item: dict[str, Any],
    evidence: dict[str, Any] | None,
    plan_filename: str | None,
    plan_format: str | None,
) -> dict[str, Any]:
    """Per-item structured fix payload.

    Returns a dict the UI / covering letter can consume directly. No prose
    generation — every field maps to a verifiable fact from the evidence row
    or to an explicit "we couldn't help here" note.
    """
    item_no = item.get("raw_number") or str((item.get("ordering") or 0) + 1)
    title_line = (item.get("raw_text") or "").splitlines()[0].strip()[:120]

    if not evidence or evidence.get("source") != "flag":
        return {
            "item_id": item.get("id"),
            "item_no": item_no,
            "title": title_line,
            "matched": False,
            "rfi_text": item.get("raw_text"),
            "note": (
                "We could not locate this on your plan. It is likely a "
                "document-wide concern (units, code references, file format) "
                "rather than a single location. You will need to address it "
                "directly."
            ),
        }

    ev = evidence.get("evidence") or {}
    op = ev.get("proposed_change")
    suggested_fix = _format_op(op)
    if not suggested_fix:
        # Matched flag with no actionable op — common for PDF flags or
        # drawing-standard issues. Fall back to the analyser's rationale.
        rationale = ev.get("rationale") or "address per the matched clause"
        suggested_fix = f"Update the plan to {rationale.lower().rstrip('.')}."

    return {
        "item_id": item.get("id"),
        "item_no": item_no,
        "title": title_line,
        "matched": True,
        "rfi_text": item.get("raw_text"),
        "rule_cited": ev.get("rule_cited"),
        "located": _format_location(plan_format, ev),
        "verbatim_quote": ev.get("verbatim_quote"),
        "suggested_fix": suggested_fix,
        "proposed_change": op,
        "plan_filename": plan_filename,
        "plan_format": plan_format,
        "confidence": evidence.get("confidence"),
    }


def render_covering_letter(
    letter: dict[str, Any],
    project: dict[str, Any],
    fixes: list[dict[str, Any]],
    plan_filename: str | None,
) -> str:
    """Markdown covering letter, derived deterministically from fixes."""
    today = datetime.now(UTC).strftime("%-d %B %Y")
    addr = project.get("address") or "(site address)"
    rfi_no = letter.get("rfi_number") or "?"
    app_ref = project.get("application_ref") or "(application reference)"

    lines: list[str] = [
        "**Response to Request for Further Information**",
        "",
        f"Date: {today}  ",
        f"Application reference: {app_ref}  ",
        f"RFI number: {rfi_no}  ",
        f"Site: {addr}",
        "",
        "Dear BCA,",
        "",
        "Please find below our response to the items raised in the above RFI. "
        + (
            f"All amendments referenced are shown on the revised plan "
            f"`{plan_filename}`."
            if plan_filename
            else "Revised drawings are attached where applicable."
        ),
        "",
    ]

    for fix in fixes:
        lines.append(f"### Item {fix['item_no']} — {fix['title']}")
        lines.append("")
        if fix["matched"]:
            rule = fix.get("rule_cited") or "(clause)"
            located = fix.get("located") or "(location)"
            suggested = fix.get("suggested_fix") or ""
            lines.append(
                f"With reference to {rule}: {suggested} "
                f"Located on the revised plan at {located}."
            )
        else:
            lines.append(fix.get("note") or "")
            lines.append("")
            lines.append("> [USER ACTION REQUIRED]")
        lines.append("")

    lines.extend(
        [
            "Please contact us if any further clarification is required.",
            "",
            "Yours faithfully,",
            "",
            "[Applicant / agent name]",
        ]
    )
    return "\n".join(lines)


def fetch_letter_render_payload(db: Client, letter_id: str) -> dict[str, Any]:
    """Pull everything render needs in one place. Returns letter + fixes + cover."""
    letter_row = (
        db.table("rfi_letters")
        .select(
            "id, rfi_number, plan_upload_id, cad_upload_id, "
            "projects!inner(address, application_ref, bca, project_type)"
        )
        .eq("id", letter_id)
        .single()
        .execute()
        .data
    )
    if not letter_row:
        return {"letter_id": letter_id, "fixes": [], "covering_letter": ""}

    plan_filename: str | None = None
    plan_format: str | None = None
    if letter_row.get("plan_upload_id"):
        r = (
            db.table("plan_uploads")
            .select("filename")
            .eq("id", letter_row["plan_upload_id"])
            .maybe_single()
            .execute()
        )
        if r and r.data:
            plan_filename = r.data["filename"]
            plan_format = "pdf"
    elif letter_row.get("cad_upload_id"):
        r = (
            db.table("cad_uploads")
            .select("filename")
            .eq("id", letter_row["cad_upload_id"])
            .maybe_single()
            .execute()
        )
        if r and r.data:
            plan_filename = r.data["filename"]
            plan_format = "dxf"

    items = (
        db.table("rfi_items")
        .select("id, item_id, raw_number, raw_text, ordering")
        .eq("rfi_letter_id", letter_id)
        .order("ordering")
        .execute()
        .data
        or []
    )

    item_ids = [it["id"] for it in items]
    ev_rows = (
        db.table("rfi_item_plan_evidence")
        .select("rfi_item_id, source, confidence, evidence")
        .in_("rfi_item_id", item_ids)
        .execute()
        .data
        if item_ids
        else []
    ) or []
    ev_by = {e["rfi_item_id"]: e for e in ev_rows}

    fixes = [
        render_suggested_fix(it, ev_by.get(it["id"]), plan_filename, plan_format)
        for it in items
    ]
    covering = render_covering_letter(
        letter_row, letter_row["projects"], fixes, plan_filename
    )

    return {
        "letter_id": letter_id,
        "plan_filename": plan_filename,
        "plan_format": plan_format,
        "fixes": fixes,
        "covering_letter": covering,
    }
