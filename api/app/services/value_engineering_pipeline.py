"""Value-engineering pipeline.

Runs after a plan has been uploaded + RFI-analysed. Looks up the plan
row, downloads the source file, calls ``analyse_value_engineering``,
and persists the result to ``plan_value_engineering``.

Caching: if a prior VE run exists for the same (content_hash, version,
provider, model) it's cloned into a new row with ``cost_usd = 0`` so
the user gets instant results on re-trigger.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from supabase import Client

from app.config import get_settings
from app.storage import PLANS_BUCKET, download
from app.value_engineering import (
    VALUE_ENGINEERING_VERSION,
    analyse_value_engineering,
)


@dataclass
class ValueEngineeringResult:
    ve_id: str
    plan_id: str
    opportunities_count: int
    processing_ms: int
    cost_usd: float
    truncated: bool
    cached: bool


def _resolve_provider_model() -> tuple[str, str]:
    s = get_settings()
    provider = s.plan_analyser_provider
    model = s.openrouter_model if provider == "openrouter" else s.gemini_model
    return provider, model


def _load_plan_row(db: Client, plan_id: str) -> dict[str, Any]:
    row = (
        db.table("plan_uploads")
        .select(
            "id, project_id, storage_path, mime_type, status, content_hash, "
            "projects(bca, project_type, description)"
        )
        .eq("id", plan_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise LookupError(f"plan {plan_id} not found")
    if row.get("status") != "analysed":
        raise ValueError(
            f"plan not ready for VE (status={row.get('status')!r}); "
            "wait for RFI analysis to finish first"
        )
    return row


def _find_cached_row(
    db: Client,
    *,
    content_hash: str,
    provider: str,
    model_id: str,
    prompt_version: str,
) -> dict[str, Any] | None:
    rows = (
        db.table("plan_value_engineering")
        .select(
            "opportunities, summary, processing_ms, image_count, dpi_breakdown"
        )
        .eq("content_hash", content_hash)
        .eq("analyser_version", VALUE_ENGINEERING_VERSION)
        .eq("prompt_version", prompt_version)
        .eq("provider", provider)
        .eq("model_id", model_id)
        .eq("status", "analysed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def get_latest_value_engineering(
    db: Client, *, plan_id: str
) -> dict[str, Any] | None:
    rows = (
        db.table("plan_value_engineering")
        .select("*")
        .eq("plan_upload_id", plan_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def run_value_engineering(
    db: Client, *, plan_id: str
) -> ValueEngineeringResult:
    plan = _load_plan_row(db, plan_id)
    project = plan["projects"] or {}
    storage_path = plan["storage_path"]
    mime_type = plan["mime_type"] or "application/pdf"

    file_bytes = download(db, bucket=PLANS_BUCKET, path=storage_path)
    content_hash = plan.get("content_hash") or hashlib.sha256(file_bytes).hexdigest()
    provider, model_id = _resolve_provider_model()

    # Load prompt version once for cache lookup parity.
    from app.value_engineering.prompt import ACTIVE_PROMPT, load_prompt

    _, prompt_version = load_prompt(ACTIVE_PROMPT)

    cached = _find_cached_row(
        db,
        content_hash=content_hash,
        provider=provider,
        model_id=model_id,
        prompt_version=prompt_version,
    )

    ve_id = str(uuid4())
    common_row: dict[str, Any] = {
        "id": ve_id,
        "plan_upload_id": plan_id,
        "project_id": plan["project_id"],
        "analyser_version": VALUE_ENGINEERING_VERSION,
        "prompt_version": prompt_version,
        "provider": provider,
        "model_id": model_id,
        "content_hash": content_hash,
    }

    if cached:
        t0 = time.monotonic()
        opportunities = cached.get("opportunities") or []
        db.table("plan_value_engineering").insert(
            {
                **common_row,
                "status": "analysed",
                "opportunities": opportunities,
                "summary": cached.get("summary"),
                "processing_ms": int((time.monotonic() - t0) * 1000),
                "cost_usd": 0,
                "image_count": cached.get("image_count"),
                "dpi_breakdown": cached.get("dpi_breakdown"),
            }
        ).execute()
        return ValueEngineeringResult(
            ve_id=ve_id,
            plan_id=plan_id,
            opportunities_count=len(opportunities),
            processing_ms=int((time.monotonic() - t0) * 1000),
            cost_usd=0.0,
            truncated=False,
            cached=True,
        )

    db.table("plan_value_engineering").insert(
        {**common_row, "status": "analysing"}
    ).execute()

    try:
        payload, prompt_version, metrics, extras = analyse_value_engineering(
            file_bytes=file_bytes,
            media_type=mime_type,
            bca=project.get("bca") or "",
            project_type=project.get("project_type") or "",
            project_description=project.get("description") or "",
        )
    except Exception as e:
        db.table("plan_value_engineering").update(
            {"status": "failed", "error": str(e)[:500]}
        ).eq("id", ve_id).execute()
        raise

    db.table("plan_value_engineering").update(
        {
            "status": "analysed",
            "opportunities": payload["opportunities"],
            "summary": payload["summary"],
            "processing_ms": metrics.processing_ms,
            "cost_usd": round(metrics.cost_usd, 6),
            "analyser_version": extras["analyser_version"],
            "image_count": extras["image_count"],
            "dpi_breakdown": extras["dpi_breakdown"],
        }
    ).eq("id", ve_id).execute()

    return ValueEngineeringResult(
        ve_id=ve_id,
        plan_id=plan_id,
        opportunities_count=len(payload["opportunities"]),
        processing_ms=metrics.processing_ms,
        cost_usd=round(metrics.cost_usd, 6),
        truncated=bool(payload.get("truncated", False)),
        cached=False,
    )
