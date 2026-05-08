"""Supabase Storage helpers for RFI uploads and exports."""

from __future__ import annotations

from supabase import Client

RFI_BUCKET = "rfi-uploads"
ATTACH_BUCKET = "attachments"
EXPORTS_BUCKET = "exports"


def upload_rfi_original(
    client: Client,
    *,
    user_id: str,
    project_id: str,
    letter_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> str:
    """Upload original RFI file under {user_id}/{project_id}/{letter_id}/{filename}.

    Returns the storage path.
    """
    path = f"{user_id}/{project_id}/{letter_id}/{filename}"
    client.storage.from_(RFI_BUCKET).upload(
        path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def signed_url(client: Client, *, bucket: str, path: str, expires_in: int = 3600) -> str:
    res = client.storage.from_(bucket).create_signed_url(path, expires_in)
    return res["signedURL"]
