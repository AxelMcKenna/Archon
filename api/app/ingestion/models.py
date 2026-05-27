"""Shared data structures for the ingestion layer.

These are the *pre-DB* shapes — they cross extractor/pipeline boundaries
without being tied to a Supabase row type. Persistence happens in
``app.ingestion.storage``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

SourceKind = Literal[
    "mbie_acceptable_solution",
    "council_guidance",
    "supplier_datasheet",
    "test",
]
FetchStatus = Literal["fetched", "unchanged", "policy_skip", "error"]
ExtractionStatus = Literal["pending", "extracted", "failed", "skipped"]


@dataclass
class VeIngestDocument:
    """A fetched-and-stored raw document. Mirrors the ve_ingest_documents row."""

    id: str
    source_kind: str
    source_key: str
    source_url: str
    storage_path: str
    content_hash: str
    content_type: str | None
    etag: str | None
    last_modified: str | None
    bytes: int
    extraction_status: str = "pending"


@dataclass
class KBCandidate:
    """One substitution opportunity extracted from a source document.

    Maps 1:1 to a ve_knowledge_base insert. ``ingest_document_id`` is
    attached by the pipeline, not the extractor.
    """

    category: str
    proposed_alternative: str
    savings_band: str  # low | medium | high
    source: str  # human-readable source label, e.g. 'mbie_e2_as1'
    rationale: str | None = None
    subcategory: str | None = None
    current_spec_patterns: list[str] = field(default_factory=list)
    applicability_conditions: dict[str, Any] | None = None
    code_references: list[dict[str, str]] | None = None
    savings_note: str | None = None
    source_url: str | None = None
    confidence: str = "auto_extracted"
    bca_specific: list[str] | None = None
    extracted_clause: str | None = None


@dataclass
class IngestRunSummary:
    """Returned by ``pipeline.run_source`` — what the operator sees."""

    source_kind: str
    started_at: str
    finished_at: str | None = None
    fetched: int = 0
    unchanged: int = 0
    policy_skipped: int = 0
    extracted_candidates: int = 0
    inserted_kb_rows: int = 0
    deduped_kb_rows: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)
