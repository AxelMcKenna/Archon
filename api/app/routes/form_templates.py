from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

FORM2_CANDIDATES = (
    Path(__file__).resolve().parents[2] / "data" / "form2.docx",
    Path(__file__).resolve().parents[2] / "data" / "B002ApplicationForBCandPIM.DOCX",
)


@router.get("/form2")
async def download_form2_template() -> FileResponse:
    for path in FORM2_CANDIDATES:
        if path.exists():
            return FileResponse(
                path,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                filename="Form2_Building_Consent_Application.docx",
            )
    raise HTTPException(status_code=404, detail="Form 2 template not found")
