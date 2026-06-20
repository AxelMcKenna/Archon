"""CAD (DXF) upload, analyse, and revision routes.

Thin HTTP layer. Pipeline orchestration lives in
``app.services.cad_pipeline``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.auth import get_db
from app.cad.cad_loader import load_dxf
from app.cad.cad_render import list_views, render_view
from app.cad.cad_scene import project_scene
from app.rate_limit import limiter
from app.services.cad_pipeline import (
    CommitConflict,
    RevisionError,
    apply_revision,
    commit_ops,
    latest_revision,
    recheck_revision,
    revert_to,
)
from app.services.cad_pipeline import (
    upload_and_analyse as run_upload_pipeline,
)
from app.services.value_engineering_pipeline import (
    get_latest_value_engineering_cad,
    run_value_engineering_cad,
)
from app.storage import CAD_BUCKET, download, signed_upload_url, signed_url
from app.utils.safe_filename import safe_filename
from app.utils.sse import progress_sse_response

router = APIRouter()
log = logging.getLogger(__name__)

ALLOWED_EXT = {".dxf"}
MAX_BYTES = 50 * 1024 * 1024


@router.post("")
@limiter.limit("10/minute")
async def upload_and_analyse_cad(
    request: Request,
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    analyse: bool = Form(True),
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

    try:
        result = await asyncio.to_thread(
            run_upload_pipeline,
            db=db,
            project_id=str(project_id),
            project=proj,
            filename=safe_filename(file.filename, default="drawing.dxf"),
            payload=payload,
            analyse=analyse,
        )
    except Exception as e:
        log.exception("cad analysis failed (project_id=%s)", project_id)
        raise HTTPException(500, "analysis failed") from e

    return {
        "cad_id": result.cad_id,
        "flags_count": result.flags_count,
        "entity_count": result.entity_count,
        "views": result.views,
        "processing_ms": result.processing_ms,
    }


def _load_cad_project(db: Client, project_id: UUID) -> dict[str, Any]:
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
    return proj


class CadUploadUrlRequest(BaseModel):
    project_id: UUID
    filename: str


class CadIngestRequest(BaseModel):
    project_id: UUID
    cad_id: UUID
    storage_path: str
    filename: str
    analyse: bool = True


@router.post("/upload-url")
@limiter.limit("20/minute")
async def create_cad_upload_url(
    request: Request,
    body: CadUploadUrlRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Signed Storage upload URL for a DXF — browser uploads directly,
    bypassing the Vercel proxy body limit."""
    if not body.filename.lower().endswith(".dxf"):
        raise HTTPException(415, "only .dxf is supported")
    _load_cad_project(db, body.project_id)  # RLS ownership check
    cad_id = uuid4()
    fname = safe_filename(body.filename, default="drawing.dxf")
    path = f"{body.project_id}/{cad_id}/{fname}"
    signed = signed_upload_url(db, bucket=CAD_BUCKET, path=path)
    return {
        "cad_id": str(cad_id),
        "bucket": CAD_BUCKET,
        "path": path,
        "filename": fname,
        "token": signed["token"],
    }


@router.post("/ingest")
@limiter.limit("10/minute")
async def ingest_uploaded_cad(
    request: Request,
    body: CadIngestRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Analyse a DXF the browser already uploaded via /cad/upload-url."""
    if not body.filename.lower().endswith(".dxf"):
        raise HTTPException(415, "only .dxf is supported")
    expected_prefix = f"{body.project_id}/{body.cad_id}/"
    if not body.storage_path.startswith(expected_prefix):
        raise HTTPException(400, "storage_path does not match project/cad")
    proj = _load_cad_project(db, body.project_id)

    try:
        result = await asyncio.to_thread(
            run_upload_pipeline,
            db=db,
            project_id=str(body.project_id),
            project=proj,
            filename=safe_filename(body.filename, default="drawing.dxf"),
            storage_path=body.storage_path,
            cad_id=str(body.cad_id),
            analyse=body.analyse,
        )
    except Exception as e:
        log.exception("cad ingest failed (project_id=%s)", body.project_id)
        raise HTTPException(500, "analysis failed") from e

    return {
        "cad_id": result.cad_id,
        "flags_count": result.flags_count,
        "entity_count": result.entity_count,
        "views": result.views,
        "processing_ms": result.processing_ms,
    }


@router.post("/ingest-stream")
@limiter.limit("10/minute")
async def ingest_uploaded_cad_stream(
    request: Request,
    body: CadIngestRequest,
    db: Client = Depends(get_db),
) -> StreamingResponse:
    """Streaming variant of /cad/ingest — emits the analyser's progress as SSE."""
    if not body.filename.lower().endswith(".dxf"):
        raise HTTPException(415, "only .dxf is supported")
    expected_prefix = f"{body.project_id}/{body.cad_id}/"
    if not body.storage_path.startswith(expected_prefix):
        raise HTTPException(400, "storage_path does not match project/cad")
    proj = _load_cad_project(db, body.project_id)

    def run(progress: Any) -> dict[str, Any]:
        result = run_upload_pipeline(
            db=db,
            project_id=str(body.project_id),
            project=proj,
            filename=safe_filename(body.filename, default="drawing.dxf"),
            storage_path=body.storage_path,
            cad_id=str(body.cad_id),
            analyse=body.analyse,
            progress=progress,
        )
        return {
            "cad_id": result.cad_id,
            "flags_count": result.flags_count,
            "entity_count": result.entity_count,
            "views": result.views,
            "processing_ms": result.processing_ms,
        }

    return await progress_sse_response(run)


def _load_for_render(
    db: Client, cad_id: str, *, prefer_latest_revision: bool = False
) -> tuple[dict[str, Any], bytes]:
    row = (
        db.table("cad_uploads")
        .select("storage_path, analysis, status, filename, project_id")
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
    """Apply approved proposed_change ops, write a new DXF, return its URL."""
    row, original_bytes = _load_for_render(db, cad_id)
    try:
        result = apply_revision(
            db=db,
            cad_id=cad_id,
            cad_row=row,
            original_bytes=original_bytes,
            approved_flag_indices=body.approved_flag_indices,
        )
    except RevisionError as e:
        raise HTTPException(400, str(e)) from e
    return {
        "revision_id": result.revision_id,
        "applied_count": result.applied_count,
        "url": result.url,
    }


def _scene_bytes(
    db: Client, cad_id: str, *, rev: str | None
) -> tuple[dict[str, Any], bytes, str | None]:
    """Load the DXF bytes for the scene endpoint + the head revision id.

    `rev` selects a specific revision; otherwise the latest revision (or the
    original upload if none). Returns (cad_row, dxf_bytes, head_revision_id)
    so the client knows the base to commit ops against.
    """
    row = (
        db.table("cad_uploads")
        .select("storage_path, filename, project_id, status")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")

    if rev:
        rrow = (
            db.table("cad_revisions")
            .select("id, dxf_path")
            .eq("id", rev)
            .eq("cad_id", cad_id)
            .maybe_single()
            .execute()
            .data
        )
        if not rrow:
            raise HTTPException(404, "revision not found")
        return row, download(db, bucket=CAD_BUCKET, path=rrow["dxf_path"]), rrow["id"]

    head = latest_revision(db, cad_id)
    if head:
        return row, download(db, bucket=CAD_BUCKET, path=head["dxf_path"]), head["id"]
    return row, download(db, bucket=CAD_BUCKET, path=row["storage_path"]), None


@router.get("/{cad_id}/scene")
async def get_cad_scene(
    cad_id: str, rev: str | None = None, db: Client = Depends(get_db)
) -> dict[str, Any]:
    """Render-ready, snap-aware scene projection for the interactive editor.

    `head_revision_id` is the base the client must echo back when committing
    ops (optimistic lock). Null means the scene is the original upload.
    """
    _, file_bytes, head_id = _scene_bytes(db, cad_id, rev=rev)
    scene = project_scene(load_dxf(file_bytes))
    scene["head_revision_id"] = head_id
    return scene


class OpsRequest(BaseModel):
    base_revision_id: str | None = None
    ops: list[dict[str, Any]]


@router.post("/{cad_id}/ops")
@limiter.limit("60/minute")
async def commit_cad_ops(
    request: Request,
    cad_id: str,
    body: OpsRequest,
    background: BackgroundTasks,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Validate + apply human/AI ops onto the base revision, append an
    immutable revision, return the op-result delta. 409 on a stale base.

    Compliance recheck runs in the background (engine owns the verdict).
    """
    row = (
        db.table("cad_uploads")
        .select("storage_path, filename, project_id")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    proj = _load_cad_project(db, UUID(row["project_id"]))
    original_bytes = download(db, bucket=CAD_BUCKET, path=row["storage_path"])

    try:
        result = await asyncio.to_thread(
            commit_ops,
            db=db,
            cad_id=cad_id,
            cad_row=row,
            original_bytes=original_bytes,
            base_revision_id=body.base_revision_id,
            raw_ops=body.ops,
        )
    except CommitConflict as e:
        raise HTTPException(409, str(e)) from e
    except RevisionError as e:
        raise HTTPException(400, str(e)) from e

    # Compliance recheck: engine, not UI, owns whether the revision is
    # compliant. Out of the commit hot path.
    background.add_task(
        recheck_revision,
        db=db,
        cad_id=cad_id,
        revision_id=result.revision_id,
        cad_row=proj,
    )

    return {
        "revision_id": result.revision_id,
        "seq": result.seq,
        "delta": result.delta,
        "url": result.url,
        "recheck_status": "pending",
    }


class RevertRequest(BaseModel):
    to_revision_id: str | None = None


@router.post("/{cad_id}/revert")
@limiter.limit("60/minute")
async def revert_cad(
    request: Request,
    cad_id: str,
    body: RevertRequest,
    background: BackgroundTasks,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Undo/redo: append a revision whose geometry equals the target revision
    (or the original when null). Returns the new head."""
    row = (
        db.table("cad_uploads")
        .select("storage_path, filename, project_id")
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "cad upload not found")
    proj = _load_cad_project(db, UUID(row["project_id"]))
    original_bytes = download(db, bucket=CAD_BUCKET, path=row["storage_path"])

    try:
        result = await asyncio.to_thread(
            revert_to,
            db=db,
            cad_id=cad_id,
            cad_row=row,
            original_bytes=original_bytes,
            to_revision_id=body.to_revision_id,
        )
    except RevisionError as e:
        raise HTTPException(400, str(e)) from e

    background.add_task(
        recheck_revision,
        db=db,
        cad_id=cad_id,
        revision_id=result.revision_id,
        cad_row=proj,
    )
    return {"revision_id": result.revision_id, "seq": result.seq, "url": result.url}


@router.get("/{cad_id}/revisions")
async def list_cad_revisions(
    cad_id: str, db: Client = Depends(get_db)
) -> dict[str, Any]:
    """Append-only revision history (newest first)."""
    rows = (
        db.table("cad_revisions")
        .select("id, base_revision_id, seq, delta, recheck_status, created_at")
        .eq("cad_id", cad_id)
        .order("seq", desc=True)
        .execute()
        .data
    ) or []
    return {"revisions": rows}


class RfiPinCreate(BaseModel):
    bbox: list[float]
    handle: str | None = None
    clause: str | None = None
    comment: str | None = None


class RfiPinUpdate(BaseModel):
    clause: str | None = None
    comment: str | None = None
    status: str | None = None  # open | resolved | dismissed


@router.get("/{cad_id}/rfi-pins")
async def list_rfi_pins(cad_id: str, db: Client = Depends(get_db)) -> dict[str, Any]:
    rows = (
        db.table("cad_rfi_pins")
        .select("*")
        .eq("cad_id", cad_id)
        .order("created_at", desc=True)
        .execute()
        .data
    ) or []
    return {"pins": rows}


@router.post("/{cad_id}/rfi-pins")
@limiter.limit("60/minute")
async def create_rfi_pin(
    request: Request,
    cad_id: str,
    body: RfiPinCreate,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if len(body.bbox) != 4:
        raise HTTPException(422, "bbox must be [x0, y0, x1, y1]")
    row = (
        db.table("cad_rfi_pins")
        .insert(
            {
                "cad_id": cad_id,
                "bbox": body.bbox,
                "handle": body.handle,
                "clause": body.clause,
                "comment": body.comment,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


@router.patch("/{cad_id}/rfi-pins/{pin_id}")
async def update_rfi_pin(
    cad_id: str,
    pin_id: str,
    body: RfiPinUpdate,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.status is not None and body.status not in {"open", "resolved", "dismissed"}:
        raise HTTPException(422, "status must be open|resolved|dismissed")
    if not patch:
        raise HTTPException(422, "no fields to update")
    row = (
        db.table("cad_rfi_pins")
        .update(patch)
        .eq("id", pin_id)
        .eq("cad_id", cad_id)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "pin not found")
    return row[0]


@router.delete("/{cad_id}/rfi-pins/{pin_id}")
async def delete_rfi_pin(
    cad_id: str, pin_id: str, db: Client = Depends(get_db)
) -> dict[str, str]:
    db.table("cad_rfi_pins").delete().eq("id", pin_id).eq("cad_id", cad_id).execute()
    return {"status": "deleted"}


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


@router.post("/{cad_id}/value-engineering")
@limiter.limit("10/minute")
async def trigger_cad_value_engineering(
    request: Request,
    cad_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = run_value_engineering_cad(db, cad_id=cad_id)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"value engineering failed: {e}") from e
    return {
        "ve_id": result.ve_id,
        "cad_id": result.source_id,
        "opportunities_count": result.opportunities_count,
        "processing_ms": result.processing_ms,
        "cost_usd": result.cost_usd,
        "cached": result.cached,
        "truncated": result.truncated,
    }


@router.get("/{cad_id}/value-engineering")
async def get_cad_value_engineering(
    cad_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any] | None:
    return get_latest_value_engineering_cad(db, cad_id=cad_id)
