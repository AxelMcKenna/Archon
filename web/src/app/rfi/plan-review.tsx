"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { taxonomy } from "@consentiq/shared";

type Confidence = "high" | "medium" | "low";

type Flag = {
  page: number;
  tile?: string;
  area: string;
  category: string;
  severity: "must_resolve" | "nice_to_have";
  confidence?: Confidence;
  verbatim_quote?: string;
  reason: string;
  recommended_action: string;
};

type Plan = {
  id: string;
  filename: string;
  status: string;
  analyser_version: string | null;
  analysis_version?: string | null;
  prompt_version: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  analysis: {
    flags?: Flag[];
    summary?: string;
    pages_analysed?: number;
    taxonomy_version?: string;
    truncated?: boolean;
    verification?: "verified" | "skipped";
  } | null;
};

const SEV_STYLE: Record<Flag["severity"], string> = {
  must_resolve: "bg-red-100 text-red-800 border-red-200",
  nice_to_have: "bg-amber-100 text-amber-800 border-amber-200",
};

const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-ink-700/5 text-ink-500 border-ink-700/10",
};

const SEV_RANK: Record<Flag["severity"], number> = {
  must_resolve: 2,
  nice_to_have: 1,
};
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

const DEFAULT_VISIBLE = 15;

function priorityScore(flag: Flag): number {
  const sev = SEV_RANK[flag.severity] ?? 0;
  const conf = CONF_RANK[flag.confidence ?? "medium"] ?? 0;
  return sev * 10 + conf;
}

export function PlanReview({ plan }: { plan: Plan }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showLowConfidence, setShowLowConfidence] = useState(false);

  useEffect(() => {
    apiFetch<{ url: string }>(`/plans/${plan.id}/signed-url`)
      .then((r) => setSignedUrl(r.url))
      .catch(() => setSignedUrl(null));
  }, [plan.id]);

  const flags = plan.analysis?.flags ?? [];

  const { highMedium, lowConfidence } = useMemo(() => {
    const high: Flag[] = [];
    const low: Flag[] = [];
    for (const f of flags) {
      if ((f.confidence ?? "medium") === "low") low.push(f);
      else high.push(f);
    }
    high.sort((a, b) => priorityScore(b) - priorityScore(a));
    low.sort((a, b) => priorityScore(b) - priorityScore(a));
    return { highMedium: high, lowConfidence: low };
  }, [flags]);

  const visible = showAll ? highMedium : highMedium.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = Math.max(0, highMedium.length - visible.length);

  const must = visible.filter((f) => f.severity === "must_resolve");
  const nice = visible.filter((f) => f.severity === "nice_to_have");

  const truncated = plan.analysis?.truncated;
  const verificationStatus = plan.analysis?.verification ?? "verified";

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
        {truncated && (
          <p className="rounded bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            This plan exceeded the per-analysis image budget; later pages were
            not analysed. Consider splitting the upload.
          </p>
        )}
        {verificationStatus === "skipped" && (
          <p className="rounded bg-sky-50 border border-sky-200 p-3 text-sm text-sky-800">
            Flag verification could not run on this analysis. Treat all flags
            as &quot;may want to check&quot;.
          </p>
        )}

        {plan.analysis?.summary && (
          <div className="rounded-lg border border-ink-700/10 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-ink-500 mb-2">Summary</p>
            <p>{plan.analysis.summary}</p>
            <div className="mt-3 flex gap-4 text-xs text-ink-500 flex-wrap">
              <span>Pages: {plan.analysis.pages_analysed ?? "?"}</span>
              <span>Flags: {flags.length}</span>
              {plan.processing_ms != null && (
                <span>{(plan.processing_ms / 1000).toFixed(1)}s</span>
              )}
              {plan.cost_usd != null && <span>${plan.cost_usd.toFixed(4)}</span>}
              {plan.analysis_version && <span>v{plan.analysis_version}</span>}
            </div>
          </div>
        )}

        <FlagList title={`Must resolve (${must.length})`} flags={must} />
        <FlagList title={`Nice to have (${nice.length})`} flags={nice} />

        {hiddenCount > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-sm underline text-ink-700"
          >
            Show {hiddenCount} more flag{hiddenCount === 1 ? "" : "s"}
          </button>
        )}

        {lowConfidence.length > 0 && (
          <div className="rounded-lg border border-ink-700/10">
            <button
              type="button"
              onClick={() => setShowLowConfidence((v) => !v)}
              className="w-full px-4 py-2 text-left text-sm flex justify-between items-center"
            >
              <span>
                May want to check ({lowConfidence.length} low-confidence)
              </span>
              <span className="text-xs text-ink-500">
                {showLowConfidence ? "Hide" : "Show"}
              </span>
            </button>
            {showLowConfidence && (
              <div className="border-t border-ink-700/10 p-3 space-y-2">
                {lowConfidence.map((f, i) => (
                  <FlagCard key={`lc-${i}`} flag={f} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function FlagList({ title, flags }: { title: string; flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {flags.map((f, i) => (
        <FlagCard key={i} flag={f} />
      ))}
    </div>
  );
}

function FlagCard({ flag: f }: { flag: Flag }) {
  const cat = taxonomy.categories.find((c) => c.id === f.category);
  const conf = f.confidence ?? "medium";
  return (
    <article className={`rounded-lg border p-4 ${SEV_STYLE[f.severity]}`}>
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <p className="font-medium text-sm">
          Page {f.page}
          {f.tile && f.tile !== "full" ? ` · ${f.tile}` : ""} ·{" "}
          <span className="text-ink-700/80">{f.area}</span>
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${CONF_STYLE[conf]}`}
          >
            {conf}
          </span>
          <span className="font-mono text-xs">{f.category}</span>
        </div>
      </header>
      {cat && <p className="text-xs text-ink-500 mb-2">{cat.label}</p>}
      {f.verbatim_quote && (
        <blockquote className="border-l-2 border-current/40 pl-2 mb-2 text-xs italic">
          &ldquo;{f.verbatim_quote}&rdquo;
        </blockquote>
      )}
      <p className="text-sm">{f.reason}</p>
      <p className="text-sm mt-2">
        <span className="font-medium">Recommended action:</span>{" "}
        {f.recommended_action}
      </p>
    </article>
  );
}
