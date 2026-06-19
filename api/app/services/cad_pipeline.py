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
from app.cad.cad_ops import apply_ops, apply_ops_with_delta, parse_ops
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
    payload: bytes | None = None,
    storage_path: str | None = None,
    cad_id: str | None = None,
    analyse: bool = True,
) -> CadAnalysisResult:
    if storage_path is not None:
        # Direct-to-storage path: file already uploaded to a signed URL.
        if not cad_id:
            raise ValueError("cad_id is required when storage_path is provided")
        payload = download(db, bucket=CAD_BUCKET, path=storage_path)
    else:
        if payload is None:
            raise ValueError("either payload or storage_path must be provided")
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

    # Store-only path (e.g. uploads from the value-engineering page): persist
    # the file so VE can re-render it, but skip the RFI flagger entirely. The
    # row stays at status 'uploaded' and never enters the RFI flagger list.
    if not analyse:
        db.table("cad_uploads").insert(
            {
                "id": cad_id,
                "project_id": project_id,
                "filename": filename,
                "storage_path": storage_path,
                "size_bytes": len(payload),
                "content_hash": content_hash,
                "status": "uploaded",
            }
        ).execute()
        return CadAnalysisResult(
            cad_id=cad_id,
            flags_count=0,
            entity_count=0,
            views=[],
            processing_ms=0,
        )

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


# ── Append-only revision log (Phase 1) ─────────────────────────────────────


class CommitConflict(ValueError):
    """Raised when ops are committed against a stale base revision (the client
    is editing an out-of-date scene). Surfaced as HTTP 409."""


def check_base_is_latest(
    base_revision_id: str | None, latest_revision_id: str | None
) -> bool:
    """Optimistic-lock predicate. ``base_revision_id`` is what the client
    believes it's editing; ``latest_revision_id`` is the head of the log (None
    when no revisions exist, i.e. the base is the original upload). The commit
    is safe only when they agree."""
    return base_revision_id == latest_revision_id


def latest_revision(db: Client, cad_id: str) -> dict[str, Any] | None:
    """Head of the revision log for a cad, or None if untouched."""
    rows = (
        db.table("cad_revisions")
        .select("id, seq, dxf_path")
        .eq("cad_id", cad_id)
        .order("seq", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


@dataclass
class CommitResult:
    revision_id: str
    seq: int
    delta: dict[str, list[str]]
    url: str


def commit_ops(
    *,
    db: Client,
    cad_id: str,
    cad_row: dict[str, Any],
    original_bytes: bytes,
    base_revision_id: str | None,
    raw_ops: list[dict[str, Any]],
) -> CommitResult:
    """Apply human/AI-authored ops onto ``base_revision_id`` and append an
    immutable revision. Returns the op-result delta so the client reconciles
    without a full reload. Raises ``CommitConflict`` on a stale base.

    The compliance recheck is intentionally *not* run here — callers schedule
    ``recheck_revision`` as a background task so the commit stays fast and out
    of the interaction loop.
    """
    head = latest_revision(db, cad_id)
    head_id = head["id"] if head else None
    if not check_base_is_latest(base_revision_id, head_id):
        raise CommitConflict(
            f"stale base: client based on {base_revision_id!r}, head is {head_id!r}"
        )

    file_bytes = (
        download(db, bucket=CAD_BUCKET, path=head["dxf_path"])
        if head
        else original_bytes
    )

    try:
        ops = parse_ops(raw_ops)
        revised, delta = apply_ops_with_delta(file_bytes, ops)
    except CommitConflict:
        raise
    except Exception as e:
        raise RevisionError(f"failed to apply ops: {e}") from e

    rev_id = str(uuid4())
    seq = (head["seq"] + 1) if head else 1
    base = (cad_row.get("filename") or "drawing.dxf").rsplit(".", 1)[0]
    rev_path = upload_cad(
        db,
        project_id=str(cad_row.get("project_id") or ""),
        cad_id=cad_id,
        filename=f"{base}-rev-{seq:04d}-{rev_id[:8]}.dxf",
        content_type="application/dxf",
        data=revised,
    )

    db.table("cad_revisions").insert(
        {
            "id": rev_id,
            "cad_id": cad_id,
            "base_revision_id": base_revision_id,
            "seq": seq,
            "applied_ops": raw_ops,
            "delta": delta.to_dict(),
            "dxf_path": rev_path,
            "recheck_status": "pending",
        }
    ).execute()

    return CommitResult(
        revision_id=rev_id,
        seq=seq,
        delta=delta.to_dict(),
        url=signed_url(db, bucket=CAD_BUCKET, path=rev_path),
    )


def revert_to(
    *,
    db: Client,
    cad_id: str,
    cad_row: dict[str, Any],
    original_bytes: bytes,
    to_revision_id: str | None,
) -> CommitResult:
    """Undo/redo primitive — append a new revision whose geometry equals a
    target revision (or the original upload when ``to_revision_id`` is None).
    Keeps the log append-only: undo/redo move forward by copying backward.
    """
    if to_revision_id is None:
        src = original_bytes
    else:
        r = (
            db.table("cad_revisions")
            .select("dxf_path")
            .eq("id", to_revision_id)
            .eq("cad_id", cad_id)
            .maybe_single()
            .execute()
            .data
        )
        if not r:
            raise RevisionError("revert target not found")
        src = download(db, bucket=CAD_BUCKET, path=r["dxf_path"])

    head = latest_revision(db, cad_id)
    rev_id = str(uuid4())
    seq = (head["seq"] + 1) if head else 1
    base = (cad_row.get("filename") or "drawing.dxf").rsplit(".", 1)[0]
    rev_path = upload_cad(
        db,
        project_id=str(cad_row.get("project_id") or ""),
        cad_id=cad_id,
        filename=f"{base}-rev-{seq:04d}-{rev_id[:8]}.dxf",
        content_type="application/dxf",
        data=src,
    )
    db.table("cad_revisions").insert(
        {
            "id": rev_id,
            "cad_id": cad_id,
            "base_revision_id": head["id"] if head else None,
            "seq": seq,
            "applied_ops": [{"op": "revert", "to": to_revision_id}],
            "delta": {"added": [], "removed": [], "changed": []},
            "dxf_path": rev_path,
            "recheck_status": "pending",
        }
    ).execute()
    return CommitResult(
        revision_id=rev_id,
        seq=seq,
        delta={"added": [], "removed": [], "changed": []},
        url=signed_url(db, bucket=CAD_BUCKET, path=rev_path),
    )


def recheck_revision(
    *,
    db: Client,
    cad_id: str,
    revision_id: str,
    cad_row: dict[str, Any],
) -> None:
    """Compliance recheck hook — re-run the flagger against a committed
    revision and store the verdict on it. Designed to run in the background;
    the engine, not the UI, owns whether a revision is compliant.
    """
    rev = (
        db.table("cad_revisions")
        .select("dxf_path")
        .eq("id", revision_id)
        .maybe_single()
        .execute()
        .data
    )
    if not rev:
        return
    db.table("cad_revisions").update({"recheck_status": "running"}).eq(
        "id", revision_id
    ).execute()
    try:
        dxf_bytes = download(db, bucket=CAD_BUCKET, path=rev["dxf_path"])
        analysis, _prompt_version, _metrics, _extras = analyse_cad(
            dxf_bytes=dxf_bytes,
            bca=cad_row["bca"],
            project_type=cad_row["project_type"],
            project_description=cad_row.get("description") or "",
        )
    except Exception:
        db.table("cad_revisions").update({"recheck_status": "failed"}).eq(
            "id", revision_id
        ).execute()
        return

    db.table("cad_revisions").update(
        {"flags": analysis.get("flags", []), "recheck_status": "done"}
    ).eq("id", revision_id).execute()
