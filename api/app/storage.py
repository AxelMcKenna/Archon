"""Supabase Storage helpers (single-user mode — no per-user prefix)."""

from __future__ import annotations

from supabase import Client

RFI_BUCKET = "rfi-uploads"
ATTACH_BUCKET = "attachments"
EXPORTS_BUCKET = "exports"
PLANS_BUCKET = "plans"


def upload_rfi_original(
    client: Client,
    *,
    project_id: str,
    letter_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> str:
    path = f"{project_id}/{letter_id}/{filename}"
    client.storage.from_(RFI_BUCKET).upload(
        path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def upload_attachment(
    client: Client,
    *,
    project_id: str,
    item_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> str:
    path = f"{project_id}/{item_id}/{filename}"
    client.storage.from_(ATTACH_BUCKET).upload(
        path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def upload_export(
    client: Client,
    *,
    project_id: str,
    letter_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> str:
    path = f"{project_id}/{letter_id}/{filename}"
    client.storage.from_(EXPORTS_BUCKET).upload(
        path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def upload_plan(
    client: Client,
    *,
    project_id: str,
    plan_id: str,
    filename: str,
    content_type: str,
    data: bytes,
) -> str:
    path = f"{project_id}/{plan_id}/{filename}"
    client.storage.from_(PLANS_BUCKET).upload(
        path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def signed_url(client: Client, *, bucket: str, path: str, expires_in: int = 3600) -> str:
    res = client.storage.from_(bucket).create_signed_url(path, expires_in)
    return res["signedURL"]
