"""POST /chat — server-sent events stream for the agent loop."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.agent_loop import run_agent
from app.conversations import STORE
from app.rate_limit import limiter

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    project_id: str = Field(..., description="UUID of the project the user is viewing.")
    tab: str | None = Field(None, description="Active tab slug.")
    route: str | None = Field(None, description="Full pathname for context.")
    # Client passes the same id for follow-up turns so the server can load
    # prior tool calls/results from history. Omit/empty → new conversation.
    conversation_id: str | None = Field(None, description="Conversation id to extend.")
    # The latest user message. Prior turns are loaded from the server-side
    # store keyed by conversation_id; the client is no longer the source of
    # truth for history (it never saw the tool messages anyway).
    message: str | None = Field(None, description="Latest user message.")
    # Backward-compat: full messages list. If provided and conversation_id is
    # absent, the last user message is taken as the new turn and any prior
    # entries are seeded as history.
    messages: list[ChatMessage] | None = None


@router.post("")
@limiter.limit("20/minute")
async def chat(request: Request, req: ChatRequest) -> EventSourceResponse:
    conversation_id = req.conversation_id or str(uuid.uuid4())
    history: list[dict[str, Any]] = STORE.get(conversation_id)

    # Resolve the new user message.
    user_text: str | None = req.message
    if user_text is None and req.messages:
        # Backward-compat path: last role=user wins; everything before is
        # only used to seed history when there's no stored conversation yet.
        if not history:
            for m in req.messages[:-1]:
                history.append({"role": m.role, "content": m.content})
        last = req.messages[-1]
        if last.role != "user":
            return _error_response("last message must be role=user")
        user_text = last.content
    if not user_text:
        return _error_response("message is required")

    history.append({"role": "user", "content": user_text})

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        # Always send the conversation_id first so the client can store it.
        yield {
            "event": "conversation",
            "data": json.dumps({"conversation_id": conversation_id}),
        }
        try:
            async for event in run_agent(
                history=history,
                project_id=req.project_id,
                tab=req.tab,
                route=req.route,
            ):
                etype = event.pop("type")
                yield {"event": etype, "data": json.dumps(event, default=str)}
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"error": f"{type(exc).__name__}: {exc}"}),
            }
        finally:
            STORE.put(conversation_id, history)

    return EventSourceResponse(event_stream())


@router.delete("/{conversation_id}")
async def reset(conversation_id: str) -> dict[str, str]:
    STORE.clear(conversation_id)
    return {"status": "cleared", "conversation_id": conversation_id}


def _error_response(msg: str) -> EventSourceResponse:
    async def gen() -> AsyncIterator[dict[str, str]]:
        yield {"event": "error", "data": json.dumps({"error": msg})}

    return EventSourceResponse(gen())
