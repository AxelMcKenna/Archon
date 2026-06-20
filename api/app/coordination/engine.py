"""Project coordination engine: gather → reconcile → persist.

``run_project_coordination`` is invoked after any document is analysed (cheap,
deterministic Tier 1) and on demand from the coordination route (which may also
request the gated Tier-2 LLM pass). It reads each document's already-persisted
extraction, builds ``DocumentClaims``, runs the Tier-1 rules, and replaces the
project's ``project_coordination_flags``.

Gathering documents is split out (``gather_documents``) and the rules / claims
are pure functions, so the reconciliation logic is unit-tested directly without
a live DB.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from supabase import Client

from app.config import get_settings
from app.coordination.claims import (
    claims_from_drawing,
    claims_from_material,
    claims_from_spec,
)
from app.coordination.flags_store import replace_project_coordination_flags
from app.coordination.llm_reconcile import (
    llm_flag_signature,
    reconcile_documents_llm,
)
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
    re-parsed on demand from the stored PDF - cheap and deterministic. Fails open
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
    except Exception as exc:  # noqa: BLE001 - fail open on a single bad file
        log.warning("coordination: re-parse failed for plan %s: %s", row.get("id"), exc)
        return {}


# One document = (row, extraction_block). The block is the spec's
# analysis.extraction or the drawing's plan_text to_prompt_block - the same
# structured text Tier 1 builds claims from and Tier 2 feeds to the LLM.
Document = tuple[dict[str, Any], dict[str, Any]]


def gather_documents(
    db: Client, project_id: str
) -> tuple[list[Document], list[Document], list[Document]]:
    """Gather every analysed spec, material datasheet, and drawing with its
    extraction block (one DB pass; drawings re-parse the stored PDF only when
    text wasn't persisted). spec_documents holds both specs and materials,
    distinguished by ``doc_kind``."""
    sd_rows = (
        db.table("spec_documents")
        .select("id, filename, content_hash, analysis, status, doc_kind")
        .eq("project_id", project_id)
        .eq("status", "analysed")
        .execute()
        .data
        or []
    )
    draw_rows = (
        db.table("plan_uploads")
        .select("id, filename, content_hash, storage_path, mime_type, analysis, status")
        .eq("project_id", project_id)
        .eq("status", "analysed")
        .execute()
        .data
        or []
    )
    specs: list[Document] = [
        (r, (r.get("analysis") or {}).get("extraction") or {})
        for r in sd_rows
        if (r.get("doc_kind") or "spec") != "material"
    ]
    materials: list[Document] = [
        (r, (r.get("analysis") or {}).get("extraction") or {})
        for r in sd_rows
        if (r.get("doc_kind") or "spec") == "material"
    ]
    drawings: list[Document] = [
        (r, _drawing_text_extraction(db, r)) for r in draw_rows
    ]
    return specs, materials, drawings


def _fingerprint(*groups: list[Document]) -> str:
    parts = [
        f"{r.get('id')}:{r.get('content_hash')}" for g in groups for r, _ in g
    ]
    return "|".join(sorted(parts))


def run_project_coordination(
    db: Client, project_id: str, *, run_tier2: bool = False
) -> CoordinationResult:
    """Reconcile the project's document set and persist coordination flags.

    Tier 1 (deterministic) always runs. Tier 2 (LLM) runs only when
    ``run_tier2`` is set AND the feature gate is on - so the per-upload
    auto-trigger stays free and the LLM cost is paid only on an explicit
    deep cross-check."""
    specs, materials, drawings = gather_documents(db, project_id)
    claims = (
        [claims_from_spec(r) for r, _ in specs]
        + [claims_from_material(r) for r, _ in materials]
        + [claims_from_drawing(r, b) for r, b in drawings]
    )
    fingerprint = _fingerprint(specs, materials, drawings)

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

    # Tier 2 - LLM semantic reconciliation of spec <-> drawing. Gated off by
    # default; deduped against the Tier-1 flags it would otherwise restate.
    settings = get_settings()
    product_docs = specs + materials
    if run_tier2 and settings.spec_coordination_enabled and product_docs and drawings:
        ctx = _project_context(db, project_id)
        seen = {llm_flag_signature(f) for f in flags}
        for lf in reconcile_documents_llm(
            specs=product_docs,
            drawings=drawings,
            settings=settings,
            project_context=ctx,
        ):
            sig = llm_flag_signature(lf)
            if sig not in seen:
                seen.add(sig)
                flags.append(lf)

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
    except Exception as exc:  # noqa: BLE001 - coordination must never break an upload
        log.warning("coordination: run failed for project %s: %s", project_id, exc)


def _project_context(db: Client, project_id: str) -> dict[str, Any]:
    """The design parameters Tier 2 needs to judge a product's scope of use.

    Fail-open to ``{}`` - the prompt is told not to guess when a parameter is
    missing, so partial context simply narrows what the scope check can catch."""
    cols = (
        "project_type, description, bca, risk_group, importance_level, "
        "estimated_floor_area_m2, estimated_construction_value_nzd"
    )
    try:
        row = (
            db.table("projects")
            .select(cols)
            .eq("id", project_id)
            .maybe_single()
            .execute()
            .data
        )
    except Exception:  # noqa: BLE001 - older schemas may lack a column
        try:
            row = (
                db.table("projects")
                .select("project_type, description, bca")
                .eq("id", project_id)
                .maybe_single()
                .execute()
                .data
            )
        except Exception:  # noqa: BLE001
            return {}
    return {k: v for k, v in (row or {}).items() if v not in (None, "")}


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
    except Exception as exc:  # noqa: BLE001 - run bookkeeping must never fail a run
        log.warning("coordination: run upsert failed for %s: %s", project_id, exc)
