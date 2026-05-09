"use client";

import { useMemo, useState } from "react";
import type { CccDocumentStatus } from "@/lib/ccc";

interface Props {
  requiredItems: CccDocumentStatus[];
  conditionalItems: CccDocumentStatus[];
  inspectionBlockers: string[];
}

export function CccValidationForm({ requiredItems, conditionalItems, inspectionBlockers }: Props) {
  const [applicable, setApplicable] = useState<Record<string, boolean>>({});
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => {
    const requiredErrors = requiredItems
      .filter((item) => item.status !== "complete")
      .map((item) => item.validationMessage);
    const conditionalErrors = conditionalItems
      .filter((item) => applicable[item.key] && item.status !== "complete")
      .map((item) => item.validationMessage);
    return [...inspectionBlockers, ...requiredErrors, ...conditionalErrors];
  }, [applicable, conditionalItems, inspectionBlockers, requiredItems]);

  const canSubmit = errors.length === 0;

  return (
    <section className="bg-surface-raised rounded-lg border border-ink-200 p-5">
      <h2 className="text-xl font-semibold">CCC Application Validation</h2>
      <p className="mt-2 text-sm text-ink-600">
        Required documents are mandatory. “If Applicable” items only become mandatory when selected.
      </p>

      <div className="mt-5 space-y-4">
        <h3 className="text-sm font-semibold">Required documents</h3>
        {requiredItems.map((item) => (
          <div key={item.key} className="rounded-md border border-ink-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{item.label}</p>
              <span className="rounded-full bg-red-100 text-red-800 text-xs px-2 py-0.5">Required</span>
            </div>
            <p className="mt-1 text-xs text-ink-600">{item.helperText}</p>
            <p className="mt-2 text-xs text-ink-500">
              Uploads found: {item.matchedDocuments.length} {item.supportsMultiple ? "(multiple allowed)" : ""}
            </p>
            {showErrors && item.status !== "complete" && (
              <p className="mt-1 text-xs text-red-700">{item.validationMessage}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        <h3 className="text-sm font-semibold">Conditionally required / if applicable documents</h3>
        {conditionalItems.map((item) => (
          <div key={item.key} className="rounded-md border border-ink-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(applicable[item.key])}
                  onChange={(event) =>
                    setApplicable((prev) => ({ ...prev, [item.key]: event.target.checked }))
                  }
                  className="mt-0.5"
                />
                <span>{item.label}</span>
              </label>
              <span className="rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-0.5">If Applicable</span>
            </div>
            <p className="mt-1 text-xs text-ink-600">{item.helperText}</p>
            <p className="mt-2 text-xs text-ink-500">
              Uploads found: {item.matchedDocuments.length} {item.supportsMultiple ? "(multiple allowed)" : ""}
            </p>
            {showErrors && applicable[item.key] && item.status !== "complete" && (
              <p className="mt-1 text-xs text-red-700">{item.validationMessage}</p>
            )}
          </div>
        ))}
      </div>

      {showErrors && errors.length > 0 && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-900">Cannot submit yet</p>
          <ul className="mt-2 text-xs text-red-800 space-y-1">
            {errors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowErrors(true)}
          className={`rounded-lg px-4 py-2 text-sm font-medium border ${
            canSubmit
              ? "bg-ink-900 text-white border-ink-900 hover:bg-ink-700"
              : "bg-ink-100 text-ink-600 border-ink-200"
          }`}
        >
          {canSubmit ? "Ready to Submit CCC Application" : "Resolve Missing Items to Submit"}
        </button>
      </div>
    </section>
  );
}
