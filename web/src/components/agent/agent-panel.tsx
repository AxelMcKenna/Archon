"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NeuralSphere } from "@/components/neural-sphere";
import { useAgentPanel, type ChatTurn, type ToolCallStatus } from "./agent-provider";
import { useTabContext } from "./tab-context";

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-1 mt-3 text-[14px] font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-1 mt-3 text-[13px] font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-3 text-[13px] font-semibold first:mt-0">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded-sm bg-ink-100 px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-auto rounded-sm bg-ink-900 px-2 py-1.5 font-mono text-[12px] text-white last:mb-0">{children}</pre>
  ),
  hr: () => <hr className="my-3 border-ink-900/10" />,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
      {children}
    </a>
  ),
};

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
    ? `Working · ${stepCount} step${stepCount === 1 ? "" : "s"}`
    : `Thought process · ${stepCount} step${stepCount === 1 ? "" : "s"}`;

  return (
    <div className="overflow-hidden rounded-md border border-ink-900/[0.08] bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-ink-900/[0.03]"
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin text-ink-600" />
        ) : (
          <Sparkles className="h-3 w-3 text-ink-600" />
        )}
        <span className="flex-1 text-[10px] uppercase tracking-[0.16em] text-ink-700">
          {headerLabel}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-ink-600 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ol className="space-y-2 border-t border-ink-900/[0.06] px-3 py-3 text-[12px]">
          {turn.toolCalls.map((tc, i) => (
            <TraceStep key={tc.id} step={tc} index={i + 1} />
          ))}
          {isPending && !hasContent && (
            <li className="flex items-center gap-1.5 text-ink-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{hasSteps ? "Synthesising answer…" : "Reasoning…"}</span>
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
      <div className="flex items-center gap-2 text-ink-800">
        <span className="font-mono text-[10px] tabular-nums text-ink-500">
          {index.toString().padStart(2, "0")}
        </span>
        <Icon className={iconClass} />
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-600">{label}</span>
        <code className="font-mono text-[11px] text-ink-900">{step.name}</code>
      </div>
      {preview && (
        <pre
          className={`ml-[1.85rem] max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-sm border px-2 py-1.5 font-mono text-[11px] leading-snug ${
            step.state === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-ink-900/[0.08] bg-white text-ink-800"
          }`}
        >
          {preview}
        </pre>
      )}
    </li>
  );
}

export function AgentPanel() {
  const { isOpen, close, turns, pending, streaming, error, send, reset } = useAgentPanel();
  const { projectId, tab } = useTabContext();
  const [input, setInput] = useState("");
  const [excite, setExcite] = useState(0);
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
    setExcite((n) => n + 1);
    await send(text);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-40 bg-ink-900/10 backdrop-blur-[1px] transition-opacity duration-200 ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Project assistant"
        aria-hidden={!isOpen}
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-lg flex-col border-l border-ink-900/10 bg-surface-canvas shadow-depth-hover transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <header className="flex items-center justify-between border-b border-ink-900/[0.06] px-5 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-900">
              Copilot
            </span>
            {tab && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-600">
                {tab}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={reset}
              aria-label="Clear conversation"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-600 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close assistant"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-600 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex flex-col items-center px-6 pt-8 pb-5 text-center">
          <NeuralSphere
            intent="thinking"
            ariaLabel="Project Copilot"
            excite={excite}
            sustain={pending}
            compact
            className="h-[240px] w-[240px]"
          />
          <p className="mt-2 max-w-[300px] text-[12.5px] leading-relaxed text-ink-700">
            {projectId
              ? `Ask about this ${tab ?? "project"}, or click any sphere in the workspace to start.`
              : "Open a project to start a conversation."}
          </p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4 text-[13px]">
          <ul className="space-y-4">
            {turns.map((t, i) => {
              const isLast = i === turns.length - 1;
              const isPendingTurn = t.role === "assistant" && pending && isLast;
              return (
                <li key={t.id} className="space-y-2">
                  {t.role === "assistant" && (
                    <ThinkingTrace turn={t} isPending={isPendingTurn} />
                  )}
                  {(t.role === "user" || t.content) && (
                    <div
                      className={
                        t.role === "user"
                          ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-md bg-ink-900 px-3 py-2 text-[13px] text-white shadow-depth"
                          : "max-w-[95%] text-[13px] text-ink-900"
                      }
                    >
                      {t.role === "assistant" ? (
                        <>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {t.content}
                          </ReactMarkdown>
                          {isLast && (pending || streaming) && (
                            <span
                              className="ml-0.5 inline-flex translate-y-[-2px] items-center text-ink-400"
                              aria-hidden
                            >
                              <span className="follow-dot" />
                              <span className="follow-dot" />
                              <span className="follow-dot" />
                            </span>
                          )}
                        </>
                      ) : (
                        t.content
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-end gap-2 border-t border-ink-900/[0.06] bg-surface-raised px-4 py-3"
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
            className="flex-1 resize-none rounded-md border border-ink-900/15 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink-900 placeholder:text-ink-500 outline-none transition-colors focus:border-ink-900/40 disabled:bg-ink-50 disabled:text-ink-500"
          />
          <button
            type="submit"
            disabled={!projectId || pending || !input.trim()}
            aria-label="Send"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 text-white shadow-depth transition hover:bg-ink-800 hover:shadow-depth-hover disabled:opacity-40 disabled:shadow-none"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </form>
      </aside>
    </>
  );
}
