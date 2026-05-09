"""CAD (DXF) upload, analyse, and revision routes."""

from __future__ import annotations

import hashlib
import time
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db
from app.cad.cad_analyzer import CAD_ANALYSIS_VERSION, analyse_cad
from app.cad.cad_loader import load_dxf
from app.cad.cad_ops import apply_ops, parse_ops
from app.cad.cad_render import list_views, render_view
from app.storage import CAD_BUCKET, download, signed_url, upload_cad

router = APIRouter()

ALLOWED_EXT = {".dxf"}
MAX_BYTES = 50 * 1024 * 1024


@router.post("")
async def upload_and_analyse_cad(
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    fname = (file.filename or "drawing.dxf").lower()
    if not any(fname.endswith(ext) for ext in ALLOWED_EXT):
        raise HTTPException(415, "only .dxf is supported")
    payload = await file.read()
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "file exceeds 50MB")

    proj = (
        db.table("projects")
        .select("id, bca, project_type, description")
        .eq("id", str(project_id))
        .single()
        .execute()
        .data
    )
    if not proj:
        raise HTTPException(404, "project not found")

    cad_id = str(uuid4())
    storage_path = upload_cad(
        db,
        project_id=str(project_id),
        cad_id=cad_id,
        filename=file.filename or "drawing.dxf",
        content_type="application/dxf",
        data=payload,
    )
    content_hash = hashlib.sha256(payload).hexdigest()

    db.table("cad_uploads").insert(
        {
            "id": cad_id,
            "project_id": str(project_id),
            "filename": file.filename or "drawing.dxf",
            "storage_path": storage_path,
            "size_bytes": len(payload),
            "content_hash": content_hash,
            "analyser_version": CAD_ANALYSIS_VERSION,
            "status": "analysing",
        }
    ).execute()

    try:
        analysis, prompt_version, metrics, extras = analyse_cad(
            dxf_bytes=payload,
            bca=proj["bca"],
            project_type=proj["project_type"],
            project_description=proj.get("description") or "",
        )
    except Exception as e:
        db.table("cad_uploads").update(
            {"status": "failed", "error": str(e)[:500]}
        ).eq("id", cad_id).execute()
        raise HTTPException(500, f"analysis failed: {e}") from e

    db.table("cad_uploads").update(
        {
            "status": "analysed",
            "analysis": analysis,
            "prompt_version": prompt_version,
            "processing_ms": metrics.processing_ms,
        }
    ).eq("id", cad_id).execute()

    return {
        "cad_id": cad_id,
        "flags_count": len(analysis.get("flags", [])),
        "entity_count": analysis.get("entity_count", 0),
        "views": analysis.get("views", []),
        "processing_ms": metrics.processing_ms,
    }


def _load_for_render(
    db: Client, cad_id: str, *, prefer_latest_revision: bool = False
) -> tuple[dict[str, Any], bytes]:
    row = (
        db.table("cad_uploads")
        .select("storage_path, analysis, status, filename")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    if row.get("status") != "analysed":
        raise HTTPException(409, f"not analysed (status={row.get('status')})")

    if prefer_latest_revision:
        rev = (
            db.table("cad_revisions")
            .select("dxf_path")
            .eq("cad_id", cad_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if rev:
            return row, download(db, bucket=CAD_BUCKET, path=rev[0]["dxf_path"])

    return row, download(db, bucket=CAD_BUCKET, path=row["storage_path"])


@router.get("/{cad_id}")
async def get_cad(cad_id: str, db: Client = Depends(get_db)) -> dict[str, Any]:
    row = (
        db.table("cad_uploads").select("*").eq("id", cad_id).maybe_single().execute().data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    return row


@router.get("/{cad_id}/views")
async def list_cad_views(
    cad_id: str, db: Client = Depends(get_db)
) -> dict[str, Any]:
    row, _ = _load_for_render(db, cad_id)
    return {"views": (row.get("analysis") or {}).get("views") or []}


@router.get("/{cad_id}/views/{view_name}.png")
async def cad_view_image(
    cad_id: str,
    view_name: str,
    revised: bool = False,
    db: Client = Depends(get_db),
) -> Response:
    """Render the requested view.

    `?revised=1` swaps in the latest revision DXF so approved changes
    show up baked into the rendered image. Default is the original
    upload so the bbox overlay coordinates (precomputed against the
    original entity layout) line up.
    """
    _, file_bytes = _load_for_render(db, cad_id, prefer_latest_revision=revised)
    doc = load_dxf(file_bytes)
    if view_name not in list_views(doc):
        raise HTTPException(404, f"view {view_name!r} not found")
    png, _ = render_view(doc, view_name)
    return Response(
        content=png,
        media_type="image/png",
        # No long cache when serving the revised view — it changes on every
        # Apply. Cache the original aggressively (browser already does).
        headers={
            "Cache-Control": "no-store" if revised else "private, max-age=3600"
        },
    )


@router.get("/{cad_id}/signed-url")
async def cad_signed_url(
    cad_id: str, db: Client = Depends(get_db)
) -> dict[str, str]:
    row = (
        db.table("cad_uploads")
        .select("storage_path")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    return {"url": signed_url(db, bucket=CAD_BUCKET, path=row["storage_path"])}


class RevisionRequest(BaseModel):
    approved_flag_indices: list[int]


@router.post("/{cad_id}/revisions")
async def create_revision(
    cad_id: str,
    body: RevisionRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Apply approved proposed_change ops, write a new DXF, return its URL.

    Each new revision is built on top of the most recent prior revision
    (or the original upload if none yet) so successive Apply clicks
    accumulate rather than each rebuilding from the original.
    """
    row, original_bytes = _load_for_render(db, cad_id)
    flags = (row.get("analysis") or {}).get("flags") or []

    prior = (
        db.table("cad_revisions")
        .select("dxf_path")
        .eq("cad_id", cad_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if prior:
        file_bytes = download(db, bucket=CAD_BUCKET, path=prior[0]["dxf_path"])
    else:
        file_bytes = original_bytes

    raw_ops: list[dict[str, Any]] = []
    applied_log: list[dict[str, Any]] = []
    for idx in body.approved_flag_indices:
        if idx < 0 or idx >= len(flags):
            raise HTTPException(400, f"flag index {idx} out of range")
        flag = flags[idx]
        pc = flag.get("proposed_change")
        if not pc:
            raise HTTPException(400, f"flag {idx} has no proposed_change")
        raw_ops.append(pc)
        applied_log.append(
            {
                "flag_index": idx,
                "rule_cited": flag.get("rule_cited"),
                "rationale": flag.get("rationale"),
                "op": pc,
            }
        )

    try:
        ops = parse_ops(raw_ops)
        revised = apply_ops(file_bytes, ops)
    except Exception as e:
        raise HTTPException(400, f"failed to apply ops: {e}") from e

    rev_id = str(uuid4())
    base = (row.get("filename") or "drawing.dxf").rsplit(".", 1)[0]
    rev_filename = f"{base}-rev-{rev_id[:8]}.dxf"
    rev_path = upload_cad(
        db,
        project_id=str(row.get("project_id") or ""),
        cad_id=cad_id,
        filename=rev_filename,
        content_type="application/dxf",
        data=revised,
    )

    db.table("cad_revisions").insert(
        {
            "id": rev_id,
            "cad_id": cad_id,
            "applied_ops": applied_log,
            "dxf_path": rev_path,
        }
    ).execute()

    return {
        "revision_id": rev_id,
        "applied_count": len(applied_log),
        "url": signed_url(db, bucket=CAD_BUCKET, path=rev_path),
    }


@router.delete("/{cad_id}")
async def delete_cad(cad_id: str, db: Client = Depends(get_db)) -> dict[str, str]:
    row = (
        db.table("cad_uploads")
        .select("storage_path")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    db.storage.from_(CAD_BUCKET).remove([row["storage_path"]])
    db.table("cad_uploads").delete().eq("id", cad_id).execute()
    return {"status": "deleted"}
