// Streaming client for the RFI engine's analyse endpoints (/plans/ingest-stream,
// /cad/ingest-stream). The backend streams server-sent-event frames as the
// pipeline runs each phase; this reads them incrementally so the UI can render
// a live engine log instead of a spinner.
//
// Wire format and parsing mirror the agent chat (`agent-client.ts`): `event:` /
// `data:` frames separated by a blank line, sent as text/plain so Safari's
// fetch() doesn't drop chunks.

import { API_BASE } from "@/lib/api";

export interface IngestStep {
  id: number;
  label: string;
  status: "running" | "done";
  detail?: string | null;
}

export interface IngestResult {
  plan_id?: string;
  cad_id?: string;
  flags_count: number;
  processing_ms: number;
  cost_usd?: number;
  cached?: boolean;
  verification?: string;
  entity_count?: number;
}

export type IngestEvent =
  | ({ type: "step" } & IngestStep)
  | ({ type: "result" } & IngestResult)
  | { type: "error"; error: string };

/**
 * POSTs to an ingest-stream endpoint and yields parsed SSE events. Throws if the
 * connection itself fails before any frame — callers can catch that and fall
 * back to the non-streaming /ingest endpoint.
 */
export async function* streamIngest(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<IngestEvent> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`RFI engine unavailable (error ${res.status})`);
  }

  const fallbackRes = res.clone();
  const stream = res.body.pipeThrough(new TextDecoderStream());
  const reader = stream.getReader();
  let buffer = "";
  let frameCount = 0;

  const drain = function* (): Generator<IngestEvent> {
    while (true) {
      const lf = buffer.indexOf("\n\n");
      const crlf = buffer.indexOf("\r\n\r\n");
      let cut = -1;
      let advance = 0;
      if (crlf !== -1 && (lf === -1 || crlf < lf)) {
        cut = crlf;
        advance = 4;
      } else if (lf !== -1) {
        cut = lf;
        advance = 2;
      }
      if (cut === -1) break;
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + advance);
      const event = parseFrame(raw);
      if (event) {
        frameCount++;
        yield event;
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
    reader.releaseLock?.();
  }

  // Safari fallback: streaming yielded nothing — read the cloned body in full.
  if (frameCount === 0) {
    const text = await fallbackRes.text().catch(() => "");
    buffer = text;
    yield* drain();
    if (buffer.trim()) {
      const tail = parseFrame(buffer);
      if (tail) yield tail;
    }
  }
}

function parseFrame(raw: string): IngestEvent | null {
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
  return { type: eventName, ...payload } as IngestEvent;
}
