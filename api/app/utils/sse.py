"""Server-sent-events helper for streaming a blocking pipeline's progress.

The analyse pipelines are synchronous (they run in a worker thread via
``asyncio.to_thread``) and were never built to ``yield`` mid-flight. This helper
bridges a synchronous ``progress(event)`` callback — which the pipeline calls
from its own (and its nested per-sheet) worker threads — onto an asyncio queue
that the SSE generator drains, so each phase is flushed to the browser as it
happens.

Wire format matches the llm-gateway chat stream (``event:``/``data:`` frames,
``text/plain`` to dodge Safari's chunk-dropping on ``text/event-stream``), so
the frontend SSE parser is shared. ``X-Accel-Buffering: no`` disables nginx
response buffering on the VM so frames aren't held back until the end.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from starlette.responses import StreamingResponse

log = logging.getLogger(__name__)

ProgressFn = Callable[[dict[str, Any]], None]


def _frame(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


async def progress_sse_response(
    run: Callable[[ProgressFn], dict[str, Any]],
    *,
    error_label: str = "analysis failed",
) -> StreamingResponse:
    """Stream ``run(progress)`` as SSE.

    ``run`` executes in a worker thread and is handed a thread-safe ``progress``
    callback; every call emits a ``step`` frame. When ``run`` returns, its dict
    is sent as a single ``result`` frame; any exception becomes an ``error``
    frame (the raw message is never leaked to the client).
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

    def progress(event: dict[str, Any]) -> None:
        # Called from the pipeline's worker thread(s); hop back onto the loop.
        loop.call_soon_threadsafe(queue.put_nowait, ("step", event))

    def worker() -> None:
        try:
            result = run(progress)
            loop.call_soon_threadsafe(queue.put_nowait, ("result", result))
        except Exception:  # noqa: BLE001 — surface a generic error frame
            log.exception("sse pipeline failed")
            loop.call_soon_threadsafe(queue.put_nowait, ("error", {"error": error_label}))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    async def event_stream() -> AsyncIterator[str]:
        task = asyncio.create_task(asyncio.to_thread(worker))
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                event, data = item
                yield _frame(event, data)
        finally:
            await task

    return StreamingResponse(
        event_stream(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
