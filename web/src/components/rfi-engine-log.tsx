import { Sparkles, Loader2, Check } from "lucide-react";
import type { IngestStep } from "@/lib/ingest-stream";

// Live log of the RFI engine's analyse pipeline, rendered from the SSE `step`
// events streamed by /plans/ingest-stream. Mirrors the agent chat's thinking
// trace: each phase appears as it happens, spinning while running, checked when
// done.
export function RfiEngineLog({
  steps,
  title = "RFI engine",
  hint,
  done = false,
}: {
  steps: IngestStep[];
  title?: string;
  hint?: string;
  done?: boolean;
}) {
  return (
    <div className="ai-shimmer relative overflow-hidden rounded-sm bg-surface-raised shadow-depth p-5">
      <div className="relative flex items-start gap-3.5">
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-900 text-cyan-500 shadow-depth ring-1 ring-brand-400/20">
          <Sparkles className="h-4 w-4 ai-glow" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-ink-900 inline-flex items-center gap-1.5">
            {title}
            {!done && <Dots />}
          </p>
          {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}

          <ol className="mt-3 space-y-1.5 max-h-64 overflow-auto pr-1">
            {steps.length === 0 && (
              <li className="flex items-center gap-2 text-xs text-ink-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Starting engine…</span>
              </li>
            )}
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-2 text-xs text-ink-800"
              >
                {step.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-500" />
                ) : (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                <span className="font-medium text-ink-900">{step.label}</span>
                {step.detail && (
                  <span className="text-ink-500 truncate">· {step.detail}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="ai-dots inline-flex" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
