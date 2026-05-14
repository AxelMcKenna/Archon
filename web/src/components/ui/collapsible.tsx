import type { ReactNode } from "react";
import { ChevronIcon } from "./chevron";

type Variant = "card" | "raised";

const containerByVariant: Record<Variant, string> = {
  card: "group rounded-lg border border-ink-200 bg-surface-raised",
  raised: "group overflow-hidden rounded-md border border-ink-200 bg-surface-raised shadow-depth",
};

const triggerByVariant: Record<Variant, string> = {
  card: "flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left [&::-webkit-details-marker]:hidden",
  raised: "flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left hover:bg-ink-50/60 [&::-webkit-details-marker]:hidden",
};

const bodyByVariant: Record<Variant, string> = {
  card: "border-t border-ink-100 p-4",
  raised: "border-t border-ink-200/70 px-5 py-5",
};

export function Collapsible({
  title,
  badge,
  defaultOpen = false,
  variant = "card",
  children,
}: {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={containerByVariant[variant]}>
      <summary className={triggerByVariant[variant]}>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {badge}
        </div>
        <span className="text-ink-500 transition-transform group-open:rotate-180">
          <ChevronIcon direction="down" />
        </span>
      </summary>
      <div className={bodyByVariant[variant]}>{children}</div>
    </details>
  );
}
