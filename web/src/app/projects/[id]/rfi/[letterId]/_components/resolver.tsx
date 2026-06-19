"use client";

import { useState } from "react";
import { taxonomy } from "@arro/shared";
import type { ReconLog } from "../types";

export function Resolver({
  recon,
  onResolve,
}: {
  recon: ReconLog;
  onResolve: (user_choice: string) => Promise<void>;
}) {
  const rules = recon.rules_output.primary_category;
  const ai = recon.ai_output.primary_category;
  const rulesLabel = taxonomy.categories.find((c) => c.id === rules)?.label;
  const aiLabel = taxonomy.categories.find((c) => c.id === ai)?.label;
  const [busy, setBusy] = useState(false);
  async function pick(choice: string) {
    setBusy(true);
    try {
      await onResolve(choice);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-sm bg-amber-50 border border-amber-200 px-3 py-2 text-xs space-y-2">
      <p className="font-medium">Pick the right category:</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {rules && (
          <button
            disabled={busy}
            onClick={() => pick(rules)}
            className="text-left rounded-sm border border-ink-700/20 bg-surface-raised px-2.5 py-2 hover:bg-ink-700/5 cursor-pointer disabled:opacity-50"
          >
            <div className="text-[10px] uppercase tracking-wide text-ink-500">
              Rules engine
            </div>
            <div className="font-medium">{rulesLabel ?? rules}</div>
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => pick(ai)}
          className="text-left rounded-sm border border-ink-700/20 bg-surface-raised px-2.5 py-2 hover:bg-ink-700/5 cursor-pointer disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-wide text-ink-500">AI</div>
          <div className="font-medium">{aiLabel ?? ai}</div>
        </button>
      </div>
    </div>
  );
}
