"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { taxonomy } from "@arro/shared";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

type Confidence = "high" | "medium" | "low";

type Citation = {
  source_kind: "drawing" | "spec";
  source_id: string;
  filename: string;
  page?: number;
  quote?: string;
};

type CoordFlag = {
  id: string;
  category: string;
  severity: "must_resolve" | "nice_to_have";
  confidence?: Confidence;
  area: string;
  reason: string | null;
  recommended_action: string | null;
  rule: string | null;
  tier: string;
  citations: Citation[];
};

type Run = { ran_at: string; flags_count: number } | null;

const SEV_STYLE: Record<CoordFlag["severity"], string> = {
  must_resolve: "bg-red-100 text-red-800 border-red-200",
  nice_to_have: "bg-amber-100 text-amber-800 border-amber-200",
};

const SEV_RANK: Record<CoordFlag["severity"], number> = {
  must_resolve: 2,
  nice_to_have: 1,
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function CoordinationPanel({
  projectId,
  flags,
  run,
  documentCount,
}: {
  projectId: string;
  flags: CoordFlag[];
  run: Run;
  documentCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Coordination only means something with at least two documents to compare.
  if (documentCount < 2) return null;

  const sorted = [...flags].sort(
    (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity],
  );
  const must = sorted.filter((f) => f.severity === "must_resolve").length;

  async function recheck() {
    setBusy(true);
    try {
      await apiFetch(`/coordination/${projectId}/recheck`, { method: "POST" });
      toast.success("Coordination re-checked.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-check failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Cross-document coordination ({flags.length})
        </h2>
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span>
            {documentCount} documents
            {run ? ` · checked ${timeAgo(run.ran_at)}` : ""}
          </span>
          <button
            type="button"
            onClick={recheck}
            disabled={busy}
            className="underline text-ink-700 disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Re-checking…" : "Re-check"}
          </button>
        </div>
      </div>

      <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
        Where the project&apos;s drawings and specifications disagree. Each item
        cites both documents.
      </p>

      {flags.length === 0 ? (
        <p className="rounded-sm border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-800">
          Documents are consistent — no cross-document issues found.
        </p>
      ) : (
        <div className="space-y-2">
          {must > 0 && (
            <p className="text-xs text-ink-500">
              {must} must resolve · {flags.length - must} nice to have
            </p>
          )}
          {sorted.map((f) => (
            <CoordFlagCard key={f.id} flag={f} projectId={projectId} />
          ))}
        </div>
      )}
    </section>
  );
}

function CoordFlagCard({
  flag: f,
  projectId,
}: {
  flag: CoordFlag;
  projectId: string;
}) {
  const cat = taxonomy.categories.find((c) => c.id === f.category);
  const sevColour =
    f.severity === "must_resolve" ? "rgb(220 38 38)" : "rgb(217 119 6)";

  return (
    <article className={`rounded-sm border p-4 ${SEV_STYLE[f.severity]}`}>
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <p className="font-medium text-sm">{f.area}</p>
        <span className="font-mono text-xs">{f.category}</span>
      </header>
      {cat && <p className="text-xs text-ink-500 mb-2">{cat.label}</p>}
      {f.reason && <p className="text-sm">{f.reason}</p>}
      {f.recommended_action && (
        <p className="text-sm mt-2">
          <span className="font-medium">Recommended action:</span>{" "}
          {f.recommended_action}
        </p>
      )}
      {f.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {f.citations.map((c, i) => (
            <CitationChip
              key={`${c.source_id}-${i}`}
              citation={c}
              projectId={projectId}
              colour={sevColour}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function CitationChip({
  citation: c,
  projectId,
  colour,
}: {
  citation: Citation;
  projectId: string;
  colour: string;
}) {
  const param = c.source_kind === "spec" ? "spec" : "plan";
  const href = {
    pathname: `/projects/${projectId}/drawings`,
    query: { [param]: c.source_id },
  };
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-sm border border-current/30 bg-white/60 px-2 py-1 text-[11px] hover:bg-white"
      title={c.quote || c.filename}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className="font-medium uppercase tracking-wide">
        {c.source_kind}
      </span>
      <span className="text-ink-600 truncate max-w-[14rem]">{c.filename}</span>
    </Link>
  );
}
