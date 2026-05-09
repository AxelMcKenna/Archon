export const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_URL ?? "";

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
  const res = await fetch(`${AGENT_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`agent ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const event = parseSseFrame(raw);
      if (event) yield event;
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
