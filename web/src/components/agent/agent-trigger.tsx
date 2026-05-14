"use client";

import { useEffect, useRef, useState } from "react";
import { NeuralSphere, type SphereSize } from "@/components/neural-sphere";
import { loadTabSummary, type TabSlug, type TabSummary } from "@/lib/tab-summaries";
import { useAgentPanel } from "./agent-provider";
import { TAB_AGENT_CONFIG } from "./tab-config";

interface AgentTriggerProps {
  tab: TabSlug;
  projectId: string;
  size?: SphereSize;
  /** Override the tab default opener for one-off contexts. */
  defaultOpener?: string;
  /** Append extra suggestion chips. */
  extraSuggestions?: string[];
}

export function AgentTrigger({
  tab,
  projectId,
  size = "md",
  defaultOpener,
  extraSuggestions,
}: AgentTriggerProps) {
  const { available, open, pending } = useAgentPanel();
  const [summary, setSummary] = useState<TabSummary>({ intent: "calm" });
  const [hover, setHover] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Load tab-specific summary so the sphere can show intent + badge.
  useEffect(() => {
    if (!projectId || !available) return;
    let cancelled = false;
    void loadTabSummary(tab, projectId).then((s) => {
      if (!cancelled) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, projectId, available]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!available) return null;

  const cfg = TAB_AGENT_CONFIG[tab];
  const opener = defaultOpener ?? cfg.defaultOpener;
  const suggestions = [...cfg.suggestions, ...(extraSuggestions ?? [])];
  // Streaming overrides everything else.
  const intent = pending ? "thinking" : summary.intent;

  const onEnter = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setHover(true);
  };
  const onLeave = () => {
    closeTimerRef.current = window.setTimeout(() => setHover(false), 180);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <NeuralSphere
        size={size}
        intent={intent}
        badge={summary.badge}
        ariaLabel={`Open the assistant`}
        onClick={() => open()}
      />

      {/* Hover popover with suggestion chips */}
      <div
        className={`absolute right-0 top-[calc(100%+8px)] z-30 w-72 origin-top-right rounded-xl border border-ink-900/[0.08] bg-white p-3 shadow-2xl transition-all duration-150 ${
          hover ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        {summary.headline && (
          <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
            {summary.headline}
          </div>
        )}
        <button
          type="button"
          onClick={() => open(opener)}
          className="mb-2 w-full rounded-lg bg-ink-900 px-3 py-2 text-left text-[12.5px] text-white transition hover:bg-ink-800"
        >
          {opener}
        </button>
        {suggestions.length > 0 && (
          <ul className="space-y-1">
            {suggestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => open(q)}
                  className="w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink-700 transition hover:bg-ink-100"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
