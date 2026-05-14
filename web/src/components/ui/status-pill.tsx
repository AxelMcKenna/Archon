import type { ReactNode } from "react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const softBordered: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  danger: "bg-red-100 text-red-800 border-red-200",
};

const ring: Record<Tone, string> = {
  neutral: "bg-ink-50 text-ink-700 ring-ink-200/70",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusPill({
  tone,
  variant = "soft-bordered",
  className = "",
  children,
}: {
  tone: Tone;
  variant?: "soft-bordered" | "ring";
  className?: string;
  children: ReactNode;
}) {
  if (variant === "ring") {
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ring-1 ${ring[tone]} ${className}`}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${softBordered[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
