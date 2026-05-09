#!/usr/bin/env python3
"""Smoke test for B-011 Section 4 population script."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "web" / "scripts" / "populate_b011_section4.py"
TEMPLATE = ROOT / "web" / "src" / "templates" / "B011ApplicationforCCC.docx"


def main() -> int:
    payload = {
        "completionDate": "09/05/2026",
        "lbpEntries": [
            {
                "name": "Alex Builder",
                "licensingClass": "Carpenter",
                "lbpNumber": "LBP-12345",
                "particularWork": "Framing and roof supervision",
            }
        ],
        "otherPersonnelEntries": [
            {
                "name": "Jordan Electric",
                "address": "1 Main St, Christchurch",
                "phoneNumber": "0211234567",
                "registrationNumber": "PGDB-9988",
            }
        ],
        "specifiedSystems": {
            "noSpecifiedSystems": False,
            "selected": ["SS1", "SS4", "SS9"],
        },
        "attachments": {
            "otherDocuments": True,
            "lbpMemorandaUploaded": True,
            "energyCertificates": True,
            "specifiedSystemsEvidence": True,
            "manufacturersCertificate": False,
        },
    }

    with tempfile.TemporaryDirectory(prefix="b011-smoke-") as tmp:
        tmp_path = Path(tmp)
        payload_path = tmp_path / "payload.json"
        output_path = tmp_path / "B-011-completed.docx"

        payload_path.write_text(json.dumps(payload), encoding="utf-8")

        proc = subprocess.run(
            [sys.executable, str(SCRIPT), str(TEMPLATE), str(payload_path), str(output_path)],
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            print(proc.stderr or proc.stdout)
            return proc.returncode

        with zipfile.ZipFile(output_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="replace")

        checks = {
            "date": "09/05/2026" in xml,
            "lbp_name": "Alex Builder" in xml,
            "other_name": "Jordan Electric" in xml,
            "ss1": "SS1 – Automatic systems for fire suppression" in xml,
            "checked_mark": "x" in xml,
        }

        failed = [name for name, ok in checks.items() if not ok]
        if failed:
            print("Smoke test failed:", ", ".join(failed))
            return 1

    print("Smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
