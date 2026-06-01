"""MBIE Acceptable Solutions ingestion.

PDF parsing → clause chunking → ``mbie_clauses`` persistence. The
verifier (``app.mbie.retriever``) queries the resulting table at vision
time; this package is concerned only with getting the data in.

- ``chunker``     — PDF → ``ClauseChunk`` list (native text layer).
- ``ocr``         — OCR fallback for glyph-obfuscated PDFs.
- ``extract``     — native-first extraction with OCR fallback + guard.
- ``persistence`` — replace-by-document_id writes.
"""

from app.ingestion.mbie.chunker import (
    ClauseChunk,
    chunk_page_texts,
    extract_clauses,
    page_texts_native,
)
from app.ingestion.mbie.extract import (
    extract_clauses_robust,
    has_substantial_text,
)
from app.ingestion.mbie.persistence import replace_clauses

__all__ = [
    "ClauseChunk",
    "chunk_page_texts",
    "extract_clauses",
    "extract_clauses_robust",
    "has_substantial_text",
    "page_texts_native",
    "replace_clauses",
]
