#!/usr/bin/env python3
"""Populate Section 1, Section 2, Section 4 and Section 5 fields in B-011 DOCX."""

from __future__ import annotations

import copy
import json
import re
import sys
from typing import Any

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ALL_SPECIFIED_SYSTEM_CODES = [
    "SS1",
    "SS2",
    "SS3/1",
    "SS3/2",
    "SS3/3",
    "SS4",
    "SS5",
    "SS6",
    "SS7",
    "SS8/1",
    "SS8/2",
    "SS8/3",
    "SS9",
    "SS10",
    "SS11",
    "SS12/1",
    "SS12/2",
    "SS13/1",
    "SS13/2",
    "SS13/3",
    "SS14/1",
    "SS14/2",
    "SS15/1",
    "SS15/2",
    "SS15/3",
    "SS15/4",
    "SS15/5",
    "SS16",
]


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def element_text(el) -> str:
    texts = [t.text or "" for t in el.xpath(".//w:t")]
    return normalize(" ".join(texts))


def has_any_text(values: list[str]) -> bool:
    return any(normalize(v) for v in values)


def set_first_paragraph_text(cell, value: str) -> None:
    paragraphs = cell.xpath("./w:p")
    if not paragraphs:
        p = OxmlElement("w:p")
        cell.append(p)
        paragraphs = [p]

    p = paragraphs[0]

    # Remove all runs from first paragraph.
    for run in list(p.xpath("./w:r")):
        p.remove(run)

    text_value = value or ""
    if text_value:
        run = OxmlElement("w:r")
        text = OxmlElement("w:t")
        if text_value.startswith(" ") or text_value.endswith(" "):
            text.set(qn("xml:space"), "preserve")
        text.text = text_value
        run.append(text)
        p.append(run)

    # Clear all following paragraphs in the cell.
    for extra in paragraphs[1:]:
        for run in list(extra.xpath("./w:r")):
            extra.remove(run)


def clear_row_cells(row) -> None:
    for cell in row.xpath("./w:tc"):
        set_first_paragraph_text(cell, "")


def fill_row(row, values: list[str]) -> None:
    cells = row.xpath("./w:tc")
    for i, cell in enumerate(cells):
        set_first_paragraph_text(cell, values[i] if i < len(values) else "")


def ensure_row_count(tbl, required_data_rows: int) -> None:
    rows = tbl.xpath("./w:tr")
    if len(rows) < 2:
        return

    data_rows = rows[1:]
    if not data_rows:
        return

    template_row = data_rows[-1]
    while len(data_rows) < required_data_rows:
        new_row = copy.deepcopy(template_row)
        clear_row_cells(new_row)
        tbl.append(new_row)
        data_rows.append(new_row)


def find_table(root, required_terms: list[str]):
    for tbl in root.xpath(".//w:tbl"):
        text = element_text(tbl).lower()
        if all(term.lower() in text for term in required_terms):
            return tbl
    return None


def find_table_within(scope, required_terms: list[str]):
    for tbl in scope.xpath(".//w:tbl"):
        text = element_text(tbl).lower()
        if all(term.lower() in text for term in required_terms):
            return tbl
    return None


def find_table_by_header_cells(root, required_terms: list[str]):
    needed = [term.lower() for term in required_terms]
    for tbl in root.xpath(".//w:tbl"):
        rows = tbl.xpath("./w:tr")
        if not rows:
            continue
        header_cells = rows[0].xpath("./w:tc")
        if len(header_cells) < 4:
            continue
        header_texts = [element_text(cell).lower() for cell in header_cells]
        if all(any(term in cell_text for cell_text in header_texts) for term in needed):
            return tbl
    return None


def fill_table(tbl, entries: list[list[str]]) -> None:
    rows = tbl.xpath("./w:tr")
    if len(rows) < 2:
        return

    ensure_row_count(tbl, len(entries))
    rows = tbl.xpath("./w:tr")
    data_rows = rows[1:]

    for idx, row in enumerate(data_rows):
        values = entries[idx] if idx < len(entries) else []
        fill_row(row, values)


def find_ancestor(element, tag_qname: str):
    current = element
    while current is not None and current.tag != tag_qname:
        current = current.getparent()
    return current


def find_next_sibling_table(paragraph):
    current = paragraph
    while current is not None:
        current = current.getnext()
        if current is None:
            return None
        if current.tag == qn("w:tbl"):
            return current
    return None


def set_table_row_values(table, row_index: int, values: list[str]) -> bool:
    rows = table.xpath("./w:tr")
    if len(rows) <= row_index:
        return False
    fill_row(rows[row_index], values)
    return True


def set_single_value_table_after_label(section_table, label_match: str, value: str) -> bool:
    target = normalize(label_match).lower()
    for paragraph in section_table.xpath(".//w:p"):
        text = element_text(paragraph).lower()
        if target not in text:
            continue
        next_table = find_next_sibling_table(paragraph)
        if next_table is None:
            continue
        if set_table_row_values(next_table, 0, [value]):
            return True
    return False


def populate_section1_consent(root, payload: dict[str, Any]) -> None:
    consent = payload.get("consent")
    if not isinstance(consent, dict):
        return

    consent_number = normalize(str(consent.get("consentNumber", "") or ""))
    if not consent_number:
        return

    section_table = find_table(
        root,
        [
            "the building consent",
            "building consent number(s):",
            "issued by:",
        ],
    )
    if section_table is None:
        return

    consent_table = find_table_within(
        section_table,
        [
            "Building consent number(s):",
            "Issued by:",
            "Christchurch City Council",
        ],
    )
    if consent_table is None:
        return

    # Row 0 is "Building consent number(s):" with value in column 1.
    rows = consent_table.xpath("./w:tr")
    if not rows:
        return
    cells = rows[0].xpath("./w:tc")
    if len(cells) < 2:
        return
    set_first_paragraph_text(cells[1], consent_number)


def set_section2_phone_numbers(section_table, owner: dict[str, Any]) -> None:
    phone_table = find_table_within(
        section_table,
        ["landline:", "mobile:", "daytime:", "after hours:", "fax:"],
    )
    if phone_table is None:
        return
    set_table_row_values(
        phone_table,
        1,
        [
            normalize(str(owner.get("landline", owner.get("phoneLandline", "")) or "")),
            normalize(str(owner.get("mobile", owner.get("phoneMobile", "")) or "")),
            normalize(str(owner.get("daytime", owner.get("phoneDaytime", "")) or "")),
            normalize(str(owner.get("afterHours", owner.get("phoneAfterHours", "")) or "")),
            normalize(str(owner.get("fax", owner.get("phoneFax", "")) or "")),
        ],
    )


def set_section2_email_website(section_table, owner: dict[str, Any]) -> None:
    for paragraph in section_table.xpath(".//w:p"):
        text = element_text(paragraph).lower()
        if "email address:" not in text or "website:" not in text:
            continue
        next_table = find_next_sibling_table(paragraph)
        if next_table is None:
            continue
        set_table_row_values(
            next_table,
            0,
            [
                normalize(str(owner.get("email", owner.get("emailAddress", "")) or "")),
                normalize(str(owner.get("website", owner.get("websiteUrl", "")) or "")),
            ],
        )
        return


def tick_section2_owner_evidence_checkbox(section_table, selected_label: str) -> None:
    def canonical(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", text.lower())

    selected = canonical(normalize(selected_label))
    if not selected:
        return

    valid_labels = [
        "certificate of title",
        "lease",
        "agreement for sale and purchase",
        "other document",
    ]

    # Evidence checkboxes are laid out as table rows where checkbox and label are in separate cells.
    for table in section_table.xpath(".//w:tbl"):
        for row in table.xpath("./w:tr"):
            cells = row.xpath("./w:tc")
            if not cells:
                continue

            matched_label_index = None
            for idx, cell in enumerate(cells):
                cell_text = canonical(element_text(cell))
                for label in valid_labels:
                    label_key = canonical(label)
                    if label_key and label_key in cell_text and label_key == selected:
                        matched_label_index = idx
                        break
                if matched_label_index is not None:
                    break

            if matched_label_index is None:
                continue

            candidate_indexes = []
            if matched_label_index > 0:
                candidate_indexes.append(matched_label_index - 1)
            if matched_label_index + 1 < len(cells):
                candidate_indexes.append(matched_label_index + 1)
            candidate_indexes.append(matched_label_index)

            for candidate_index in candidate_indexes:
                cell = cells[candidate_index]
                has_checkbox_control = bool(cell.xpath(".//w14:checkbox"))
                has_checkbox_glyph = any((t.text or "") in {"☐", "☑"} for t in cell.xpath(".//w:t"))
                if not has_checkbox_control and not has_checkbox_glyph:
                    continue
                if has_checkbox_control:
                    set_checkbox_in_element(cell, True, checked_glyph="x")
                for t in cell.xpath(".//w:t"):
                    if (t.text or "") in {"☐", "☑"}:
                        t.text = "x"
                return
    return


def populate_section2_owner(root, payload: dict[str, Any]) -> None:
    owner = payload.get("owner")
    if not isinstance(owner, dict):
        owner = payload.get("ownerDetails")
    if not isinstance(owner, dict):
        return

    preferred = normalize(str(owner.get("preferredAddress", owner.get("preferredFormOfAddress", "")) or ""))
    full_name_raw = normalize(str(owner.get("fullName", "") or ""))
    if preferred and full_name_raw.lower().startswith(f"{preferred.lower()} "):
        owner_name = full_name_raw
    elif preferred and full_name_raw:
        owner_name = f"{preferred} {full_name_raw}"
    else:
        owner_name = full_name_raw

    section_table = find_table(
        root,
        [
            "the owner",
            "name of owner",
            "evidence of the ownership is attached to this application",
        ],
    )
    if section_table is None:
        return

    set_single_value_table_after_label(
        section_table,
        "Name of owner:",
        owner_name,
    )
    set_single_value_table_after_label(
        section_table,
        "Contact person:",
        normalize(str(owner.get("contactPerson", owner.get("contactPersonFullName", "")) or "")),
    )
    set_single_value_table_after_label(
        section_table,
        "Mailing address:",
        normalize(str(owner.get("mailingAddress", "") or "")),
    )

    street_address_value = normalize(str(owner.get("streetAddress", "") or ""))
    set_single_value_table_after_label(
        section_table,
        "Street address/Registered office:",
        street_address_value,
    )

    set_section2_phone_numbers(section_table, owner)
    set_section2_email_website(section_table, owner)

    selected = normalize(str(owner.get("ownershipEvidence", owner.get("evidenceOfOwnershipType", "")) or ""))
    tick_section2_owner_evidence_checkbox(section_table, selected)


def replace_insert_date(root, completion_date: str) -> None:
    if not completion_date:
        return
    for t in root.xpath(".//w:t"):
        text = t.text or ""
        if "[insert date]" in text:
            t.text = text.replace("[insert date]", completion_date)
            return


def set_checkbox_in_element(element, checked: bool, checked_glyph: str = "x") -> bool:
    updated = False
    checked_value = "1" if checked else "0"
    glyph = checked_glyph if checked else "☐"

    for checked_el in element.xpath(".//w14:checked"):
        checked_el.set(qn("w14:val"), checked_value)
        updated = True

    # Override checked state glyph to plain x when selected.
    if checked:
        for checked_state in element.xpath(".//w14:checkedState"):
            if checked_glyph == "x":
                checked_state.set(qn("w14:val"), "0078")
                checked_state.set(qn("w14:font"), "Arial")
                updated = True

    for t in element.xpath(".//w:sdt//w:t"):
        if (t.text or "") in {"☐", "☑"}:
            t.text = glyph
            updated = True

    return updated


def find_specified_systems_table(root):
    required_terms = [
        "There are no specified systems in the building",
        "SS1",
        "SS16",
        "capable of performing to the performance standards",
    ]
    matches = []
    for tbl in root.xpath(".//w:tbl"):
        text = element_text(tbl).lower()
        if all(term.lower() in text for term in required_terms):
            matches.append((len(text), tbl))
    if not matches:
        return None
    matches.sort(key=lambda item: item[0])
    return matches[0][1]


def set_checkbox_by_label(table, label_match: str, checked: bool, checked_glyph: str = "x") -> bool:
    needle = normalize(label_match)
    if not needle:
        return False

    for paragraph in table.xpath(".//w:p"):
        if needle not in element_text(paragraph):
            continue

        row = find_ancestor(paragraph, qn("w:tr"))
        label_cell = find_ancestor(paragraph, qn("w:tc"))
        if row is None or label_cell is None:
            continue

        cells = row.xpath("./w:tc")
        try:
            idx = cells.index(label_cell)
        except ValueError:
            continue

        candidates = []
        if idx > 0:
            candidates.append(cells[idx - 1])
        candidates.append(cells[idx])
        if idx + 1 < len(cells):
            candidates.append(cells[idx + 1])

        for candidate in candidates:
            if candidate.xpath(".//w14:checkbox"):
                if set_checkbox_in_element(candidate, checked, checked_glyph=checked_glyph):
                    return True
    return False


def populate_specified_systems(root, payload: dict[str, Any]) -> None:
    specified = payload.get("specifiedSystems")
    if not isinstance(specified, dict):
        return

    no_specified = bool(specified.get("noSpecifiedSystems"))
    selected = specified.get("selected")
    selected_codes = selected if isinstance(selected, list) else []

    table = find_specified_systems_table(root)
    if table is None:
        return

    # Reset only specified-systems checkboxes, not unrelated form checkboxes.
    set_checkbox_by_label(table, "There are no specified systems in the building", False, checked_glyph="x")
    for code in ALL_SPECIFIED_SYSTEM_CODES:
        set_checkbox_by_label(table, f"{code} –", False, checked_glyph="x")

    set_checkbox_by_label(
        table,
        "There are no specified systems in the building",
        no_specified,
        checked_glyph="x",
    )

    if no_specified:
        return

    for code in selected_codes:
        if not isinstance(code, str):
            continue
        set_checkbox_by_label(table, f"{normalize(code)} –", True, checked_glyph="x")


def populate_section5_attachments(root, payload: dict[str, Any]) -> None:
    attachments = payload.get("attachments")
    if not isinstance(attachments, dict):
        return

    table = find_table(
        root,
        [
            "The following documents are attached to this application:",
            "Other documents from the personnel who carried out the work",
            "Current manufacturer’s certificate, if applicable",
        ],
    )
    if table is None:
        return

    mapping = [
        ("otherDocuments", "Other documents from the personnel who carried out the work"),
        (
            "lbpMemorandaUploaded",
            "Memoranda from licensed building practitioner(s) stating what restricted building work",
        ),
        ("energyCertificates", "Certificates that relate to the energy work"),
        (
            "specifiedSystemsEvidence",
            "Evidence that specified systems are capable of performing to the performance standards set out in the building consent",
        ),
        ("manufacturersCertificate", "Current manufacturer’s certificate, if applicable"),
    ]

    # Normalize Section 5 first so stale/templated marks don't leak into output.
    for _, label in mapping:
        set_checkbox_by_label(table, label, False, checked_glyph="x")

    for key, label in mapping:
        if bool(attachments.get(key)):
            set_checkbox_by_label(table, label, True, checked_glyph="x")


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: populate_b011_section4.py <input.docx> <payload.json> <output.docx>", file=sys.stderr)
        return 2

    input_docx, payload_json, output_docx = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(payload_json, "r", encoding="utf-8") as f:
        payload: dict[str, Any] = json.load(f)

    document = Document(input_docx)
    root = document._element

    populate_section1_consent(root, payload)
    populate_section2_owner(root, payload)

    completion_date = payload.get("completionDate")
    if isinstance(completion_date, str):
        replace_insert_date(root, normalize(completion_date))

    lbp_entries = payload.get("lbpEntries")
    lbp_rows: list[list[str]] = []
    if isinstance(lbp_entries, list):
        for entry in lbp_entries:
            if not isinstance(entry, dict):
                continue
            row = [
                normalize(str(entry.get("name", "") or "")),
                normalize(str(entry.get("licensingClass", "") or "")),
                normalize(str(entry.get("lbpNumber", "") or "")),
                normalize(str(entry.get("particularWork", "") or "")),
            ]
            if has_any_text(row):
                lbp_rows.append(row)

    other_entries = payload.get("otherPersonnelEntries")
    other_rows: list[list[str]] = []
    if isinstance(other_entries, list):
        for entry in other_entries:
            if not isinstance(entry, dict):
                continue
            row = [
                normalize(str(entry.get("name", "") or "")),
                normalize(str(entry.get("address", "") or "")),
                normalize(str(entry.get("phoneNumber", "") or "")),
                normalize(str(entry.get("registrationNumber", "") or "")),
            ]
            if has_any_text(row):
                other_rows.append(row)

    lbp_table = find_table_by_header_cells(
        root,
        [
            "name",
            "licensing",
            "section 291 of act",
            "particular work carried out or supervised",
        ],
    )
    if lbp_table is not None:
        fill_table(lbp_table, lbp_rows)

    other_table = find_table_by_header_cells(
        root,
        [
            "name",
            "address",
            "phone",
            "Where relevant and if not provided above",
        ],
    )
    if other_table is not None:
        fill_table(other_table, other_rows)

    populate_specified_systems(root, payload)
    populate_section5_attachments(root, payload)

    document.save(output_docx)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
