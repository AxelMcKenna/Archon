"use client";

import type { Route } from "next";
import Link from "next/link";
import { useConsentAssessment } from "./use-consent-assessment";

interface ConsentAssessmentPageProps {
  projectId: string;
  address: string;
}

export function ConsentAssessmentPage({
  projectId,
  address,
}: ConsentAssessmentPageProps) {
  const { checklist, documents, uploads, completion, isLoading, error, generateChecklist } =
    useConsentAssessment({
      projectId,
      address,
    });
  const hasRequirements = Boolean(checklist && documents.length > 0);
  const actionLabel = isLoading
    ? hasRequirements
      ? "Refreshing requirements..."
      : "Generating requirements..."
    : hasRequirements
      ? "Refresh Requirements"
      : "Generate Consent Requirements";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-500">
            Project Workflow
          </p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
              Consent Assessment
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-500">
              Track and prepare required documentation for consent submission.
            </p>
          </div>
        </div>
        <button
          onClick={() => void generateChecklist()}
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:bg-ink-700/60"
        >
          {actionLabel}
        </button>
      </section>

      <section className="rounded-2xl border border-ink-700/10 bg-gradient-to-br from-white to-slate-50 p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink-500">Consent Readiness</p>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
                {completion.completed} / {completion.total} Documents Complete
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Upload progress updates automatically as each required document is prepared.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Required documents" value={String(completion.total)} />
            <MetricCard label="Uploaded" value={String(completion.completed)} />
            <MetricCard label="Remaining" value={String(completion.remaining.length)} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="h-3 overflow-hidden rounded-full bg-ink-700/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-ink-500">
            <span>{completion.percent}% complete</span>
            <span>{completion.remaining.length} documents still need attention</span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-ink-700/10 bg-white/80 p-5">
          <p className="text-sm font-medium text-ink-900">Remaining</p>
          {completion.remaining.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-sm text-ink-600 sm:grid-cols-2 xl:grid-cols-3">
              {completion.remaining.slice(0, 6).map((document) => (
                <li key={document.id} className="rounded-lg bg-ink-50 px-3 py-2">
                  {document.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-emerald-700">
              All required documents have been uploaded for this consent assessment.
            </p>
          )}
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              Required Consent Documents
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Review each required item, download the template if needed, and upload the prepared file.
            </p>
          </div>
          {checklist?.zone_info && (
            <div className="hidden rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-right text-sm text-ink-500 shadow-sm md:block">
              <div>{checklist.zone_info.zone_type}</div>
              <div className="capitalize">{checklist.zone_info.source_council}</div>
            </div>
          )}
        </div>

        {!documents.length ? (
          <div className="rounded-2xl border border-dashed border-ink-700/20 bg-white p-12 text-center shadow-sm">
            <p className="text-base font-medium text-ink-900">
              {isLoading ? "Generating consent document requirements..." : "No consent documents available yet."}
            </p>
            <p className="mt-2 text-sm text-ink-500">
              {isLoading
                ? "We are analysing the project address and council context."
                : "Generate consent requirements to create the document set for this project."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {documents.map((document) => {
              const upload = uploads[document.id];
              const href = `/projects/${projectId}/consent-assessment/${document.id}` as Route;

              return (
                <Link
                  key={document.id}
                  href={href}
                  className="group rounded-2xl border border-ink-700/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ink-700/20 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-ink-900">{document.title}</h3>
                        <StatusBadge uploaded={Boolean(upload)} />
                        <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500">
                          {document.category}
                        </span>
                      </div>
                      <p className="max-w-3xl text-sm text-ink-600">{document.whyRequired}</p>
                      {document.triggered_by.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {document.triggered_by.map((trigger) => (
                            <span
                              key={trigger}
                              className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                            >
                              {trigger}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-56 flex-col items-start gap-2 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
                      <span className="font-medium text-ink-900">
                        {upload ? "Uploaded file" : "Awaiting upload"}
                      </span>
                      <span>{upload ? upload.fileName : "Open document page to upload"}</span>
                      <span className="text-xs text-ink-500/80 group-hover:text-ink-500">
                        View document details
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700/10 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{value}</div>
    </div>
  );
}

function StatusBadge({ uploaded }: { uploaded: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        uploaded
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {uploaded ? "Uploaded" : "Missing"}
    </span>
  );
}
