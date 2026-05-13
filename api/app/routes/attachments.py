"""Per-item attachment uploads (FR-3.4)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from supabase import Client

from app.auth import get_db
from app.persistence import insert_attachment
from app.storage import upload_attachment
from app.utils.safe_filename import safe_filename

router = APIRouter()

ATTACH_ALLOWED = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "application/vnd.dwg",
    "application/octet-stream",
}
ATTACH_MAX_BYTES = 50 * 1024 * 1024


@router.post("/items/{item_id}")
async def upload_for_item(
    item_id: str,
    file: UploadFile = File(...),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if file.content_type not in ATTACH_ALLOWED:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")

    payload = await file.read()
    if len(payload) > ATTACH_MAX_BYTES:
        raise HTTPException(413, "file exceeds 50MB")

    res = (
        db.table("rfi_items")
        .select("id, rfi_letters!inner(project_id)")
        .eq("id", item_id)
        .single()
        .execute()
        .data
    )
    if not res:
        raise HTTPException(404, "item not found")
    project_id = res["rfi_letters"]["project_id"]

    fname = safe_filename(file.filename, default="attachment")
    storage_path = upload_attachment(
        db,
        project_id=project_id,
        item_id=item_id,
        filename=fname,
        content_type=file.content_type,
        data=payload,
    )
    return insert_attachment(
        db,
        rfi_item_id=item_id,
        project_id=None,
        filename=fname,
        storage_path=storage_path,
        mime_type=file.content_type,
        size_bytes=len(payload),
    )


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("attachments")
        .select("storage_path")
        .eq("id", attachment_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "attachment not found")
    db.storage.from_("attachments").remove([row["storage_path"]])
    db.table("attachments").delete().eq("id", attachment_id).execute()
    return {"status": "deleted"}
