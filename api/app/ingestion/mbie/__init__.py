"""MBIE Acceptable Solutions ingestion.

PDF parsing → clause chunking → ``mbie_clauses`` persistence. The
verifier (``app.mbie.retriever``) queries the resulting table at vision
time; this package is concerned only with getting the data in.

- ``chunker``     — PDF → ``ClauseChunk`` list.
- ``persistence`` — replace-by-document_id writes.
"""

from app.ingestion.mbie.chunker import ClauseChunk, extract_clauses
from app.ingestion.mbie.persistence import replace_clauses

__all__ = ["ClauseChunk", "extract_clauses", "replace_clauses"]
