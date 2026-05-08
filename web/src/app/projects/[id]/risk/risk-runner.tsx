"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { taxonomy } from "@consentiq/shared";

type RiskItem = {
  corpus_id: string;
  category: string;
  severity: string;
  example_text: string;
  trigger_description: string | null;
  resolution_hint: string | null;
  score: number;
  reasons: string[];
};

type RiskResult = {
  score: number;
  band: "low" | "medium" | "high";
  bca: string;
  project_type: string;
  items: RiskItem[];
};

const BAND_STYLE: Record<RiskResult["band"], string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-red-100 text-red-800 border-red-200",
};

export function RiskRunner({
  bca,
  projectType,
  defaultDescription,
}: {
  bca: string;
  projectType: string;
  defaultDescription: string;
}) {
  const [description, setDescription] = useState(defaultDescription);
  const [addressed, setAddressed] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RiskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<RiskResult>("/risk/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bca,
          project_type: projectType,
          description,
          addressed_corpus_ids: [...addressed],
        }),
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Risk check failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleAddressed(id: string) {
    setAddressed((curr) => {
      const next = new Set(curr);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-ink-700/10 p-5 space-y-3">
        <label className="block text-sm font-medium">Project description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="e.g. Two-storey new dwelling, steel beam over garage, direct-fixed weatherboard cladding, retaining wall to south boundary 1.8m high…"
          className="w-full rounded border border-ink-700/15 px-3 py-2 text-sm leading-relaxed"
        />
        <button
          onClick={run}
          disabled={busy || !description.trim()}
          className="rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Scoring…" : result ? "Re-run with addressed items" : "Run risk check"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          <div className={`rounded-lg border px-5 py-4 ${BAND_STYLE[result.band]}`}>
            <p className="text-sm">Risk band</p>
            <p className="text-3xl font-semibold capitalize">{result.band}</p>
            <p className="text-xs mt-1 opacity-80">aggregate score {result.score}</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              Likely RFI items ({result.items.length})
            </h2>
            {result.items.map((item) => {
              const cat = taxonomy.categories.find((c) => c.id === item.category);
              const isAddressed = addressed.has(item.corpus_id);
              return (
                <div
                  key={item.corpus_id}
                  className={`rounded-lg border p-4 ${isAddressed ? "border-emerald-300 bg-emerald-50" : "border-ink-700/10"}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-mono text-xs text-ink-500">{item.category}</p>
                      <p className="text-sm font-medium">{cat?.label}</p>
                    </div>
                    <label className="text-xs flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAddressed}
                        onChange={() => toggleAddressed(item.corpus_id)}
                      />
                      Addressed
                    </label>
                  </div>
                  <p className="text-sm">{item.example_text}</p>
                  {item.trigger_description && (
                    <p className="text-xs text-ink-500 mt-2">
                      <span className="font-medium">Trigger:</span> {item.trigger_description}
                    </p>
                  )}
                  {item.resolution_hint && (
                    <p className="text-xs text-ink-500 mt-1">
                      <span className="font-medium">Resolution:</span> {item.resolution_hint}
                    </p>
                  )}
                  <p className="text-xs text-ink-500 mt-2">
                    Reasons: {item.reasons.join(" · ")}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
