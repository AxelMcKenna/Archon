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
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

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
        console.log("[agent] send →", { project_id: projectId, tab, route, conversation_id: conversationIdRef.current, message: text });
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
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId ? { ...t, content: t.content + evt.text } : t,
              ),
            );
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
            console.log("[agent] done event received");
            break;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[agent] stream error:", msg, e);
        if (!controller.signal.aborted) setError(msg);
      } finally {
        console.log("[agent] turn complete (pending → false)");
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
    setTurns([]);
    setError(null);
    setPending(false);
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
