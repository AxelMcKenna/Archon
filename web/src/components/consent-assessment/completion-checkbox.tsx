"use client";

interface CompletionCheckboxProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  muted?: boolean;
}

export function CompletionCheckbox({
  checked,
  label,
  onChange,
  muted = false,
}: CompletionCheckboxProps) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-sm border px-3 py-2 text-sm ${
        muted
          ? "border-ink-700/10 bg-ink-50 text-ink-700"
          : "border-ink-700/10 bg-surface-raised text-ink-900"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-3.5 w-3.5 rounded-sm border-ink-300 text-accent focus:ring-2 focus:ring-accent/30"
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}
