#!/usr/bin/env python3
"""Populate Section 4 fields in B-011 DOCX using python-docx OOXML tree access."""

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


def replace_insert_date(root, completion_date: str) -> None:
    if not completion_date:
        return
    for t in root.xpath(".//w:t"):
        text = t.text or ""
        if "[insert date]" in text:
            t.text = text.replace("[insert date]", completion_date)
            return


def set_checkbox_in_element(element, checked: bool) -> bool:
    updated = False
    checked_value = "1" if checked else "0"
    glyph = "x" if checked else "☐"

    for checked_el in element.xpath(".//w14:checked"):
        checked_el.set(qn("w14:val"), checked_value)
        updated = True

    # Override checked state glyph to plain x when selected.
    if checked:
        for checked_state in element.xpath(".//w14:checkedState"):
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


def set_checkbox_by_label(table, label_match: str, checked: bool) -> bool:
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
                if set_checkbox_in_element(candidate, checked):
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
    set_checkbox_by_label(table, "There are no specified systems in the building", False)
    for code in ALL_SPECIFIED_SYSTEM_CODES:
        set_checkbox_by_label(table, f"{code} –", False)

    set_checkbox_by_label(table, "There are no specified systems in the building", no_specified)

    if no_specified:
        return

    for code in selected_codes:
        if not isinstance(code, str):
            continue
        set_checkbox_by_label(table, f"{normalize(code)} –", True)


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: populate_b011_section4.py <input.docx> <payload.json> <output.docx>", file=sys.stderr)
        return 2

    input_docx, payload_json, output_docx = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(payload_json, "r", encoding="utf-8") as f:
        payload: dict[str, Any] = json.load(f)

    document = Document(input_docx)
    root = document._element

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

    document.save(output_docx)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
