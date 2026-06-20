"use client";

import { useMemo } from "react";
import { taxonomy } from "@arro/shared";
import { isStalled } from "@/lib/job-status";

type Confidence = "high" | "medium" | "low";

type SpecFlag = {
  page: number;
  area: string;
  category: string;
  severity: "must_resolve" | "nice_to_have";
  confidence?: Confidence;
  verbatim_quote?: string;
  reason: string;
  recommended_action: string;
  _rule?: string;
};

type SpecDocument = {
  id: string;
  filename: string;
  status: string;
  created_at?: string | null;
  processing_ms: number | null;
  flags_count: number | null;
  analysis: {
    flags?: SpecFlag[];
    extractor_version?: string;
  } | null;
};

const SEV_STYLE: Record<SpecFlag["severity"], string> = {
  must_resolve: "bg-red-100 text-red-800 border-red-200",
  nice_to_have: "bg-amber-100 text-amber-800 border-amber-200",
};

const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-ink-700/5 text-ink-500 border-ink-700/10",
};

const SEV_RANK: Record<SpecFlag["severity"], number> = {
  must_resolve: 2,
  nice_to_have: 1,
};
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function priorityScore(flag: SpecFlag): number {
  const sev = SEV_RANK[flag.severity] ?? 0;
  const conf = CONF_RANK[flag.confidence ?? "medium"] ?? 0;
  return sev * 10 + conf;
}

export function SpecReview({ spec }: { spec: SpecDocument }) {
  const flags = useMemo(() => {
    const list = [...(spec.analysis?.flags ?? [])];
    list.sort((a, b) => priorityScore(b) - priorityScore(a));
    return list.map((f, i) => ({ ...f, _n: i + 1 }));
  }, [spec.analysis?.flags]);

  const must = flags.filter((f) => f.severity === "must_resolve");
  const nice = flags.filter((f) => f.severity === "nice_to_have");

  return (
    <section className="space-y-4 max-w-3xl">
      {spec.status === "failed" && (
        <p className="rounded-sm bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          Analysis failed. Try re-uploading.
        </p>
      )}
      {isStalled(spec.status, spec.created_at) && (
        <p className="rounded-sm bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Analysis stalled — it didn&apos;t finish. Delete this document and
          re-upload to try again.
        </p>
      )}
      {spec.status === "no_text_layer" && (
        <p className="rounded-sm bg-sky-50 border border-sky-200 p-3 text-sm text-sky-800">
          This document has no readable text layer (it looks like a scan), so the
          deterministic spec checks couldn&apos;t run. Upload a text-based PDF.
        </p>
      )}

      <div className="rounded-sm border border-ink-700/10 p-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-ink-500 mb-2">Summary</p>
        <p>
          {flags.length === 0
            ? spec.status === "analysed"
              ? "No likely RFIs found in this document."
              : "Not analysed."
            : `${flags.length} likely RFI${flags.length === 1 ? "" : "s"} found (${must.length} must resolve / ${nice.length} nice to have).`}
        </p>
        <div className="mt-3 flex gap-4 text-xs text-ink-500 flex-wrap">
          {spec.processing_ms != null && (
            <span>{(spec.processing_ms / 1000).toFixed(2)}s</span>
          )}
          {spec.analysis?.extractor_version && (
            <span>{spec.analysis.extractor_version}</span>
          )}
        </div>
      </div>

      <FlagList title={`Must resolve (${must.length})`} flags={must} />
      <FlagList title={`Nice to have (${nice.length})`} flags={nice} />
    </section>
  );
}

function FlagList({
  title,
  flags,
}: {
  title: string;
  flags: (SpecFlag & { _n: number })[];
}) {
  if (!flags.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {flags.map((f) => (
        <FlagCard key={f._n} flag={f} />
      ))}
    </div>
  );
}

function FlagCard({ flag: f }: { flag: SpecFlag & { _n: number } }) {
  const cat = taxonomy.categories.find((c) => c.id === f.category);
  const conf = f.confidence ?? "medium";
  const sevColour =
    f.severity === "must_resolve" ? "rgb(220 38 38)" : "rgb(217 119 6)";

  return (
    <article
      className={`rounded-sm border p-4 transition-shadow ${SEV_STYLE[f.severity]}`}
    >
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <p className="font-medium text-sm flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold"
            style={{ width: 18, height: 18, backgroundColor: sevColour }}
          >
            {f._n}
          </span>
          {f.page > 1 ? `Page ${f.page} · ` : ""}
          <span className="text-ink-700/80">{f.area}</span>
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${CONF_STYLE[conf]}`}
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
