"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { NeuralSphere } from "@/components/neural-sphere";
import { useAgentPanel, type ChatTurn, type ToolCallStatus } from "./agent-provider";
import { useTabContext } from "./tab-context";

function truncateResult(value: unknown, max = 240): string {
  if (value === undefined || value === null) return "";
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function ThinkingTrace({ turn, isPending }: { turn: ChatTurn; isPending: boolean }) {
  const hasSteps = turn.toolCalls.length > 0;
  const hasContent = turn.content.length > 0;
  // Once the answer is in, default to collapsed; while running, default open.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!isPending && hasContent) setOpen(false);
  }, [isPending, hasContent]);

  // No tools at all — render a slim inline indicator while pending, then nothing.
  // Avoids a box flashing in and out for pure-text answers.
  if (!hasSteps) {
    if (!isPending || hasContent) return null;
    return (
      <div className="mb-1 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Thinking…</span>
      </div>
    );
  }

  const stepCount = turn.toolCalls.length;
  const headerLabel = isPending
    ? hasSteps
      ? `Working through ${stepCount} step${stepCount === 1 ? "" : "s"}…`
      : "Thinking…"
    : `Thought process · ${stepCount} step${stepCount === 1 ? "" : "s"}`;

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-ink-900/10 bg-ink-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-ink-700 hover:bg-ink-100/60"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-500" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-ink-500" />
        )}
        <span className="flex-1">{headerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ol className="space-y-2 border-t border-ink-900/10 bg-white/60 px-3 py-2.5 text-[12px]">
          {turn.toolCalls.map((tc, i) => (
            <TraceStep key={tc.id} step={tc} index={i + 1} />
          ))}
          {isPending && !hasContent && (
            <li className="flex items-center gap-1.5 text-ink-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{hasSteps ? "Synthesizing answer…" : "Reasoning…"}</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function TraceStep({ step, index }: { step: ToolCallStatus; index: number }) {
  const Icon =
    step.state === "running" ? Loader2 : step.state === "error" ? AlertCircle : Check;
  const iconClass =
    step.state === "running"
      ? "h-3 w-3 animate-spin text-ink-500"
      : step.state === "error"
        ? "h-3 w-3 text-red-600"
        : "h-3 w-3 text-emerald-600";
  const label =
    step.state === "running"
      ? "Calling"
      : step.state === "error"
        ? "Failed"
        : "Returned";
  const preview =
    step.state === "done"
      ? truncateResult(step.result)
      : step.state === "error"
        ? step.error ?? "Unknown error"
        : "";
  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1.5 text-ink-700">
        <span className="font-mono text-[10px] text-ink-400">{index.toString().padStart(2, "0")}</span>
        <Icon className={iconClass} />
        <span className="text-ink-500">{label}</span>
        <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11px] text-ink-800">
          {step.name}
        </code>
      </div>
      {preview && (
        <pre
          className={`ml-7 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded px-2 py-1 font-mono text-[11px] ${
            step.state === "error" ? "bg-red-50 text-red-700" : "bg-white text-ink-600 border border-ink-900/[0.06]"
          }`}
        >
          {preview}
        </pre>
      )}
    </li>
  );
}

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
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-lg flex-col border-l border-ink-900/10 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <header className="flex items-center justify-between border-b border-ink-900/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[13px]">
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

        <div className="flex flex-col items-center px-6 pt-6 pb-4 text-center">
          <NeuralSphere
            intent="thinking"
            ariaLabel="Project Copilot"
            className="h-[260px] w-[260px]"
          />
          <p className="mt-3 max-w-[320px] text-[13px] leading-relaxed text-ink-600">
            {projectId
              ? `Ask about this ${tab ?? "project"}, or click any sphere in the workspace to start.`
              : "Open a project to start a conversation."}
          </p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-3 text-[13px]">
          <ul className="space-y-3">
            {turns.map((t, i) => {
              const isLast = i === turns.length - 1;
              const isPendingTurn = t.role === "assistant" && pending && isLast;
              return (
                <li key={t.id} className="space-y-1.5">
                  {t.role === "assistant" && (
                    <ThinkingTrace turn={t} isPending={isPendingTurn} />
                  )}
                  {(t.role === "user" || t.content) && (
                    <div
                      className={
                        t.role === "user"
                          ? "ml-auto max-w-[85%] rounded-lg bg-ink-900 px-3 py-2 text-white"
                          : "max-w-[95%] whitespace-pre-wrap text-ink-900"
                      }
                    >
                      {t.content}
                    </div>
                  )}
                </li>
              );
            })}
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
