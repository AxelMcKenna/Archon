import io
import zipfile

from app.exporter import BundleItem, build_bundle


def test_build_bundle_produces_zip_with_expected_members():
    items = [
        BundleItem(
            item_number="1",
            raw_text="Provide PS1 from a CPEng for the proposed retaining wall.",
            category="documentation:producer_statements",
            severity="must_resolve",
            response_text="The retaining wall has been designed by [ATTACH: engineer]. PS1 attached.",
            attachments=["PS1.pdf", "engineer-report.pdf"],
        ),
        BundleItem(
            item_number="2",
            raw_text="Show flashings to head, jamb and sill. Refer E2/AS1.",
            category="building_code:E2",
            severity="must_resolve",
            response_text="Flashings updated per E2/AS1 figures 71-73. See revised drawings.",
            attachments=["A-204-rev-B.pdf"],
        ),
    ]
    zip_bytes, name, members = build_bundle(
        bca_id="ccc",
        bca_name="Christchurch City Council",
        bca_officer="Jane Smith",
        naming_pattern="[appref]_RFI[n]_item[item]_[date].pdf",
        application_ref="BCN/2026/12345",
        rfi_number=1,
        issue_date="2026-04-15",
        items=items,
    )
    assert name.endswith(".zip")
    assert len(members) == 4  # cover, index, item-1, item-2

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        files = zf.namelist()
        assert "00_index.pdf" in files
        # Cover and per-item files follow naming pattern
        assert any("RFI1_item" in f for f in files if f != "00_index.pdf")
        # Each member is a non-empty PDF
        for f in files:
            assert zf.read(f).startswith(b"%PDF")
