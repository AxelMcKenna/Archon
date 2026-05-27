"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CostImpact = "high" | "medium" | "low";
type Confidence = "high" | "medium" | "low";
type Category =
  | "material_substitution"
  | "structural_oversize"
  | "treatment_downgrade"
  | "product_alternative"
  | "detail_simplification"
  | "finish_downgrade";

type Opportunity = {
  page: number;
  tile?: string;
  area: string;
  category: Category;
  current_spec: string;
  proposed_alternative: string;
  cost_impact: CostImpact;
  confidence: Confidence;
  rationale: string;
  code_considerations?: string;
  bbox?: [number, number, number, number] | null;
};

type VERow = {
  id: string;
  plan_upload_id: string;
  status: "pending" | "analysing" | "analysed" | "failed";
  analyser_version: string | null;
  prompt_version: string | null;
  opportunities: Opportunity[] | null;
  summary: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
};

const IMPACT_RANK: Record<CostImpact, number> = { high: 3, medium: 2, low: 1 };
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

const IMPACT_STYLE: Record<CostImpact, string> = {
  high: "bg-emerald-100 text-emerald-900 border-emerald-200",
  medium: "bg-emerald-50 text-emerald-800 border-emerald-200",
  low: "bg-ink-700/5 text-ink-700 border-ink-700/10",
};
const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-ink-700/5 text-ink-500 border-ink-700/10",
};

const CATEGORY_LABEL: Record<Category, string> = {
  material_substitution: "Material substitution",
  structural_oversize: "Structural oversize",
  treatment_downgrade: "Treatment downgrade",
  product_alternative: "Product alternative",
  detail_simplification: "Detail simplification",
  finish_downgrade: "Finish downgrade",
};

function score(o: Opportunity): number {
  return IMPACT_RANK[o.cost_impact] * 10 + CONF_RANK[o.confidence];
}

export function ValueEngineeringReview({ planId }: { planId: string }) {
  const [row, setRow] = useState<VERow | null | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch<VERow | null>(
        `/plans/${planId}/value-engineering`,
      );
      setRow(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
    }
  }, [planId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const trigger = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await apiFetch<unknown>(`/plans/${planId}/value-engineering`, {
        method: "POST",
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [planId, refresh]);

  if (row === undefined) {
    return (
      <div className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500">
        Loading value engineering…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-sm border border-ink-700/10 p-6 text-center space-y-3">
        <p className="text-sm text-ink-700">
          Find cost-reduction opportunities in this drawing set — over-specified
          materials, premium products with code-compliant alternatives,
          unnecessarily complex details.
        </p>
        <button
          type="button"
          onClick={trigger}
          disabled={running}
          className="rounded-sm bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700 disabled:opacity-50"
        >
          {running ? "Running…" : "Run value engineering"}
        </button>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  if (row.status === "failed") {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
        <p>Value engineering failed. {row.error}</p>
        <button
          type="button"
          onClick={trigger}
          disabled={running}
          className="rounded-sm bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700 disabled:opacity-50"
        >
          {running ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (row.status !== "analysed") {
    return (
      <div className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500">
        Analysing for cost savings — this usually takes 30–60 seconds.
      </div>
    );
  }

  const opportunities = (row.opportunities ?? []).slice().sort(
    (a, b) => score(b) - score(a),
  );
  const groups: Record<CostImpact, Opportunity[]> = {
    high: opportunities.filter((o) => o.cost_impact === "high"),
    medium: opportunities.filter((o) => o.cost_impact === "medium"),
    low: opportunities.filter((o) => o.cost_impact === "low"),
  };

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-ink-700/10 p-4 text-sm">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-xs uppercase tracking-wide text-ink-500">Summary</p>
          <button
            type="button"
            onClick={trigger}
            disabled={running}
            className="text-xs underline text-ink-500 hover:text-ink-900 disabled:opacity-50"
          >
            {running ? "Re-running…" : "Re-run"}
          </button>
        </div>
        {row.summary && <p className="mt-2">{row.summary}</p>}
        <div className="mt-3 flex gap-4 text-xs text-ink-500 flex-wrap">
          <span>Opportunities: {opportunities.length}</span>
          {row.processing_ms != null && (
            <span>{(row.processing_ms / 1000).toFixed(1)}s</span>
          )}
          {row.cost_usd != null && <span>${row.cost_usd.toFixed(4)}</span>}
          {row.analyser_version && <span>v{row.analyser_version}</span>}
        </div>
      </div>

      {opportunities.length === 0 && (
        <p className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500 italic">
          No clear cost-reduction opportunities surfaced on this set.
        </p>
      )}

      <OpportunityGroup title="High savings" items={groups.high} />
      <OpportunityGroup title="Medium savings" items={groups.medium} />
      <OpportunityGroup title="Low savings" items={groups.low} />
    </div>
  );
}

function OpportunityGroup({
  title,
  items,
}: {
  title: string;
  items: Opportunity[];
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} ({items.length})
      </h3>
      {items.map((o, i) => (
        <OpportunityCard key={`${o.page}-${i}-${o.area}`} o={o} />
      ))}
    </div>
  );
}

function OpportunityCard({ o }: { o: Opportunity }) {
  return (
    <article
      className={`rounded-sm border p-4 ${IMPACT_STYLE[o.cost_impact]}`}
    >
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <p className="font-medium text-sm">
          Page {o.page}
          {o.tile && o.tile !== "full" ? ` · ${o.tile}` : ""} ·{" "}
          <span className="text-ink-700/80">{o.area}</span>
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${CONF_STYLE[o.confidence]}`}
          >
            {o.confidence}
          </span>
          <span className="font-mono text-xs">{CATEGORY_LABEL[o.category]}</span>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-2">
        <div className="rounded-sm bg-white/60 p-2 border border-ink-700/10">
          <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
            Currently specified
          </p>
          <p className="italic">&ldquo;{o.current_spec}&rdquo;</p>
        </div>
        <div className="rounded-sm bg-white/60 p-2 border border-emerald-200">
          <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
            Proposed alternative
          </p>
          <p>{o.proposed_alternative}</p>
        </div>
      </div>
      <p className="text-sm">{o.rationale}</p>
      {o.code_considerations && (
        <p className="text-xs text-ink-700/80 mt-2">
          <span className="font-medium">Check before committing:</span>{" "}
          {o.code_considerations}
        </p>
      )}
    </article>
  );
}
