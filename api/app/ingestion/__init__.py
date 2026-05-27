"""VE knowledge-base ingestion layer.

Fetches public NZ construction documents (MBIE Acceptable Solutions,
council guidance, supplier datasheets), extracts substitution patterns,
and writes them to ``ve_knowledge_base`` with status='review' for human
approval before they reach end users via the VE pass.

Designed to be invoked two ways:
  - CLI:   python -m app.ingestion.run --source <kind>
  - HTTP:  POST /admin/ingest/{source_kind} (X-Admin-Token guarded)

Both paths share ``app.ingestion.pipeline.run_source``.
"""

from app.ingestion.models import (
    IngestRunSummary,
    KBCandidate,
    VeIngestDocument,
)

__all__ = ["IngestRunSummary", "KBCandidate", "VeIngestDocument"]
