"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

type Confidence = "high" | "medium" | "low";

type Citation = {
  source_kind: "drawing" | "spec" | "material";
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

const SEV_RANK: Record<CoordFlag["severity"], number> = {
  must_resolve: 2,
  nice_to_have: 1,
};

const KIND_META: Record<Citation["source_kind"], { label: string; dot: string }> = {
  spec: { label: "Spec", dot: "bg-violet-500" },
  material: { label: "Material", dot: "bg-amber-500" },
  drawing: { label: "Drawing", dot: "bg-ink-400" },
};

function prettyDoc(name: string): string {
  return name === "drawing set" ? "Drawing set" : name;
}

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
  const [deepBusy, setDeepBusy] = useState(false);

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

  // The AI pass - semantic spec/material<->drawing reconciliation incl. product
  // scope-of-use vs the design. Explicit + slower; never runs on upload.
  async function deepCheck() {
    setDeepBusy(true);
    try {
      await apiFetch(`/coordination/${projectId}/deep-check`, { method: "POST" });
      toast.success("AI cross-check complete.");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "AI cross-check failed.",
      );
    } finally {
      setDeepBusy(false);
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
            onClick={deepCheck}
            disabled={deepBusy}
            title="AI semantic cross-check, including product scope of use vs the design. Slower; uses AI."
            className="underline text-sky-700 disabled:opacity-50 cursor-pointer"
          >
            {deepBusy ? "AI cross-checking…" : "Deep cross-check (AI)"}
          </button>
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
          Documents are consistent - no cross-document issues found.
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
  const must = f.severity === "must_resolve";
  return (
    <article
      className={`rounded-md border border-ink-700/10 border-l-[3px] bg-white p-4 ${
        must ? "border-l-red-500" : "border-l-amber-500"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink-900 leading-snug">
          {f.area}
        </h4>
        {f.tier === "llm" && (
          <span
            className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5"
            title="Surfaced by AI semantic review - confirm before relying on it."
          >
            AI
          </span>
        )}
      </div>

      {f.reason && (
        <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">{f.reason}</p>
      )}
      {f.recommended_action && (
        <p className="mt-2 text-sm text-ink-700">
          <span className="font-medium text-ink-500">Fix · </span>
          {f.recommended_action}
        </p>
      )}

      {f.citations.length > 0 && (
        <div className="mt-3 flex items-center flex-wrap gap-1.5">
          {f.citations.map((c, i) => (
            <Fragment key={`${c.source_id}-${i}`}>
              {i > 0 && (
                <span className="text-ink-300 px-0.5" aria-hidden>
                  ↔
                </span>
              )}
              <DocPill citation={c} projectId={projectId} />
            </Fragment>
          ))}
        </div>
      )}
    </article>
  );
}

function DocPill({
  citation: c,
  projectId,
}: {
  citation: Citation;
  projectId: string;
}) {
  const meta = KIND_META[c.source_kind];
  // spec + material both live in spec_documents (selected via ?spec=); drawings
  // are plan_uploads (?plan=).
  const param = c.source_kind === "drawing" ? "plan" : "spec";
  const href = c.source_id
    ? {
        pathname: `/projects/${projectId}/drawings`,
        query: { [param]: c.source_id },
      }
    : null;
  const inner = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-ink-700/10 bg-ink-50 pl-2 pr-2.5 py-1 text-xs hover:bg-ink-100 transition-colors"
      title={c.quote || c.filename}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
        {meta.label}
      </span>
      <span className="text-ink-700 truncate max-w-[12rem]">
        {prettyDoc(c.filename)}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="cursor-pointer">
      {inner}
    </Link>
  ) : (
    inner
  );
}
