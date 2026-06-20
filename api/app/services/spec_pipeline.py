"""Specification / product-document upload + analyse pipeline.

Keeps the FastAPI handler thin:

  1. Upload the file to the ``specs`` bucket.
  2. Extract the text layer and run the deterministic spec flagger.
  3. Insert a spec_documents row (with the analysis jsonb mirror).
  4. Write per-flag rows to spec_flags.

The spec flagger is fully deterministic (no LLM), so unlike the plan pipeline
there is no provider/model/cache-clone machinery — re-running is cheap and
idempotent. All DB writes use the request-scoped Supabase client so RLS holds.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from supabase import Client

from app.coordination.engine import run_project_coordination_safe
from app.extractors.material_rules import run_material_rules
from app.extractors.material_text import extract_material_text
from app.extractors.spec_rules import run_spec_rules
from app.extractors.spec_text import extract_spec_text
from app.services.analysis_runner import content_hash as hash_bytes
from app.services.spec_flags_store import replace_spec_flags
from app.storage import SPECS_BUCKET, download, upload_spec

# Bump when the extractor or rules change in a way that should re-flag existing
# documents. Stored on the row for observability (not a cache key today).
SPEC_EXTRACTOR_VERSION = "spec-1.0.0"
MATERIAL_EXTRACTOR_VERSION = "material-1.0.0"

# A spec_documents row is either a written specification or a material/product
# data sheet — same table, same pipeline, different extractor + rules.
_DOC_KINDS = {"spec", "material"}

# pdfplumber can only read a text layer out of PDFs; other media are stored but
# not flagged (a scanned-image spec would need the vision path, out of scope).
_ANALYSABLE_MEDIA = {"application/pdf"}


@dataclass
class SpecAnalysisResult:
    spec_id: str
    flags_count: int
    processing_ms: int
    status: str
    analysed: bool


def upload_and_analyse(
    *,
    db: Client,
    project_id: str,
    filename: str,
    content_type: str,
    payload: bytes | None = None,
    storage_path: str | None = None,
    spec_id: str | None = None,
    analyse: bool = True,
    doc_kind: str = "spec",
) -> SpecAnalysisResult:
    started = time.perf_counter()
    doc_kind = doc_kind if doc_kind in _DOC_KINDS else "spec"
    is_material = doc_kind == "material"
    extractor_version = (
        MATERIAL_EXTRACTOR_VERSION if is_material else SPEC_EXTRACTOR_VERSION
    )

    if storage_path is not None:
        if not spec_id:
            raise ValueError("spec_id is required when storage_path is provided")
        payload = download(db, bucket=SPECS_BUCKET, path=storage_path)
    else:
        if payload is None:
            raise ValueError("either payload or storage_path must be provided")
        spec_id = str(uuid4())
        storage_path = upload_spec(
            db,
            project_id=project_id,
            spec_id=spec_id,
            filename=filename,
            content_type=content_type,
            data=payload,
        )

    digest = hash_bytes(payload)
    can_analyse = analyse and content_type in _ANALYSABLE_MEDIA

    flags: list[dict[str, Any]] = []
    analysis: dict[str, Any] | None = None
    status = "uploaded"

    if can_analyse:
        extraction = (
            extract_material_text(payload)
            if is_material
            else extract_spec_text(payload)
        )
        if extraction.looks_scanned:
            # No usable text layer — store the file, flag nothing, and say so
            # rather than emit a misleading "0 issues" on an unreadable scan.
            status = "no_text_layer"
        else:
            flags = (
                run_material_rules(extraction)
                if is_material
                else run_spec_rules(extraction)
            )
            analysis = {
                "flags": flags,
                "extraction": extraction.to_prompt_block(),
                "extractor_version": extractor_version,
                "doc_kind": doc_kind,
            }
            status = "analysed"

    processing_ms = int((time.perf_counter() - started) * 1000)

    db.table("spec_documents").insert(
        {
            "id": spec_id,
            "project_id": project_id,
            "filename": filename,
            "storage_path": storage_path,
            "mime_type": content_type,
            "size_bytes": len(payload),
            "status": status,
            "content_hash": digest,
            "extractor_version": extractor_version,
            "doc_kind": doc_kind,
            "analysis": analysis,
            "flags_count": len(flags),
            "processing_ms": processing_ms,
        }
    ).execute()

    replace_spec_flags(
        db, spec_document_id=spec_id, project_id=project_id, flags=flags
    )

    # The project is one related set — refresh cross-document coordination now
    # that this spec landed (deterministic + fail-open, never blocks the upload).
    run_project_coordination_safe(db, project_id)

    return SpecAnalysisResult(
        spec_id=spec_id,
        flags_count=len(flags),
        processing_ms=processing_ms,
        status=status,
        analysed=status == "analysed",
    )
