"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, Wrench, X } from "lucide-react";
import { NeuralSphere } from "@/components/neural-sphere";
import { useAgentPanel } from "./agent-provider";
import { useTabContext } from "./tab-context";

export function AgentPanel() {
  const { isOpen, close, turns, pending, error, send, reset } = useAgentPanel();
  const { projectId, tab } = useTabContext();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Autoscroll on new content.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, pending]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await send(text);
  };

  return (
    <>
      {/* Backdrop — fades in/out */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-40 bg-ink-900/10 backdrop-blur-[1px] transition-opacity duration-200 ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Panel — slides in/out */}
      <aside
        role="dialog"
        aria-label="Project assistant"
        aria-hidden={!isOpen}
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-ink-900/10 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <header className="flex items-center justify-between border-b border-ink-900/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5 text-[13px]">
            <NeuralSphere size="sm" intent={pending ? "thinking" : "calm"} />
            <span className="font-semibold text-ink-900">Project Copilot</span>
            {tab && (
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                {tab}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={reset}
              aria-label="Clear conversation"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close assistant"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 text-[13px]">
          {turns.length === 0 && (
            <div className="rounded-lg bg-ink-50 p-3 text-ink-600">
              {projectId
                ? `Click any sphere to start, or ask about this ${tab ?? "project"} directly.`
                : "Open a project to start a conversation."}
            </div>
          )}
          <ul className="space-y-3">
            {turns.map((t) => (
              <li key={t.id} className="space-y-1.5">
                <div
                  className={
                    t.role === "user"
                      ? "ml-auto max-w-[85%] rounded-lg bg-ink-900 px-3 py-2 text-white"
                      : "max-w-[95%] whitespace-pre-wrap text-ink-900"
                  }
                >
                  {t.content || (t.role === "assistant" && pending ? (
                    <span className="inline-flex items-center gap-1 text-ink-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
                    </span>
                  ) : null)}
                </div>
                {t.toolCalls.length > 0 && (
                  <ul className="ml-1 flex flex-wrap gap-1">
                    {t.toolCalls.map((tc) => (
                      <li
                        key={tc.id}
                        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] ${
                          tc.state === "error"
                            ? "bg-red-50 text-red-700"
                            : "bg-ink-100 text-ink-700"
                        }`}
                      >
                        {tc.state === "running" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        <span>{tc.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-end gap-2 border-t border-ink-900/[0.06] p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={projectId ? "Ask about this tab…" : "Open a project first"}
            rows={2}
            disabled={!projectId || pending}
            className="flex-1 resize-none rounded-md border border-ink-900/10 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-500 disabled:bg-ink-50"
          />
          <button
            type="submit"
            disabled={!projectId || pending || !input.trim()}
            aria-label="Send"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 text-white transition hover:bg-ink-800 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </aside>
    </>
  );
}
