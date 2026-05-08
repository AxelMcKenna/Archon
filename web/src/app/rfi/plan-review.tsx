"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { taxonomy } from "@consentiq/shared";

type Flag = {
  page: number;
  area: string;
  category: string;
  severity: "must_resolve" | "nice_to_have";
  reason: string;
  recommended_action: string;
};

type Plan = {
  id: string;
  filename: string;
  status: string;
  analyser_version: string | null;
  prompt_version: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  analysis: {
    flags?: Flag[];
    summary?: string;
    pages_analysed?: number;
    taxonomy_version?: string;
  } | null;
};

const SEV_STYLE: Record<Flag["severity"], string> = {
  must_resolve: "bg-red-100 text-red-800 border-red-200",
  nice_to_have: "bg-amber-100 text-amber-800 border-amber-200",
};

export function PlanReview({ plan }: { plan: Plan }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ url: string }>(`/plans/${plan.id}/signed-url`)
      .then((r) => setSignedUrl(r.url))
      .catch(() => setSignedUrl(null));
  }, [plan.id]);

  const flags = plan.analysis?.flags ?? [];
  const grouped = useMemo(() => {
    const must = flags.filter((f) => f.severity === "must_resolve");
    const nice = flags.filter((f) => f.severity === "nice_to_have");
    return { must, nice };
  }, [flags]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="rounded-lg border border-ink-700/10 bg-ink-700/5 h-full flex flex-col">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10">
            Plan — {plan.filename}
          </div>
          {signedUrl ? (
            <iframe src={signedUrl} className="flex-1 w-full" title="Building plan" />
          ) : (
            <div className="p-6 text-sm text-ink-500">Loading…</div>
          )}
        </div>
      </aside>

      <section className="space-y-4">
        {plan.status === "failed" && (
          <p className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Analysis failed. Try re-uploading.
          </p>
        )}
        {plan.analysis?.summary && (
          <div className="rounded-lg border border-ink-700/10 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-ink-500 mb-2">Summary</p>
            <p>{plan.analysis.summary}</p>
            <div className="mt-3 flex gap-4 text-xs text-ink-500">
              <span>Pages analysed: {plan.analysis.pages_analysed ?? "?"}</span>
              <span>Flags: {flags.length}</span>
              {plan.processing_ms != null && <span>{(plan.processing_ms / 1000).toFixed(1)}s</span>}
              {plan.cost_usd != null && <span>${plan.cost_usd.toFixed(4)}</span>}
            </div>
          </div>
        )}

        <FlagList title={`Must resolve (${grouped.must.length})`} flags={grouped.must} />
        <FlagList title={`Nice to have (${grouped.nice.length})`} flags={grouped.nice} />
      </section>
    </div>
  );
}

function FlagList({ title, flags }: { title: string; flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {flags.map((f, i) => {
        const cat = taxonomy.categories.find((c) => c.id === f.category);
        return (
          <article key={i} className={`rounded-lg border p-4 ${SEV_STYLE[f.severity]}`}>
            <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
              <p className="font-medium text-sm">
                Page {f.page} · <span className="text-ink-700/80">{f.area}</span>
              </p>
              <span className="font-mono text-xs">{f.category}</span>
            </header>
            {cat && (
              <p className="text-xs text-ink-500 mb-2">{cat.label}</p>
            )}
            <p className="text-sm">{f.reason}</p>
            <p className="text-sm mt-2">
              <span className="font-medium">Recommended action:</span> {f.recommended_action}
            </p>
          </article>
        );
      })}
    </div>
  );
}
