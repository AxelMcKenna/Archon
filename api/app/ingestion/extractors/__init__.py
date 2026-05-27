"""Per-source-kind extractors.

Each extractor reads bytes of one fetched document and emits a list of
``KBCandidate`` rows. Extractors should never write to the DB
themselves — the pipeline owns persistence.
"""

from app.ingestion.extractors.base import Extractor, get_extractor

__all__ = ["Extractor", "get_extractor"]
