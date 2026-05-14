"use client";

import { SPECIFIED_SYSTEM_OPTIONS } from "../constants";

export function SpecifiedSystemsInlineSection({
  noSpecifiedSystems,
  onNoSpecifiedSystemsChange,
  selectedCodes,
  onSelectedCodesChange,
}: {
  noSpecifiedSystems: boolean;
  onNoSpecifiedSystemsChange: (value: boolean) => void;
  selectedCodes: string[];
  onSelectedCodesChange: (value: string[]) => void;
}) {
  function handleToggleSystem(code: string, checked: boolean) {
    onSelectedCodesChange(
      checked ? Array.from(new Set([...selectedCodes, code])) : selectedCodes.filter((item) => item !== code),
    );
  }

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm text-ink-900">
        <input
          type="checkbox"
          checked={noSpecifiedSystems}
          onChange={(event) => {
            const checked = event.target.checked;
            onNoSpecifiedSystemsChange(checked);
            if (checked) onSelectedCodesChange([]);
          }}
        />
        There are no specified systems in the building
      </label>
      <div
        className={`rounded-sm border border-ink-100 p-3 ${
          noSpecifiedSystems ? "bg-slate-50 text-slate-500" : "bg-surface-raised text-ink-900"
        }`}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {SPECIFIED_SYSTEM_OPTIONS.map((option) => (
            <label key={option.code} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selectedCodes.includes(option.code)}
                disabled={noSpecifiedSystems}
                onChange={(event) => handleToggleSystem(option.code, event.target.checked)}
              />
              <span>
                <span className="font-semibold text-ink-900">{option.code}</span>
                <span className="text-ink-700">{" - "}{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
