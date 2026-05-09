"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const BAND_IMPACT: Record<RiskResult["band"], string> = {
  low: "Low means the current description does not strongly match common council RFI patterns. You still need complete plans and supporting documents, but fewer surprises are expected if the package is coherent.",
  medium:
    "Medium means several known RFI patterns are present. Expect clarification requests unless drawings, specifications, and producer statements explicitly cover those areas before lodgement.",
  high: "High means the project description strongly overlaps with high-friction RFI patterns seen in similar submissions. Treat this as a pre-lodgement warning to close evidence gaps now to avoid clock stops and rework.",
};

export function RiskRunner({
  bca,
  projectType,
  defaultDescription,
  autoRun = false,
}: {
  bca: string;
  projectType: string;
  defaultDescription: string;
  autoRun?: boolean;
}) {
  const [description, setDescription] = useState(defaultDescription);
  const [addressed, setAddressed] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RiskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRunTriggeredRef = useRef(false);

  const run = useCallback(async () => {
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
  }, [addressed, bca, description, projectType]);

  useEffect(() => {
    if (!autoRun || autoRunTriggeredRef.current) return;
    autoRunTriggeredRef.current = true;
    void run();
  }, [autoRun, run]);

  function toggleAddressed(id: string) {
    setAddressed((curr) => {
      const next = new Set(curr);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const topSignals = useMemo(() => {
    if (!result) return [];
    return result.items.slice(0, 3).map((item) => {
      const category = taxonomy.categories.find((c) => c.id === item.category);
      return {
        id: item.corpus_id,
        categoryLabel: category?.label ?? item.category,
        reasons: item.reasons,
      };
    });
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-ink-700/10 p-5 space-y-3">
        <label className="block text-sm font-medium">Project description used for risk scoring</label>
        <p className="text-xs text-ink-500">
          This score is generated from historical RFI corpus patterns for the selected BCA and
          project type. It is a pre-lodgement triage signal, not a compliance decision.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="e.g. Two-storey new dwelling, steel beam over garage, direct-fixed weatherboard cladding, retaining wall to south boundary 1.8m high..."
          className="w-full rounded border border-ink-700/15 px-3 py-2 text-sm leading-relaxed"
        />
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Scoring..." : result ? "Re-run with updated context" : "Run risk check"}
        </button>
        {!description.trim() && (
          <p className="text-xs text-amber-700">
            Description is empty, so the score is based on minimal context and may understate risk.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          <div className={`rounded-lg border px-5 py-4 ${BAND_STYLE[result.band]}`}>
            <p className="text-sm">Risk band</p>
            <p className="text-3xl font-semibold capitalize">{result.band}</p>
            <p className="text-xs mt-1 opacity-80">aggregate score {result.score}</p>
            <p className="text-xs mt-1 opacity-80">
              Bands: low &lt; 0.30, medium 0.30-0.64, high &gt;= 0.65
            </p>
          </div>

          <div className="rounded-lg border border-ink-700/10 p-5 space-y-3">
            <h2 className="text-lg font-semibold">Why this project was flagged</h2>
            {!topSignals.length ? (
              <p className="text-sm text-ink-600">
                No strong historical pattern matches were found in the current description.
              </p>
            ) : (
              <ul className="space-y-2">
                {topSignals.map((signal) => (
                  <li key={signal.id} className="text-sm text-ink-700">
                    <span className="font-medium">{signal.categoryLabel}:</span>{" "}
                    {signal.reasons.length
                      ? signal.reasons.join(", ")
                      : "matched relevant corpus examples for this project context"}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-ink-600">{BAND_IMPACT[result.band]}</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              Matched historical RFI patterns ({result.items.length})
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
                      Mark addressed
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
                    Why matched: {item.reasons.join(" | ")}
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
