"use client";

import { useState } from "react";
import Link from "next/link";
import { taxonomy } from "@arro/shared";

export type IssueSource = {
  kind: "drawing" | "spec" | "material" | "coordination";
  filename: string;
  id?: string;
  param?: "plan" | "spec";
};

export type SummaryIssue = {
  severity: "must_resolve" | "nice_to_have";
  category: string;
  area: string;
  reason: string;
  source: IssueSource;
};

const SOURCE_LABEL: Record<IssueSource["kind"], string> = {
  drawing: "DRAWING",
  spec: "SPEC",
  material: "MATERIAL",
  coordination: "CROSS-DOC",
};

const SOURCE_STYLE: Record<IssueSource["kind"], string> = {
  drawing: "bg-ink-100 text-ink-700",
  spec: "bg-violet-100 text-violet-800",
  material: "bg-amber-100 text-amber-800",
  coordination: "bg-sky-100 text-sky-800",
};

export function ProjectSummary({
  issues,
  documentCount,
  projectId,
}: {
  issues: SummaryIssue[];
  documentCount: number;
  projectId: string;
}) {
  const [showNice, setShowNice] = useState(false);

  // A "project summary" only makes sense once the project holds more than one
  // document; a single doc is just that document's own review.
  if (documentCount < 2) return null;

  const must = issues.filter((i) => i.severity === "must_resolve");
  const nice = issues.filter((i) => i.severity === "nice_to_have");

  const byKind = (k: IssueSource["kind"]) =>
    issues.filter((i) => i.source.kind === k).length;

  return (
    <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-5 border-l-4 border-ink-900">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
            Project summary
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900 mt-1">
            {issues.length === 0
              ? "No issues found across the project"
              : `${issues.length} issue${issues.length === 1 ? "" : "s"} across ${documentCount} documents`}
          </h2>
        </div>
        {issues.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Count n={must.length} label="must resolve" tone="red" />
            <Count n={nice.length} label="nice to have" tone="amber" />
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {(["drawing", "spec", "material", "coordination"] as const).map((k) =>
            byKind(k) > 0 ? (
              <span
                key={k}
                className={`rounded-sm px-2 py-0.5 font-medium ${SOURCE_STYLE[k]}`}
              >
                {SOURCE_LABEL[k]} {byKind(k)}
              </span>
            ) : null,
          )}
        </div>
      )}

      {issues.length === 0 ? (
        <p className="rounded-sm border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-800">
          Every analysed document is clean and the documents are consistent with
          each other. Nothing flagged for RFI.
        </p>
      ) : (
        <div className="space-y-4">
          <IssueGroup
            title={`Must resolve (${must.length})`}
            issues={must}
            projectId={projectId}
          />
          {nice.length > 0 && (
            <div className="rounded-sm border border-ink-700/10">
              <button
                type="button"
                onClick={() => setShowNice((v) => !v)}
                className="w-full px-4 py-2 text-left text-sm flex justify-between items-center cursor-pointer"
              >
                <span>Nice to have ({nice.length})</span>
                <span className="text-xs text-ink-500">
                  {showNice ? "Hide" : "Show"}
                </span>
              </button>
              {showNice && (
                <div className="border-t border-ink-700/10 p-3 space-y-2">
                  {nice.map((i, idx) => (
                    <IssueRow key={idx} issue={i} projectId={projectId} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Count({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: "red" | "amber";
}) {
  const style =
    tone === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2.5 py-1 font-medium ${style}`}>
      {n} {label}
    </span>
  );
}

function IssueGroup({
  title,
  issues,
  projectId,
}: {
  title: string;
  issues: SummaryIssue[];
  projectId: string;
}) {
  if (!issues.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {issues.map((i, idx) => (
        <IssueRow key={idx} issue={i} projectId={projectId} />
      ))}
    </div>
  );
}

function IssueRow({
  issue: i,
  projectId,
}: {
  issue: SummaryIssue;
  projectId: string;
}) {
  const cat = taxonomy.categories.find((c) => c.id === i.category);
  const sevColour =
    i.severity === "must_resolve" ? "rgb(220 38 38)" : "rgb(217 119 6)";
  const href =
    i.source.id && i.source.param
      ? {
          pathname: `/projects/${projectId}/drawings`,
          query: { [i.source.param]: i.source.id },
        }
      : null;

  const body = (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-sm border border-ink-700/10 hover:bg-ink-50 transition-colors">
      <span
        className="mt-1.5 w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: sevColour }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-semibold tracking-wide rounded-sm px-1.5 py-0.5 ${SOURCE_STYLE[i.source.kind]}`}
          >
            {SOURCE_LABEL[i.source.kind]}
          </span>
          <span className="text-xs text-ink-500 truncate max-w-[16rem]">
            {i.source.filename}
          </span>
          <span className="text-xs font-medium text-ink-800 truncate">
            {cat?.label ?? i.area}
          </span>
        </div>
        <p className="text-sm text-ink-700 mt-1 line-clamp-2">{i.reason}</p>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block cursor-pointer">
      {body}
    </Link>
  ) : (
    body
  );
}
