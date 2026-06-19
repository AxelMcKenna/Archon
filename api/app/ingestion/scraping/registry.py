"""Source registry — loads sources.yaml into structured records.

Single source of truth for *where* the ingestion layer fetches from.
The registry just answers "give me the URL list for source_kind X" —
extractors live under ``app.ingestion.extractors``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

SOURCES_FILE = Path(__file__).resolve().parent / "sources.yaml"

DEFAULT_USER_AGENT = "Arro-VE-Ingest/0.1"


@dataclass
class SourceDoc:
    source_key: str
    url: str
    content_type: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class SourceKindConfig:
    kind: str
    rate_limit_seconds: float
    user_agent: str
    documents: list[SourceDoc]


def _parse_kind(kind: str, block: dict[str, Any]) -> SourceKindConfig:
    docs_raw = block.get("documents") or []
    documents: list[SourceDoc] = []
    for d in docs_raw:
        key = d.get("source_key")
        url = d.get("url")
        if not key or not url:
            raise ValueError(
                f"source {kind!r} has a document missing source_key or url: {d!r}"
            )
        extra = {k: v for k, v in d.items() if k not in {"source_key", "url", "content_type"}}
        documents.append(
            SourceDoc(
                source_key=key,
                url=url,
                content_type=d.get("content_type"),
                extra=extra,
            )
        )
    return SourceKindConfig(
        kind=kind,
        rate_limit_seconds=float(block.get("rate_limit_seconds", 2.0)),
        user_agent=str(block.get("user_agent") or DEFAULT_USER_AGENT),
        documents=documents,
    )


@lru_cache
def load_registry() -> dict[str, SourceKindConfig]:
    raw = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8")) or {}
    return {kind: _parse_kind(kind, block or {}) for kind, block in raw.items()}


def get_kind(kind: str) -> SourceKindConfig:
    reg = load_registry()
    if kind not in reg:
        raise KeyError(
            f"unknown source kind {kind!r}; known: {sorted(reg.keys())}"
        )
    return reg[kind]


def known_kinds() -> list[str]:
    return sorted(load_registry().keys())
