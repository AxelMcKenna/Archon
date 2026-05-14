import type { ReactNode } from "react";

export function FormInlineSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <header>
        <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
        <p className="text-xs text-ink-600">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}
