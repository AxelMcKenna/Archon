type Variant = "compact" | "raised" | "outlined";

const containerByVariant: Record<Variant, string> = {
  compact: "rounded-md border border-ink-100 px-3 py-2",
  raised: "rounded-md bg-surface-raised px-3.5 py-2.5 shadow-depth",
  outlined: "rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 shadow-sm",
};

const labelByVariant: Record<Variant, string> = {
  compact: "text-xs text-ink-500",
  raised: "text-[10px] uppercase tracking-[0.22em] text-ink-500",
  outlined: "text-xs font-medium uppercase tracking-[0.14em] text-ink-500",
};

const valueByVariant: Record<Variant, string> = {
  compact: "mt-1 text-sm font-medium text-ink-900",
  raised: "mt-1 text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-ink-900",
  outlined: "mt-2 text-2xl font-semibold tracking-tight text-ink-900",
};

export function MetricCard({
  label,
  value,
  variant = "raised",
}: {
  label: string;
  value: string;
  variant?: Variant;
}) {
  return (
    <div className={containerByVariant[variant]}>
      <p className={labelByVariant[variant]}>{label}</p>
      <p className={valueByVariant[variant]}>{value}</p>
    </div>
  );
}
