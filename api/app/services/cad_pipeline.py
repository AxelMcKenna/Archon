"""CAD (DXF) upload + analyse + revision pipeline.

Mirror of ``app.services.plan_pipeline``. Keeps ``routes/cad.py`` to a
thin HTTP layer.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from supabase import Client

from app.cad.cad_analyzer import CAD_ANALYSIS_VERSION, analyse_cad
from app.cad.cad_ops import apply_ops, parse_ops
from app.storage import CAD_BUCKET, download, signed_url, upload_cad


@dataclass
class CadAnalysisResult:
    cad_id: str
    flags_count: int
    entity_count: int
    views: list[Any]
    processing_ms: int


def upload_and_analyse(
    *,
    db: Client,
    project_id: str,
    project: dict[str, Any],
    filename: str,
    payload: bytes,
) -> CadAnalysisResult:
    cad_id = str(uuid4())
    storage_path = upload_cad(
        db,
        project_id=project_id,
        cad_id=cad_id,
        filename=filename,
        content_type="application/dxf",
        data=payload,
    )
    content_hash = hashlib.sha256(payload).hexdigest()

    db.table("cad_uploads").insert(
        {
            "id": cad_id,
            "project_id": project_id,
            "filename": filename,
            "storage_path": storage_path,
            "size_bytes": len(payload),
            "content_hash": content_hash,
            "analyser_version": CAD_ANALYSIS_VERSION,
            "status": "analysing",
        }
    ).execute()

    try:
        analysis, prompt_version, metrics, _extras = analyse_cad(
            dxf_bytes=payload,
            bca=project["bca"],
            project_type=project["project_type"],
            project_description=project.get("description") or "",
        )
    except Exception:
        db.table("cad_uploads").update(
            {"status": "failed", "error": "analysis failed"}
        ).eq("id", cad_id).execute()
        raise

    db.table("cad_uploads").update(
        {
            "status": "analysed",
            "analysis": analysis,
            "prompt_version": prompt_version,
            "processing_ms": metrics.processing_ms,
        }
    ).eq("id", cad_id).execute()

    return CadAnalysisResult(
        cad_id=cad_id,
        flags_count=len(analysis.get("flags", [])),
        entity_count=analysis.get("entity_count", 0),
        views=analysis.get("views", []),
        processing_ms=metrics.processing_ms,
    )


def latest_revision_path(db: Client, cad_id: str) -> str | None:
    rows = (
        db.table("cad_revisions")
        .select("dxf_path")
        .eq("cad_id", cad_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["dxf_path"] if rows else None


@dataclass
class RevisionResult:
    revision_id: str
    applied_count: int
    url: str


class RevisionError(ValueError):
    """Raised when an op can't be applied or a flag index is out of range."""


def apply_revision(
    *,
    db: Client,
    cad_id: str,
    cad_row: dict[str, Any],
    original_bytes: bytes,
    approved_flag_indices: list[int],
) -> RevisionResult:
    flags = (cad_row.get("analysis") or {}).get("flags") or []

    prior_path = latest_revision_path(db, cad_id)
    file_bytes = (
        download(db, bucket=CAD_BUCKET, path=prior_path)
        if prior_path
        else original_bytes
    )

    raw_ops: list[dict[str, Any]] = []
    applied_log: list[dict[str, Any]] = []
    for idx in approved_flag_indices:
        if idx < 0 or idx >= len(flags):
            raise RevisionError(f"flag index {idx} out of range")
        flag = flags[idx]
        pc = flag.get("proposed_change")
        if not pc:
            raise RevisionError(f"flag {idx} has no proposed_change")
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
        raise RevisionError(f"failed to apply ops: {e}") from e

    rev_id = str(uuid4())
    base = (cad_row.get("filename") or "drawing.dxf").rsplit(".", 1)[0]
    rev_filename = f"{base}-rev-{rev_id[:8]}.dxf"
    rev_path = upload_cad(
        db,
        project_id=str(cad_row.get("project_id") or ""),
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

    return RevisionResult(
        revision_id=rev_id,
        applied_count=len(applied_log),
        url=signed_url(db, bucket=CAD_BUCKET, path=rev_path),
    )
