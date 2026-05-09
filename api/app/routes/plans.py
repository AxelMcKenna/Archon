"""Building-plan upload + analysis routes."""

from __future__ import annotations

import hashlib
import time
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from supabase import Client

from app.auth import get_db
from app.config import get_settings
from app.plan_analyzer import ANALYSIS_VERSION, analyse_plan
from app.plan_overlay import (
    get_page_info,
    render_overlay_pdf,
    render_page,
)
from app.storage import PLANS_BUCKET, download, signed_url, upload_plan


def _resolve_provider_model() -> tuple[str, str]:
    """Provider id + canonical model id used for the analyser pass."""
    s = get_settings()
    provider = s.plan_analyser_provider
    model = (
        s.openrouter_model if provider == "openrouter" else s.gemini_model
    )
    return provider, model

router = APIRouter()

ALLOWED_MEDIA = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 50 * 1024 * 1024


@router.post("")
async def upload_and_analyse(
    file: UploadFile = File(...),
    project_id: UUID = Form(...),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if file.content_type not in ALLOWED_MEDIA:
        raise HTTPException(415, f"unsupported media type: {file.content_type}")
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

    content_hash = hashlib.sha256(payload).hexdigest()
    provider, model_id = _resolve_provider_model()

    # Idempotency cache: if any prior row was analysed with the same
    # (file, analyser version, provider, model), reuse its analysis.
    cached_rows = (
        db.table("plan_uploads")
        .select(
            "analysis, prompt_version, processing_ms, cost_usd, "
            "verification_prompt_version, verification_drops, "
            "image_count, dpi_breakdown"
        )
        .eq("content_hash", content_hash)
        .eq("analyser_version", ANALYSIS_VERSION)
        .eq("provider", provider)
        .eq("model_id", model_id)
        .eq("status", "analysed")
        .limit(1)
        .execute()
        .data
    )

    plan_id = str(uuid4())
    filename = file.filename or "plan.pdf"
    storage_path = upload_plan(
        db,
        project_id=str(project_id),
        plan_id=plan_id,
        filename=filename,
        content_type=file.content_type,
        data=payload,
    )

    common_row: dict[str, Any] = {
        "id": plan_id,
        "project_id": str(project_id),
        "filename": filename,
        "storage_path": storage_path,
        "mime_type": file.content_type,
        "size_bytes": len(payload),
        "analyser_version": ANALYSIS_VERSION,
        "analysis_version": ANALYSIS_VERSION,
        "content_hash": content_hash,
        "provider": provider,
        "model_id": model_id,
    }

    if cached_rows:
        cached = cached_rows[0]
        t0 = time.monotonic()
        db.table("plan_uploads").insert(
            {
                **common_row,
                "status": "analysed",
                "analysis": cached["analysis"],
                "prompt_version": cached.get("prompt_version"),
                "processing_ms": int((time.monotonic() - t0) * 1000),
                "cost_usd": 0,  # cache hit — no new spend
                "verification_prompt_version": cached.get(
                    "verification_prompt_version"
                ),
                "verification_drops": cached.get("verification_drops"),
                "image_count": cached.get("image_count"),
                "dpi_breakdown": cached.get("dpi_breakdown"),
            }
        ).execute()
        analysis = cached["analysis"] or {}
        return {
            "plan_id": plan_id,
            "flags_count": len((analysis or {}).get("flags") or []),
            "processing_ms": int((time.monotonic() - t0) * 1000),
            "cost_usd": 0,
            "truncated": (analysis or {}).get("truncated", False),
            "verification": (analysis or {}).get("verification", "verified"),
            "cached": True,
        }

    # Insert pending row first so the UI can poll if we ever go async.
    db.table("plan_uploads").insert(
        {**common_row, "status": "analysing"}
    ).execute()

    try:
        analysis, prompt_version, metrics, extras = analyse_plan(
            file_bytes=payload,
            media_type=file.content_type,
            bca=proj["bca"],
            project_type=proj["project_type"],
            project_description=proj.get("description") or "",
        )
    except Exception as e:
        db.table("plan_uploads").update(
            {"status": "failed", "error": str(e)[:500]}
        ).eq("id", plan_id).execute()
        raise HTTPException(500, f"analysis failed: {e}") from e

    db.table("plan_uploads").update(
        {
            "status": "analysed",
            "analysis": analysis,
            "prompt_version": prompt_version,
            "processing_ms": metrics.processing_ms,
            "cost_usd": round(metrics.cost_usd, 6),
            "analysis_version": extras["analysis_version"],
            "verification_prompt_version": extras["verification_prompt_version"],
            "verification_drops": extras["verification_drops"],
            "image_count": extras["image_count"],
            "dpi_breakdown": extras["dpi_breakdown"],
        }
    ).eq("id", plan_id).execute()

    return {
        "plan_id": plan_id,
        "flags_count": len(analysis.get("flags", [])),
        "processing_ms": metrics.processing_ms,
        "cost_usd": round(metrics.cost_usd, 6),
        "truncated": analysis.get("truncated", False),
        "verification": analysis.get("verification", "verified"),
        "cached": False,
    }


@router.get("/{plan_id}")
async def get_plan(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    row = (
        db.table("plan_uploads")
        .select("*")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    return row


@router.get("/{plan_id}/signed-url")
async def get_plan_url(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("plan_uploads")
        .select("storage_path")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    return {"url": signed_url(db, bucket=PLANS_BUCKET, path=row["storage_path"])}


def _load_plan_for_render(
    db: Client, plan_id: str
) -> tuple[dict[str, Any], bytes]:
    row = (
        db.table("plan_uploads")
        .select("storage_path, mime_type, analysis, status, filename")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    if row.get("status") != "analysed":
        raise HTTPException(409, f"plan not analysed (status={row.get('status')})")
    file_bytes = download(db, bucket=PLANS_BUCKET, path=row["storage_path"])
    return row, file_bytes


@router.get("/{plan_id}/pages")
async def list_pages(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Return per-page dimensions so the UI can size its overlay layer."""
    row, file_bytes = _load_plan_for_render(db, plan_id)
    pages = get_page_info(file_bytes=file_bytes, media_type=row["mime_type"])
    return {"pages": [p.__dict__ for p in pages]}


@router.get("/{plan_id}/pages/{page_num}.png")
async def page_image(
    plan_id: str,
    page_num: int,
    db: Client = Depends(get_db),
) -> Response:
    """Plain rendered page (no overlay) — UI draws bboxes on top in HTML."""
    row, file_bytes = _load_plan_for_render(db, plan_id)
    try:
        png = render_page(
            file_bytes=file_bytes,
            media_type=row["mime_type"],
            page=page_num,
        )
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/{plan_id}/bbox-stats")
async def bbox_stats(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Diagnostic: bbox quality stats for the analysed plan.

    Useful for comparing analyser runs across vision models — higher
    model_count and lower median_area generally = tighter, more confident
    grounding.
    """
    row = (
        db.table("plan_uploads")
        .select("analysis, status, prompt_version, analyser_version")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    flags = (row.get("analysis") or {}).get("flags") or []
    total = len(flags)
    model_count = sum(1 for f in flags if f.get("bbox_source") == "model")
    fallback_count = sum(
        1 for f in flags if f.get("bbox_source") == "tile_fallback"
    )
    text_layer_count = sum(
        1 for f in flags if f.get("bbox_source") == "text_layer"
    )
    ocr_count = sum(1 for f in flags if f.get("bbox_source") == "ocr")

    areas: list[float] = []
    for f in flags:
        bbox = f.get("bbox")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
            continue
        try:
            x0, y0, x1, y1 = (float(v) for v in bbox)
        except (TypeError, ValueError):
            continue
        if x1 > x0 and y1 > y0:
            areas.append((x1 - x0) * (y1 - y0))

    avg_area = sum(areas) / len(areas) if areas else 0.0
    sorted_areas = sorted(areas)
    median_area = sorted_areas[len(sorted_areas) // 2] if sorted_areas else 0.0

    grounded = model_count + text_layer_count + ocr_count
    text_anchored = text_layer_count + ocr_count
    return {
        "total_flags": total,
        "text_layer": text_layer_count,
        "ocr": ocr_count,
        "model_grounded": model_count,
        "tile_fallback": fallback_count,
        "text_layer_pct": round(text_layer_count / total * 100, 1) if total else 0.0,
        "ocr_pct": round(ocr_count / total * 100, 1) if total else 0.0,
        "text_anchored_pct": round(text_anchored / total * 100, 1) if total else 0.0,
        "grounded_pct": round(grounded / total * 100, 1) if total else 0.0,
        "avg_bbox_area": round(avg_area, 4),
        "median_bbox_area": round(median_area, 4),
        "prompt_version": row.get("prompt_version"),
        "analyser_version": row.get("analyser_version"),
        "status": row.get("status"),
    }


@router.get("/{plan_id}/overlay.pdf")
async def overlay_pdf(
    plan_id: str,
    db: Client = Depends(get_db),
) -> Response:
    """Multi-page PDF with bboxes + numbered pins baked in — for download."""
    row, file_bytes = _load_plan_for_render(db, plan_id)
    flags = (row.get("analysis") or {}).get("flags") or []
    pdf = render_overlay_pdf(
        file_bytes=file_bytes,
        media_type=row["mime_type"],
        flags=flags,
    )
    base = (row.get("filename") or "plan").rsplit(".", 1)[0]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{base}-marked-up.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    row = (
        db.table("plan_uploads")
        .select("storage_path")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(404, "plan not found")
    db.storage.from_(PLANS_BUCKET).remove([row["storage_path"]])
    db.table("plan_uploads").delete().eq("id", plan_id).execute()
    return {"status": "deleted"}
