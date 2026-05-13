"""Plan upload + analyse pipeline.

Wraps the route-level orchestration so the FastAPI handler stays thin:

  1. Upload the file to storage.
  2. Look up a cached analysis by (content_hash, version, provider, model).
  3. On hit: clone the cached analysis into a new row, return.
  4. On miss: insert a pending row, run ``analyse_plan``, update the row.

All DB writes use the request-scoped Supabase client passed in by the
route, so RLS is enforced.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from supabase import Client

from app.config import get_settings
from app.plans import ANALYSIS_VERSION, analyse_plan
from app.storage import upload_plan


@dataclass
class PlanAnalysisResult:
    plan_id: str
    flags_count: int
    processing_ms: int
    cost_usd: float
    truncated: bool
    verification: str
    cached: bool


def resolve_provider_model() -> tuple[str, str]:
    s = get_settings()
    provider = s.plan_analyser_provider
    model = s.openrouter_model if provider == "openrouter" else s.gemini_model
    return provider, model


def _find_cached_row(
    db: Client, *, content_hash: str, provider: str, model_id: str
) -> dict[str, Any] | None:
    rows = (
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
    return rows[0] if rows else None


def upload_and_analyse(
    *,
    db: Client,
    project_id: str,
    project: dict[str, Any],
    filename: str,
    content_type: str,
    payload: bytes,
) -> PlanAnalysisResult:
    content_hash = hashlib.sha256(payload).hexdigest()
    provider, model_id = resolve_provider_model()

    cached = _find_cached_row(
        db, content_hash=content_hash, provider=provider, model_id=model_id
    )

    plan_id = str(uuid4())
    storage_path = upload_plan(
        db,
        project_id=project_id,
        plan_id=plan_id,
        filename=filename,
        content_type=content_type,
        data=payload,
    )

    common_row: dict[str, Any] = {
        "id": plan_id,
        "project_id": project_id,
        "filename": filename,
        "storage_path": storage_path,
        "mime_type": content_type,
        "size_bytes": len(payload),
        "analyser_version": ANALYSIS_VERSION,
        "analysis_version": ANALYSIS_VERSION,
        "content_hash": content_hash,
        "provider": provider,
        "model_id": model_id,
    }

    if cached:
        t0 = time.monotonic()
        db.table("plan_uploads").insert(
            {
                **common_row,
                "status": "analysed",
                "analysis": cached["analysis"],
                "prompt_version": cached.get("prompt_version"),
                "processing_ms": int((time.monotonic() - t0) * 1000),
                "cost_usd": 0,
                "verification_prompt_version": cached.get(
                    "verification_prompt_version"
                ),
                "verification_drops": cached.get("verification_drops"),
                "image_count": cached.get("image_count"),
                "dpi_breakdown": cached.get("dpi_breakdown"),
            }
        ).execute()
        analysis = cached["analysis"] or {}
        return PlanAnalysisResult(
            plan_id=plan_id,
            flags_count=len(analysis.get("flags") or []),
            processing_ms=int((time.monotonic() - t0) * 1000),
            cost_usd=0.0,
            truncated=bool(analysis.get("truncated", False)),
            verification=str(analysis.get("verification", "verified")),
            cached=True,
        )

    db.table("plan_uploads").insert(
        {**common_row, "status": "analysing"}
    ).execute()

    try:
        analysis, prompt_version, metrics, extras = analyse_plan(
            file_bytes=payload,
            media_type=content_type,
            bca=project["bca"],
            project_type=project["project_type"],
            project_description=project.get("description") or "",
        )
    except Exception as e:
        db.table("plan_uploads").update(
            {"status": "failed", "error": str(e)[:500]}
        ).eq("id", plan_id).execute()
        raise

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

    return PlanAnalysisResult(
        plan_id=plan_id,
        flags_count=len(analysis.get("flags", [])),
        processing_ms=metrics.processing_ms,
        cost_usd=round(metrics.cost_usd, 6),
        truncated=bool(analysis.get("truncated", False)),
        verification=str(analysis.get("verification", "verified")),
        cached=False,
    )
