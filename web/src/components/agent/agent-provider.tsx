"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resetConversation, streamAgent, AGENT_BASE } from "@/lib/agent-client";
import { useTabContext } from "./tab-context";

export interface ToolCallStatus {
  id: string;
  name: string;
  state: "running" | "done" | "error";
  result?: unknown;
  error?: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCallStatus[];
}

interface AgentContextValue {
  // Panel state
  isOpen: boolean;
  open: (initialMessage?: string) => void;
  close: () => void;
  available: boolean;
  // Conversation state
  turns: ChatTurn[];
  pending: boolean;
  /** True while the typewriter still has buffered chars to drip out, even if
   *  the underlying SSE stream has finished. Use to show a trailing cursor. */
  streaming: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const { projectId, tab, route } = useTabContext();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingInitial, setPendingInitial] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  // Typewriter throttle: token events arrive in big chunks, so we buffer them
  // per-turn and drip characters out non-linearly to feel like an LLM thinking
  // out loud — variable burst sizes, plus pauses at punctuation/line breaks.
  const tokenBufferRef = useRef<Map<string, string>>(new Map());
  const pauseUntilRef = useRef<Map<string, number>>(new Map());
  const typewriterRafRef = useRef<number | null>(null);

  const ensureTypewriter = useCallback(() => {
    if (typewriterRafRef.current !== null) return;
    setStreaming(true);
    const tick = () => {
      const now = performance.now();
      let anyLeft = false;
      const updates: Array<[string, string]> = [];
      for (const [id, queued] of tokenBufferRef.current) {
        if (!queued) continue;
        const pauseUntil = pauseUntilRef.current.get(id) ?? 0;
        if (pauseUntil > now) {
          anyLeft = true;
          continue;
        }
        // Burst size: most frames emit 1–3 chars; ~12% of frames burst out a
        // word-sized chunk; ~3% emit a tiny single-char "hesitation".
        const r = Math.random();
        const burst =
          r < 0.03
            ? 1
            : r < 0.85
              ? 1 + Math.floor(Math.random() * 3)
              : 5 + Math.floor(Math.random() * 9);
        const take = queued.slice(0, burst);
        const rest = queued.slice(burst);
        tokenBufferRef.current.set(id, rest);
        updates.push([id, take]);

        // Schedule a pause if we just emitted a natural breakpoint.
        const last = take[take.length - 1] ?? "";
        let wait = 0;
        if (/[.!?]/.test(last)) wait = 160 + Math.random() * 200;
        else if (last === "\n") wait = 120 + Math.random() * 220;
        else if (/[,;:]/.test(last)) wait = 60 + Math.random() * 90;
        else if (Math.random() < 0.04) wait = 70 + Math.random() * 140;
        if (wait > 0) pauseUntilRef.current.set(id, now + wait);

        if (rest.length > 0) anyLeft = true;
      }
      if (updates.length > 0) {
        setTurns((prev) =>
          prev.map((t) => {
            const u = updates.find(([id]) => id === t.id);
            return u ? { ...t, content: t.content + u[1] } : t;
          }),
        );
      }
      if (anyLeft) {
        typewriterRafRef.current = requestAnimationFrame(tick);
      } else {
        typewriterRafRef.current = null;
        setStreaming(false);
      }
    };
    typewriterRafRef.current = requestAnimationFrame(tick);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || pending) return;
      if (!projectId) {
        setError("Open a project to use the assistant.");
        return;
      }
      setError(null);

      const userTurn: ChatTurn = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        toolCalls: [],
      };
      const assistantId = crypto.randomUUID();
      const assistantTurn: ChatTurn = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
      };
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        console.log("[llm-gateway] send →", { project_id: projectId, tab, route, conversation_id: conversationIdRef.current, message: text });
        for await (const evt of streamAgent(
          {
            project_id: projectId,
            tab,
            route,
            conversation_id: conversationIdRef.current,
            message: text,
          },
          controller.signal,
        )) {
          if (evt.type === "conversation") {
            conversationIdRef.current = evt.conversation_id;
          } else if (evt.type === "token") {
            const cur = tokenBufferRef.current.get(assistantId) ?? "";
            tokenBufferRef.current.set(assistantId, cur + evt.text);
            ensureTypewriter();
          } else if (evt.type === "tool_call") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? {
                      ...t,
                      toolCalls: [
                        ...t.toolCalls,
                        { id: evt.id, name: evt.name, state: "running" },
                      ],
                    }
                  : t,
              ),
            );
          } else if (evt.type === "tool_result") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? {
                      ...t,
                      toolCalls: t.toolCalls.map((tc) =>
                        tc.id === evt.id
                          ? { ...tc, state: "done", result: evt.result }
                          : tc,
                      ),
                    }
                  : t,
              ),
            );
          } else if (evt.type === "tool_error") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId
                  ? {
                      ...t,
                      toolCalls: t.toolCalls.map((tc) =>
                        tc.id === evt.id
                          ? { ...tc, state: "error", error: evt.error }
                          : tc,
                      ),
                    }
                  : t,
              ),
            );
          } else if (evt.type === "error") {
            setError(evt.error);
          } else if (evt.type === "done") {
            console.log("[llm-gateway] done event received");
            break;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[llm-gateway] stream error:", msg, e);
        if (!controller.signal.aborted) setError(msg);
      } finally {
        console.log("[llm-gateway] turn complete (pending → false)");
        setPending(false);
        abortRef.current = null;
      }
    },
    [pending, projectId, tab, route],
  );

  const open = useCallback((initialMessage?: string) => {
    setIsOpen(true);
    if (initialMessage) setPendingInitial(initialMessage);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    const id = conversationIdRef.current;
    conversationIdRef.current = null;
    if (id) void resetConversation(id);
    tokenBufferRef.current.clear();
    pauseUntilRef.current.clear();
    if (typewriterRafRef.current !== null) {
      cancelAnimationFrame(typewriterRafRef.current);
      typewriterRafRef.current = null;
    }
    setTurns([]);
    setError(null);
    setPending(false);
    setStreaming(false);
  }, []);

  // Auto-send any queued initial message once the panel is open and idle.
  useEffect(() => {
    if (isOpen && pendingInitial && !pending) {
      const msg = pendingInitial;
      setPendingInitial(null);
      void send(msg);
    }
  }, [isOpen, pendingInitial, pending, send]);

  return (
    <Ctx.Provider
      value={{
        isOpen,
        open,
        close,
        available: !!AGENT_BASE,
        turns,
        pending,
        streaming,
        error,
        send,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAgentPanel(): AgentContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAgentPanel must be used inside <AgentProvider>");
  return v;
}
