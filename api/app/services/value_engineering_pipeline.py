"""Value-engineering pipeline.

Runs over an uploaded drawing and persists the result to
``plan_value_engineering``. The source can be a PDF plan (``plan_uploads``)
or a DXF CAD upload (``cad_uploads``); VE re-renders the file and runs its
own vision pass, so it does not depend on RFI analysis having completed.

Caching: if a prior VE run exists for the same (content_hash, version,
provider, model) it's cloned into a new row with ``cost_usd = 0`` so
the user gets instant results on re-trigger.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import uuid4

from supabase import Client

from app.config import get_settings
from app.services.analysis_runner import (
    content_hash as hash_bytes,
)
from app.services.analysis_runner import (
    find_cached_row,
    prompt_fingerprint,
    run_and_persist,
)
from app.services.ve_pricing import enrich_opportunities
from app.storage import CAD_BUCKET, PLANS_BUCKET, download
from app.vision.core.invoker import analyser_provider_model
from app.vision.core.prompts import load_prompt
from app.vision.value_engineering import (
    VALUE_ENGINEERING_VERSION,
    analyse_value_engineering,
    analyse_value_engineering_cad,
)
from app.vision.value_engineering.schema import ACTIVE_PROMPT

# (payload, prompt_version, metrics, extras)
AnalyseFn = Callable[[], tuple[dict[str, Any], str, Any, dict[str, Any]]]

_CACHED_SELECT = "opportunities, summary, processing_ms, image_count, dpi_breakdown"


@lru_cache
def _cache_version() -> str:
    """Cache-key version that invalidates on any analyser or prompt edit."""
    return prompt_fingerprint(VALUE_ENGINEERING_VERSION, (ACTIVE_PROMPT,))


@dataclass
class ValueEngineeringResult:
    ve_id: str
    source_id: str
    opportunities_count: int
    processing_ms: int
    cost_usd: float
    truncated: bool
    cached: bool


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
    # VE is self-contained: it re-renders the PDF and runs its own vision
    # pass, so it does not depend on RFI analysis having completed. It only
    # needs a stored file to download.
    if not row.get("storage_path"):
        raise ValueError("plan has no stored file to analyse")
    if row.get("status") == "deleted":
        raise ValueError("plan has been deleted")
    return row


def _load_cad_row(db: Client, cad_id: str) -> dict[str, Any]:
    row = (
        db.table("cad_uploads")
        .select(
            "id, project_id, storage_path, status, content_hash, "
            "projects(bca, project_type, description)"
        )
        .eq("id", cad_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise LookupError(f"cad {cad_id} not found")
    if not row.get("storage_path"):
        raise ValueError("cad has no stored file to analyse")
    if row.get("status") == "deleted":
        raise ValueError("cad has been deleted")
    return row


def _get_latest(db: Client, *, id_field: str, source_id: str) -> dict[str, Any] | None:
    rows = (
        db.table("plan_value_engineering")
        .select("*")
        .eq(id_field, source_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def get_latest_value_engineering(
    db: Client, *, plan_id: str
) -> dict[str, Any] | None:
    return _get_latest(db, id_field="plan_upload_id", source_id=plan_id)


def get_latest_value_engineering_cad(
    db: Client, *, cad_id: str
) -> dict[str, Any] | None:
    return _get_latest(db, id_field="cad_upload_id", source_id=cad_id)


def _run_and_persist(
    db: Client,
    *,
    id_field: str,
    source_id: str,
    project_id: str,
    content_hash: str,
    analyse: AnalyseFn,
) -> ValueEngineeringResult:
    provider, model_id = analyser_provider_model(get_settings())
    _, prompt_version = load_prompt(ACTIVE_PROMPT)
    analyser_version = _cache_version()

    cached = find_cached_row(
        db,
        table="plan_value_engineering",
        select=_CACHED_SELECT,
        filters={
            "content_hash": content_hash,
            "analyser_version": analyser_version,
            "prompt_version": prompt_version,
            "provider": provider,
            "model_id": model_id,
        },
        newest_first=True,
    )

    ve_id = str(uuid4())
    common_row: dict[str, Any] = {
        "id": ve_id,
        id_field: source_id,
        "project_id": project_id,
        # analyser_version doubles as the cache key — fingerprint the prompt so
        # a prompt-body edit invalidates prior cached rows (prompt_version stays
        # the human-readable frontmatter version).
        "analyser_version": analyser_version,
        "prompt_version": prompt_version,
        "provider": provider,
        "model_id": model_id,
        "content_hash": content_hash,
    }

    def clone_fields(c: dict[str, Any]) -> dict[str, Any]:
        return {
            "opportunities": c.get("opportunities") or [],
            "summary": c.get("summary"),
            "image_count": c.get("image_count"),
            "dpi_breakdown": c.get("dpi_breakdown"),
        }

    def analysed_fields(
        payload: dict[str, Any], _pv: str, _metrics: Any, extras: dict[str, Any]
    ) -> dict[str, Any]:
        # Leave analyser_version untouched — base_row already holds the cache
        # fingerprint; overwriting it with the bare semantic version would
        # break the cache key on the persisted row.
        return {
            "opportunities": payload["opportunities"],
            "summary": payload["summary"],
            "image_count": extras["image_count"],
            "dpi_breakdown": extras["dpi_breakdown"],
        }

    outcome = run_and_persist(
        db,
        table="plan_value_engineering",
        row_id=ve_id,
        base_row=common_row,
        cached_row=cached,
        analyse=analyse,
        clone_fields=clone_fields,
        analysed_fields=analysed_fields,
    )

    if cached:
        opportunities = cached.get("opportunities") or []
        truncated = False
    else:
        opportunities = outcome.payload["opportunities"]
        truncated = bool(outcome.payload.get("truncated", False))

    return ValueEngineeringResult(
        ve_id=ve_id,
        source_id=source_id,
        opportunities_count=len(opportunities),
        processing_ms=outcome.processing_ms,
        cost_usd=outcome.cost_usd,
        truncated=truncated,
        cached=outcome.cached,
    )


def run_value_engineering(
    db: Client, *, plan_id: str
) -> ValueEngineeringResult:
    plan = _load_plan_row(db, plan_id)
    project = plan["projects"] or {}
    file_bytes = download(db, bucket=PLANS_BUCKET, path=plan["storage_path"])
    content_hash = plan.get("content_hash") or hash_bytes(file_bytes)
    media_type = plan["mime_type"] or "application/pdf"

    def analyse() -> tuple[dict[str, Any], str, Any, dict[str, Any]]:
        result = analyse_value_engineering(
            file_bytes=file_bytes,
            media_type=media_type,
            bca=project.get("bca") or "",
            project_type=project.get("project_type") or "",
            project_description=project.get("description") or "",
        )
        # Attach indicative Bunnings retail prices before persist so they're
        # cached alongside the analysis (and cloned on re-trigger). Best-effort.
        enrich_opportunities(db, result[0].get("opportunities") or [])
        return result

    return _run_and_persist(
        db,
        id_field="plan_upload_id",
        source_id=plan_id,
        project_id=plan["project_id"],
        content_hash=content_hash,
        analyse=analyse,
    )


def run_value_engineering_cad(
    db: Client, *, cad_id: str
) -> ValueEngineeringResult:
    cad = _load_cad_row(db, cad_id)
    project = cad["projects"] or {}
    dxf_bytes = download(db, bucket=CAD_BUCKET, path=cad["storage_path"])
    content_hash = cad.get("content_hash") or hash_bytes(dxf_bytes)

    def analyse() -> tuple[dict[str, Any], str, Any, dict[str, Any]]:
        # Handle-grounded CAD VE: opportunities carry target_handles +
        # geometrically-projected per-view image_bboxes so the UI can overlay
        # them on the DXF views, exactly like the RFI CAD path.
        result = analyse_value_engineering_cad(
            dxf_bytes=dxf_bytes,
            bca=project.get("bca") or "",
            project_type=project.get("project_type") or "",
            project_description=project.get("description") or "",
        )
        enrich_opportunities(db, result[0].get("opportunities") or [])
        return result

    return _run_and_persist(
        db,
        id_field="cad_upload_id",
        source_id=cad_id,
        project_id=cad["project_id"],
        content_hash=content_hash,
        analyse=analyse,
    )
