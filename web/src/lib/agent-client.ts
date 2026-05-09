export const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_URL ?? "";

// One-time visibility into env wiring. Prints once on first import in the browser.
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log(
    `[agent-client] AGENT_BASE=${AGENT_BASE || "(empty — NEXT_PUBLIC_AGENT_URL not set; restart next dev?)"}`,
  );
}

const DEBUG = typeof window !== "undefined" && (window as { __AGENT_DEBUG__?: boolean }).__AGENT_DEBUG__ !== false;
const dlog = (...args: unknown[]) => {
  if (DEBUG) console.log("[agent-client]", ...args);
};

export type AgentRole = "user" | "assistant";

export interface AgentRequest {
  project_id: string;
  tab: string | null;
  route: string | null;
  conversation_id: string | null;
  message: string;
}

export type AgentEvent =
  | { type: "conversation"; conversation_id: string }
  | { type: "token"; text: string }
  | { type: "tool_call_delta"; index: number; id: string; name: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; id: string; name: string; result: unknown }
  | { type: "tool_error"; id: string; name: string; error: string }
  | { type: "done" }
  | { type: "error"; error: string };

export async function resetConversation(conversationId: string): Promise<void> {
  if (!AGENT_BASE) return;
  await fetch(`${AGENT_BASE}/chat/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

/**
 * POSTs to the agent /chat endpoint and yields parsed SSE events.
 * Throws if `NEXT_PUBLIC_AGENT_URL` is unset or the service is unreachable —
 * callers should treat any throw as "agent unavailable" and degrade gracefully.
 */
export async function* streamAgent(
  body: AgentRequest,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  if (!AGENT_BASE) {
    throw new Error("agent service not configured");
  }
  dlog("POST /chat", { url: `${AGENT_BASE}/chat`, body });
  const res = await fetch(`${AGENT_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain" },
    body: JSON.stringify(body),
    signal,
  });
  dlog("response", { status: res.status, ok: res.ok, hasBody: !!res.body });
  if (!res.ok || !res.body) {
    throw new Error(`agent ${res.status}: ${await res.text().catch(() => "")}`);
  }

  // Keep a clone so we can fall back to .text() if streaming yields nothing (Safari quirk).
  const fallbackRes = res.clone();

  // Stream through TextDecoderStream — more reliable on Safari than raw getReader().
  const stream = res.body.pipeThrough(new TextDecoderStream());
  const reader = stream.getReader();
  let buffer = "";
  let frameCount = 0;

  const drain = function* (): Generator<AgentEvent> {
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const event = parseSseFrame(raw);
      if (event) {
        frameCount++;
        dlog("event", event);
        yield event;
      } else {
        dlog("unparsed frame", raw);
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      yield* drain();
    }
  } finally {
    dlog(`stream closed: totalFrames=${frameCount} leftoverBufferLen=${buffer.length}`);
  }

  // Safari fallback: streaming yielded nothing. Read the cloned body as full text.
  if (frameCount === 0) {
    dlog("streaming yielded zero frames — falling back to clone.text()");
    const text = await fallbackRes.text().catch((e) => {
      dlog("fallback text() failed", e);
      return "";
    });
    dlog(`fallback body: length=${text.length} preview=${JSON.stringify(text.slice(0, 300))}`);
    buffer = text;
    yield* drain();
    if (buffer.trim()) {
      const tail = parseSseFrame(buffer);
      if (tail) yield tail;
    }
  }
}

function parseSseFrame(raw: string): AgentEvent | null {
  let eventName: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!eventName) return null;
  const dataStr = dataLines.join("\n");
  let payload: Record<string, unknown> = {};
  try {
    payload = dataStr ? JSON.parse(dataStr) : {};
  } catch {
    return null;
  }
  return { type: eventName, ...payload } as AgentEvent;
}
