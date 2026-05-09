import { Sparkles, Loader2 } from "lucide-react";

type Variant = "block" | "inline" | "button";

const sizeMap = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

export function AiThinking({
  label = "Thinking",
  hint,
  variant = "inline",
  className = "",
}: {
  label?: string;
  hint?: string;
  variant?: Variant;
  className?: string;
}) {
  if (variant === "button") {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <Loader2 className={`${sizeMap.sm} animate-spin`} />
        <span>{label}</span>
        <Dots />
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full bg-ink-900 text-white px-3 py-1 text-xs font-medium shadow-card ${className}`}
      >
        <Sparkles className={`${sizeMap.sm} text-tan-300 ai-glow`} />
        <span>{label}</span>
        <Dots />
      </span>
    );
  }

  // block
  return (
    <div
      className={`ai-shimmer relative overflow-hidden rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card p-5 ${className}`}
    >
      <div className="relative flex items-start gap-3.5">
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-ink-900 text-tan-300 shadow-card ring-1 ring-tan-300/20">
          <Sparkles className={`${sizeMap.md} ai-glow`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-ink-900 inline-flex items-center gap-1.5">
            {label}
            <Dots />
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {hint ?? "AI is working on this — usually a few seconds."}
          </p>
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

export function AiBadge({
  label = "AI",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-tan-100 text-tan-700 ring-1 ring-tan-300/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${className}`}
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}
