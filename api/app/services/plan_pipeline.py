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

import itertools
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import uuid4

from supabase import Client

from app.config import get_settings
from app.coordination.engine import run_project_coordination_safe
from app.plans import ANALYSIS_VERSION, analyse_plan
from app.plans.flags_store import replace_plan_flags
from app.services.analysis_runner import (
    content_hash as hash_bytes,
)
from app.services.analysis_runner import (
    find_cached_row,
    prompt_fingerprint,
    run_and_persist,
)
from app.storage import PLANS_BUCKET, download, upload_plan
from app.vision.core.invoker import analyser_provider_model
from app.vision.plans.schema import ACTIVE_ANALYSIS_PROMPT, ACTIVE_VERIFICATION_PROMPT

_CACHED_SELECT = (
    "analysis, prompt_version, processing_ms, cost_usd, "
    "verification_prompt_version, verification_drops, image_count, dpi_breakdown"
)


@lru_cache
def cache_version() -> str:
    """Cache-key version that invalidates on any analyser or prompt edit."""
    return prompt_fingerprint(
        ANALYSIS_VERSION, (ACTIVE_ANALYSIS_PROMPT, ACTIVE_VERIFICATION_PROMPT)
    )


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
    return analyser_provider_model(get_settings())


def upload_and_analyse(
    *,
    db: Client,
    project_id: str,
    project: dict[str, Any],
    filename: str,
    content_type: str,
    payload: bytes | None = None,
    storage_path: str | None = None,
    plan_id: str | None = None,
    analyse: bool = True,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> PlanAnalysisResult:
    # Wrapper-level log lines use a negative id space so they never collide with
    # the analyser's positive step ids (which pair a running line to its done).
    _wrap_seq = itertools.count(-1, -1)

    def emit(label: str, *, detail: str | None = None) -> None:
        if progress is None:
            return
        progress(
            {"id": next(_wrap_seq), "label": label, "status": "done", "detail": detail}
        )

    provider, model_id = resolve_provider_model()

    if storage_path is not None:
        # Direct-to-storage path: the browser already uploaded the file to a
        # backend-issued signed URL, so we download the bytes rather than
        # re-uploading them through this (size-limited) request.
        if not plan_id:
            raise ValueError("plan_id is required when storage_path is provided")
        payload = download(db, bucket=PLANS_BUCKET, path=storage_path)
    else:
        if payload is None:
            raise ValueError("either payload or storage_path must be provided")
        plan_id = str(uuid4())
        storage_path = upload_plan(
            db,
            project_id=project_id,
            plan_id=plan_id,
            filename=filename,
            content_type=content_type,
            data=payload,
        )

    digest = hash_bytes(payload)
    emit("Loaded drawing", detail=f"{len(payload) // 1024} KB")

    # Store-only path (e.g. uploads from the value-engineering page): persist
    # the file so VE can re-render it, but skip the RFI flagger entirely. The
    # row stays at status 'uploaded' and never enters the RFI flagger list.
    if not analyse:
        db.table("plan_uploads").insert(
            {
                "id": plan_id,
                "project_id": project_id,
                "filename": filename,
                "storage_path": storage_path,
                "mime_type": content_type,
                "size_bytes": len(payload),
                "content_hash": digest,
                "provider": provider,
                "model_id": model_id,
                "status": "uploaded",
            }
        ).execute()
        return PlanAnalysisResult(
            plan_id=plan_id,
            flags_count=0,
            processing_ms=0,
            cost_usd=0.0,
            truncated=False,
            verification="skipped",
            cached=False,
        )

    cached = find_cached_row(
        db,
        table="plan_uploads",
        select=_CACHED_SELECT,
        filters={
            "content_hash": digest,
            "analyser_version": cache_version(),
            "provider": provider,
            "model_id": model_id,
        },
    )

    if cached:
        emit("Found a prior analysis", detail="reusing cached results")
    else:
        emit("No cached result", detail="running a fresh analysis")

    common_row: dict[str, Any] = {
        "id": plan_id,
        "project_id": project_id,
        "filename": filename,
        "storage_path": storage_path,
        "mime_type": content_type,
        "size_bytes": len(payload),
        # analyser_version doubles as the cache key — fingerprint the prompts
        # so a prompt edit invalidates prior cached rows. analysis_version
        # stays the human-readable semantic version for display.
        "analyser_version": cache_version(),
        "analysis_version": ANALYSIS_VERSION,
        "content_hash": digest,
        "provider": provider,
        "model_id": model_id,
    }

    def clone_fields(c: dict[str, Any]) -> dict[str, Any]:
        return {
            "analysis": c["analysis"],
            "prompt_version": c.get("prompt_version"),
            "verification_prompt_version": c.get("verification_prompt_version"),
            "verification_drops": c.get("verification_drops"),
            "image_count": c.get("image_count"),
            "dpi_breakdown": c.get("dpi_breakdown"),
        }

    def analysed_fields(
        analysis: dict[str, Any], prompt_version: str, _metrics: Any, extras: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "analysis": analysis,
            "prompt_version": prompt_version,
            "analysis_version": extras["analysis_version"],
            "verification_prompt_version": extras["verification_prompt_version"],
            "verification_drops": extras["verification_drops"],
            "image_count": extras["image_count"],
            "dpi_breakdown": extras["dpi_breakdown"],
        }

    outcome = run_and_persist(
        db,
        table="plan_uploads",
        row_id=plan_id,
        base_row=common_row,
        cached_row=cached,
        analyse=lambda: analyse_plan(
            file_bytes=payload,
            media_type=content_type,
            bca=project["bca"],
            project_type=project["project_type"],
            project_description=project.get("description") or "",
            risk_group=project.get("risk_group") or "",
            importance_level=project.get("importance_level") or "",
            progress=progress,
        ),
        clone_fields=clone_fields,
        analysed_fields=analysed_fields,
    )

    # The flagger writes per-flag rows as the source of truth — keep them in
    # sync for both fresh and cloned analyses.
    analysis = (cached["analysis"] if cached else outcome.payload) or {}
    flags = analysis.get("flags") or []
    flags = flags if isinstance(flags, list) else []
    replace_plan_flags(
        db, plan_upload_id=plan_id, project_id=project_id, flags=flags
    )
    emit("Saved flags to project", detail=f"{len(flags)} flag(s)")

    # Refresh cross-document coordination now this drawing's flags are stored
    # (deterministic + fail-open; never blocks the analysis result).
    run_project_coordination_safe(db, project_id)

    return PlanAnalysisResult(
        plan_id=plan_id,
        flags_count=len(flags),
        processing_ms=outcome.processing_ms,
        cost_usd=outcome.cost_usd,
        truncated=bool(analysis.get("truncated", False)),
        verification=str(analysis.get("verification", "verified")),
        cached=outcome.cached,
    )
