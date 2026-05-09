"""Build the response bundle (FR-4.1)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.auth import get_db
from app.exporter import BundleItem, build_bundle
from app.persistence import (
    fetch_attachments_for_letter,
    fetch_classifications_final,
    fetch_items,
    fetch_letter,
    fetch_responses_for_letter,
    update_letter_status,
)
from app.storage import EXPORTS_BUCKET, signed_url, upload_export
from app.taxonomy import bca_lodgement_url, bca_naming_pattern, get_taxonomy

router = APIRouter()


@router.post("/{letter_id}")
async def export_bundle(
    letter_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    letter = fetch_letter(db, letter_id)
    if not letter:
        raise HTTPException(404, "letter not found")

    proj = (
        db.table("rfi_letters")
        .select("project_id, projects(bca, application_ref)")
        .eq("id", letter_id)
        .single()
        .execute()
        .data
    )
    project = proj.get("projects") if proj else None
    if not project:
        raise HTTPException(404, "project missing")
    bca_id = project["bca"]

    tx = get_taxonomy()
    bca_meta = next(b for b in tx["bcas"] if b["id"] == bca_id)
    naming = bca_naming_pattern(bca_id)

    items = fetch_items(db, letter_id)
    classifications = fetch_classifications_final(db, letter_id)
    responses = {
        r["rfi_items"]["id"]: r for r in fetch_responses_for_letter(db, letter_id)
    }
    attachments = fetch_attachments_for_letter(db, letter_id)

    bundle_items: list[BundleItem] = []
    for it in items:
        cls = classifications.get(it["id"])
        resp = responses.get(it["id"])
        att = [a["filename"] for a in attachments.get(it["id"], [])]
        response_text = (
            (resp.get("edited_text") if resp else None)
            or (resp.get("draft_text") if resp else "")
            or "(no response drafted yet)"
        )
        bundle_items.append(
            BundleItem(
                item_number=it.get("raw_number") or str(it["ordering"] + 1),
                raw_text=it["raw_text"],
                category=cls["primary_category"] if cls else "(unclassified)",
                severity=cls["severity"] if cls else "must_resolve",
                response_text=response_text,
                attachments=att,
            )
        )

    appref = letter.get("application_ref") or project.get("application_ref") or "noref"
    zip_bytes, zip_filename, members = build_bundle(
        bca_id=bca_id,
        bca_name=bca_meta["name"],
        bca_officer=letter.get("officer_name"),
        naming_pattern=naming,
        application_ref=appref,
        rfi_number=letter.get("rfi_number"),
        issue_date=str(letter.get("issue_date") or "") or None,
        items=bundle_items,
    )

    storage_path = upload_export(
        db,
        project_id=proj["project_id"],
        letter_id=letter_id,
        filename=zip_filename,
        content_type="application/zip",
        data=zip_bytes,
    )
    url = signed_url(db, bucket=EXPORTS_BUCKET, path=storage_path)
    update_letter_status(db, letter_id, "rfi-responded")
    return {
        "filename": zip_filename,
        "size_bytes": len(zip_bytes),
        "members": members,
        "url": url,
        "lodgement_url": bca_lodgement_url(bca_id),
    }
