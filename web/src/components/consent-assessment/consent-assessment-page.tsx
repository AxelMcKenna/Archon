"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import type { ProjectDetails } from "@/types/consent";
import { CompletionCheckbox } from "./completion-checkbox";
import { DocumentOrderManager } from "./document-order-manager";
import {
  CompletionBadge,
  confirmDocumentRemoval,
  ConsentErrorAlert,
  UploadBadge,
} from "./document-status";
import { ManualDocumentForm } from "./manual-document-form";
import type { ConsentDocument } from "./model";
import { isManualDocument } from "./model";
import { useConsentAssessment } from "./use-consent-assessment";

interface ConsentAssessmentPageProps {
  projectId: string;
  address: string;
  projectDetails: ProjectDetails;
}

export function ConsentAssessmentPage({
  projectId,
  address,
  projectDetails,
}: ConsentAssessmentPageProps) {
  const {
    checklist,
    documents,
    uploads,
    completions,
    completion,
    isLoading,
    error,
    generateChecklist,
    createManualDocument,
    removeDocument,
    saveDocumentOrder,
    setDocumentCompleted,
  } = useConsentAssessment({
    projectId,
    address,
    projectDetails,
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const hasRequirements = documents.length > 0;
  const actionLabel = isLoading
    ? hasRequirements
      ? "Refreshing requirements..."
      : "Generating requirements..."
    : hasRequirements
      ? "Refresh Requirements"
      : "Generate Consent Requirements";

  function handleRemoveDocument(document: ConsentDocument) {
    if (!confirmDocumentRemoval()) {
      return;
    }

    removeDocument(document.id);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
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
                Completion is tracked manually. Uploads remain available as supporting evidence.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Required documents" value={String(completion.total)} />
            <MetricCard label="Completed" value={String(completion.completed)} />
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
              All required documents have been manually marked complete for this assessment.
            </p>
          )}
        </div>
      </section>

      {error && <ConsentErrorAlert message={error} />}

      <section className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              Required Consent Documents
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Review each required item, mark it complete when ready, and upload supporting files
              separately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setShowAddForm((current) => !current);
                setIsReorderMode(false);
              }}
              className="inline-flex items-center rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-sm font-medium text-ink-900 shadow-sm transition-colors hover:bg-ink-50"
            >
              {showAddForm ? "Close Form" : "Add Required Document"}
            </button>
            <button
              onClick={() => {
                setIsReorderMode((current) => !current);
                setShowAddForm(false);
              }}
              className="inline-flex items-center rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-sm font-medium text-ink-900 shadow-sm transition-colors hover:bg-ink-50"
            >
              {isReorderMode ? "Exit Reorder" : "Reorder Documents"}
            </button>
            {checklist?.zone_info && (
              <div className="rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-sm text-ink-500 shadow-sm">
                <div className="font-medium text-ink-900">{checklist.zone_info.zone_type}</div>
                <div className="capitalize">{checklist.zone_info.source_council}</div>
              </div>
            )}
          </div>
        </div>

        {showAddForm && (
          <ManualDocumentForm
            onCancel={() => setShowAddForm(false)}
            onSubmit={(values, file) => {
              createManualDocument(values, file);
              setShowAddForm(false);
            }}
          />
        )}

        {isReorderMode && documents.length > 0 && (
          <DocumentOrderManager
            documents={documents}
            onCancel={() => setIsReorderMode(false)}
            onConfirm={(nextDocumentOrder) => {
              saveDocumentOrder(nextDocumentOrder);
              setIsReorderMode(false);
            }}
          />
        )}

        {!documents.length ? (
          <div className="rounded-2xl border border-dashed border-ink-700/20 bg-white p-12 text-center shadow-sm">
            <p className="text-base font-medium text-ink-900">
              {isLoading
                ? "Generating consent document requirements..."
                : "No consent documents available yet."}
            </p>
            <p className="mt-2 text-sm text-ink-500">
              {isLoading
                ? "We are analysing the project address and council context."
                : "Generate consent requirements or add a manual document to start this project workflow."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {documents.map((document) => {
              const upload = uploads[document.id];
              const isCompleted = Boolean(completions[document.id]);
              const href = `/projects/${projectId}/consent-assessment/${document.id}` as Route;
              const manual = isManualDocument(document);

              return (
                <div
                  key={document.id}
                  className="rounded-2xl border border-ink-700/10 bg-white p-5 shadow-sm transition-all hover:border-ink-700/20 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-1 gap-4">
                      <CompletionCheckbox
                        checked={isCompleted}
                        onChange={(checked) => setDocumentCompleted(document.id, checked)}
                        label={isCompleted ? "Completed" : "Mark complete"}
                        muted
                      />

                      <Link href={href} className="group min-w-0 flex-1">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold text-ink-900">{document.title}</h3>
                            <CompletionBadge completed={isCompleted} />
                            <UploadBadge uploaded={Boolean(upload)} />
                            <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500">
                              {document.category}
                            </span>
                            {manual && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                Manual
                              </span>
                            )}
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
                      </Link>
                    </div>

                    <div className="flex min-w-56 flex-col items-start gap-2 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
                      <span className="font-medium text-ink-900">
                        {upload ? "Uploaded file" : "No file uploaded"}
                      </span>
                      <span>{upload ? upload.fileName : "Upload available on the document page"}</span>
                      <Link href={href} className="text-xs font-medium text-ink-700 hover:text-ink-900">
                        View document details
                      </Link>
                      <button
                        onClick={() => handleRemoveDocument(document)}
                        className="text-xs font-medium text-red-700 transition-colors hover:text-red-800"
                      >
                        Remove document
                      </button>
                    </div>
                  </div>
                </div>
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
