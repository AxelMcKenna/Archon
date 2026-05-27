"""Phase-1 plumbing smoke extractor.

Emits one hardcoded KBCandidate regardless of input bytes. Lets us
prove the fetch → store → DB → KB-insert path end-to-end before any
real extractor work in Phase 2+.
"""

from __future__ import annotations

from app.ingestion.models import KBCandidate, VeIngestDocument


class TestExtractor:
    name = "test_extractor"
    version = "0.1.0"

    def extract(
        self, *, doc_bytes: bytes, doc: VeIngestDocument
    ) -> list[KBCandidate]:
        return [
            KBCandidate(
                category="material_substitution",
                subcategory="phase1_smoke",
                current_spec_patterns=["__test_pattern__"],
                proposed_alternative=(
                    "Phase-1 smoke test candidate — proves the ingest "
                    "pipeline persists rows end-to-end."
                ),
                rationale=(
                    "This row exists to verify plumbing only. It carries a "
                    "well-known pattern string so it can be safely deleted "
                    "before real KB entries land."
                ),
                savings_band="low",
                source="test_smoke",
                source_url=doc.source_url,
                confidence="auto_extracted",
                extracted_clause=(
                    f"(test) document {doc.source_key} fetched at "
                    f"hash {doc.content_hash[:12]} — {len(doc_bytes)} bytes"
                ),
            )
        ]
