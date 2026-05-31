"""In-memory conversation store keyed by conversation_id.

Stores the full message list — including assistant turns with tool_calls
and ``role: tool`` results — so the model has its prior tool outputs in
context on follow-up turns instead of being forced to re-fetch.

Single-process only. Phase 3 will move this to Supabase.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from threading import Lock
from typing import Any

# Cap so a long-running process doesn't grow unbounded. LRU eviction.
MAX_CONVERSATIONS = 1000
TTL_SECONDS = 60 * 60 * 6  # 6h


class _Store:
    def __init__(self) -> None:
        self._data: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = Lock()

    def get(self, conversation_id: str) -> list[dict[str, Any]]:
        with self._lock:
            entry = self._data.get(conversation_id)
            if entry is None:
                return []
            if time.time() - entry["touched"] > TTL_SECONDS:
                del self._data[conversation_id]
                return []
            self._data.move_to_end(conversation_id)
            return list(entry["messages"])

    def put(self, conversation_id: str, messages: list[dict[str, Any]]) -> None:
        with self._lock:
            self._data[conversation_id] = {
                "messages": list(messages),
                "touched": time.time(),
            }
            self._data.move_to_end(conversation_id)
            while len(self._data) > MAX_CONVERSATIONS:
                self._data.popitem(last=False)

    def clear(self, conversation_id: str) -> None:
        with self._lock:
            self._data.pop(conversation_id, None)


STORE = _Store()
