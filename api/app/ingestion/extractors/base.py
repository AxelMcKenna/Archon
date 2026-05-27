"""Extractor protocol + registry.

Every source kind has one extractor. Adding a new source kind means
adding an extractor class and registering it in ``_REGISTRY`` below.
"""

from __future__ import annotations

from typing import Protocol

from app.ingestion.models import KBCandidate, VeIngestDocument


class Extractor(Protocol):
    """Read a fetched document, emit substitution candidates."""

    name: str
    version: str

    def extract(
        self, *, doc_bytes: bytes, doc: VeIngestDocument
    ) -> list[KBCandidate]: ...


def get_extractor(source_kind: str) -> Extractor:
    # Imported lazily to avoid circular imports — each extractor
    # may pull in heavy deps (pdfplumber, the LLM clients, ...).
    if source_kind == "test":
        from app.ingestion.extractors.test_extractor import TestExtractor

        return TestExtractor()
    raise KeyError(
        f"no extractor registered for source_kind={source_kind!r}; "
        "phase 1 only ships the 'test' extractor"
    )
