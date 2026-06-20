"""Project coordination engine: gather → reconcile → persist.

``run_project_coordination`` is invoked after any document is analysed (cheap,
deterministic) and on demand from the coordination route. It reads each
document's already-persisted extraction, builds ``DocumentClaims``, runs the
Tier-1 rules, and replaces the project's ``project_coordination_flags``.

Gathering claims is split out (``gather_claims``) so it can be unit-tested /
monkeypatched without a live DB.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from supabase import Client

from app.coordination.claims import (
    DocumentClaims,
    claims_from_drawing,
    claims_from_spec,
)
from app.coordination.flags_store import replace_project_coordination_flags
from app.coordination.rules import run_coordination_rules
from app.extractors.plan_text import extract_plan_text
from app.storage import PLANS_BUCKET, download

log = logging.getLogger(__name__)


@dataclass
class CoordinationResult:
    project_id: str
    document_count: int
    flags_count: int
    fingerprint: str
    ran: bool  # False when <2 documents (nothing to reconcile)


def _drawing_text_extraction(db: Client, row: dict[str, Any]) -> dict[str, Any]:
    """Persisted ``analysis.text_extraction`` if present, else re-parse the PDF.

    Older plan rows (analysed before the analyser persisted text_extraction) are
    re-parsed on demand from the stored PDF — cheap and deterministic. Fails open
    to an empty extraction so one unreadable drawing never breaks the run."""
    analysis = row.get("analysis") or {}
    te = analysis.get("text_extraction")
    if isinstance(te, dict) and te:
        return te
    storage_path = row.get("storage_path")
    mime = row.get("mime_type") or ""
    if not storage_path or "pdf" not in mime:
        return {}
    try:
        pdf = download(db, bucket=PLANS_BUCKET, path=storage_path)
        return extract_plan_text(pdf).to_prompt_block()
    except Exception as exc:  # noqa: BLE001 — fail open on a single bad file
        log.warning("coordination: re-parse failed for plan %s: %s", row.get("id"), exc)
        return {}


def gather_claims(db: Client, project_id: str) -> tuple[list[DocumentClaims], list[str]]:
    """Build claims for every analysed spec + drawing in the project.

    Returns ``(claims, fingerprint_parts)`` where each fingerprint part is
    ``"<id>:<content_hash>"`` so the caller can detect a changed document set.
    """
    specs = (
        db.table("spec_documents")
        .select("id, filename, content_hash, analysis, status")
        .eq("project_id", project_id)
        .eq("status", "analysed")
        .execute()
        .data
        or []
    )
    drawings = (
        db.table("plan_uploads")
        .select("id, filename, content_hash, storage_path, mime_type, analysis, status")
        .eq("project_id", project_id)
        .eq("status", "analysed")
        .execute()
        .data
        or []
    )

    claims: list[DocumentClaims] = []
    parts: list[str] = []
    for s in specs:
        claims.append(claims_from_spec(s))
        parts.append(f"{s.get('id')}:{s.get('content_hash')}")
    for d in drawings:
        te = _drawing_text_extraction(db, d)
        claims.append(claims_from_drawing(d, te))
        parts.append(f"{d.get('id')}:{d.get('content_hash')}")
    return claims, sorted(parts)


def run_project_coordination(db: Client, project_id: str) -> CoordinationResult:
    """Reconcile the project's document set and persist coordination flags."""
    claims, parts = gather_claims(db, project_id)
    fingerprint = "|".join(parts)

    # Nothing to reconcile until at least two documents exist. Clear any stale
    # flags and record an empty run so the UI shows an honest "in sync" state.
    if len(claims) < 2:
        replace_project_coordination_flags(db, project_id=project_id, flags=[])
        _record_run(db, project_id, fingerprint, 0)
        return CoordinationResult(
            project_id=project_id,
            document_count=len(claims),
            flags_count=0,
            fingerprint=fingerprint,
            ran=False,
        )

    flags = run_coordination_rules(claims)
    # Tier 2 (LLM) plugs in here, gated by settings.spec_coordination_enabled.

    replace_project_coordination_flags(db, project_id=project_id, flags=flags)
    _record_run(db, project_id, fingerprint, len(flags))

    return CoordinationResult(
        project_id=project_id,
        document_count=len(claims),
        flags_count=len(flags),
        fingerprint=fingerprint,
        ran=True,
    )


def run_project_coordination_safe(db: Client, project_id: str) -> None:
    """Fire-and-forget coordination after a document changes.

    Wraps :func:`run_project_coordination` so a coordination failure never fails
    the upload/analysis that triggered it. Deterministic and fast, so it is safe
    to run inline at the end of each pipeline."""
    try:
        run_project_coordination(db, project_id)
    except Exception as exc:  # noqa: BLE001 — coordination must never break an upload
        log.warning("coordination: run failed for project %s: %s", project_id, exc)


def _record_run(db: Client, project_id: str, fingerprint: str, flags_count: int) -> None:
    """Upsert the project's current coordination run (one row per project)."""
    try:
        db.table("project_coordination_runs").upsert(
            {
                "project_id": project_id,
                "document_fingerprint": fingerprint,
                "flags_count": flags_count,
                "tier": "deterministic",
            },
            on_conflict="project_id",
        ).execute()
    except Exception as exc:  # noqa: BLE001 — run bookkeeping must never fail a run
        log.warning("coordination: run upsert failed for %s: %s", project_id, exc)
