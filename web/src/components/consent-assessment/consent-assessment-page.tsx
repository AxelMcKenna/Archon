"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CompletionCheckbox } from "./completion-checkbox";
import type { ConsentDocument } from "./model";
import { isManualDocument } from "./model";
import { useConsentAssessment, type ProjectIntake } from "./use-consent-assessment";

interface ConsentAssessmentPageProps {
  projectId: string;
  address: string;
  projectIntake?: ProjectIntake;
}

interface ManualDocumentFormState {
  title: string;
  whyRequired: string;
  referenceUrl: string;
  completed: boolean;
}

const INITIAL_FORM: ManualDocumentFormState = {
  title: "",
  whyRequired: "",
  referenceUrl: "",
  completed: false,
};

export function ConsentAssessmentPage({
  projectId,
  address,
  projectIntake,
}: ConsentAssessmentPageProps) {
  const {
    checklist,
    documents,
    uploads,
    completions,
    completion,
    isLoading,
    error,
    createManualDocument,
    removeDocument,
    saveDocumentOrder,
    setDocumentCompleted,
  } = useConsentAssessment({
    projectId,
    address,
    projectIntake,
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    if (!isReorderMode) {
      return;
    }
    setDraftOrder(documents.map((document) => document.id));
  }, [documents, isReorderMode]);

  const reorderedDocuments = isReorderMode
    ? draftOrder
        .map((id) => documents.find((document) => document.id === id))
        .filter((document): document is ConsentDocument => Boolean(document))
    : documents;

  function updateField<K extends keyof ManualDocumentFormState>(
    key: K,
    value: ManualDocumentFormState[K],
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function handleAddDocument() {
    if (!formState.title.trim()) {
      setFormError("Document name is required.");
      return;
    }

    createManualDocument(
      {
        title: formState.title,
        whyRequired: formState.whyRequired,
        referenceUrl: formState.referenceUrl,
        completed: formState.completed,
      },
      formFile,
    );

    setShowAddForm(false);
    setFormState(INITIAL_FORM);
    setFormFile(null);
    setFormError(null);
  }

  function handleRemoveDocument(document: ConsentDocument) {
    const confirmed = window.confirm(
      "Are you sure you want to remove this required document?",
    );
    if (!confirmed) {
      return;
    }

    removeDocument(document.id);
  }

  function moveDraftDocument(documentId: string, direction: "up" | "down") {
    setDraftOrder((current) => {
      const index = current.indexOf(documentId);
      if (index === -1) {
        return current;
      }

      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function handleConfirmOrder() {
    saveDocumentOrder(draftOrder);
    setIsReorderMode(false);
  }

  function handleCancelOrder() {
    setDraftOrder(documents.map((document) => document.id));
    setIsReorderMode(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Project Workflow
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Consent Assessment
        </h1>
        <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
          Track and prepare required documentation for consent submission.
        </p>
      </header>

      <section className="rounded-sm bg-surface-raised shadow-depth p-8">
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

        <div className="mt-6 rounded-sm border border-ink-700/10 bg-white/80 p-5">
          <p className="text-sm font-medium text-ink-900">Remaining</p>
          {completion.remaining.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-sm text-ink-600 sm:grid-cols-2 xl:grid-cols-3">
              {completion.remaining.slice(0, 6).map((document) => (
                <li key={document.id} className="rounded-sm bg-ink-50 px-3 py-2">
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

      {error && (
        <section className="rounded-sm border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              Required Consent Documents
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Review each required item, mark it complete when ready, and upload supporting files separately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {checklist?.zone_info && (
              <div className="rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 text-right text-sm text-ink-500 shadow-sm">
                <div>{checklist.zone_info.zone_type}</div>
                <div className="capitalize">{checklist.zone_info.source_council}</div>
              </div>
            )}
            <button
              onClick={() => {
                setShowAddForm((current) => !current);
                setIsReorderMode(false);
              }}
              className="inline-flex items-center rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 text-sm font-medium text-ink-900 shadow-sm transition-colors hover:bg-ink-50"
            >
              {showAddForm ? "Close Form" : "Add Required Document"}
            </button>
            <button
              onClick={() => {
                setIsReorderMode((current) => !current);
                setShowAddForm(false);
              }}
              className="inline-flex items-center rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 text-sm font-medium text-ink-900 shadow-sm transition-colors hover:bg-ink-50"
            >
              {isReorderMode ? "Exit Reorder" : "Reorder Documents"}
            </button>
          </div>
        </div>

        {showAddForm && (
          <section className="rounded-sm bg-surface-raised shadow-depth p-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-ink-900">Document Name</label>
                  <input
                    value={formState.title}
                    onChange={(event) => updateField("title", event.currentTarget.value)}
                    placeholder="Arboricultural Assessment"
                    className="mt-2 w-full rounded-sm border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-ink-900">Why It Is Required</label>
                  <textarea
                    value={formState.whyRequired}
                    onChange={(event) => updateField("whyRequired", event.currentTarget.value)}
                    rows={5}
                    placeholder="Explain why council may require this document and what it supports."
                    className="mt-2 w-full rounded-sm border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-ink-900">
                    Open Guidance / Template Link
                  </label>
                  <input
                    type="url"
                    value={formState.referenceUrl}
                    onChange={(event) => updateField("referenceUrl", event.currentTarget.value)}
                    placeholder="https://..."
                    className="mt-2 w-full rounded-sm border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <CompletionCheckbox
                  checked={formState.completed}
                  onChange={(checked) => updateField("completed", checked)}
                  label={formState.completed ? "Complete" : "Mark as complete"}
                  muted
                />
                <div className="rounded-sm border border-ink-700/10 bg-ink-50 p-4">
                  <label className="text-sm font-medium text-ink-900">Upload Document / File</label>
                  <input
                    type="file"
                    onChange={(event) => setFormFile(event.currentTarget.files?.[0] ?? null)}
                    className="mt-3 block w-full text-sm text-ink-600 file:mr-4 file:rounded-sm file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink-700"
                  />
                  <div className="mt-3 rounded-sm bg-surface-raised px-3 py-2 text-sm text-ink-500">
                    {formFile ? formFile.name : "No file selected"}
                  </div>
                  {formFile && (
                    <button
                      onClick={() => setFormFile(null)}
                      className="mt-3 inline-flex items-center rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
                    >
                      Remove Selected File
                    </button>
                  )}
                </div>
                {formError && (
                  <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {formError}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleAddDocument}
                    className="inline-flex items-center rounded-sm bg-ink-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink-700"
                  >
                    Add Document
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setFormState(INITIAL_FORM);
                      setFormFile(null);
                      setFormError(null);
                    }}
                    className="inline-flex items-center rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {isReorderMode && reorderedDocuments.length > 0 && (
          <section className="rounded-sm bg-surface-raised shadow-depth p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink-900">Reorder Documents</h3>
                <p className="mt-1 text-sm text-ink-500">
                  Adjust the checklist order, then confirm to save it for this project.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleConfirmOrder}
                  className="inline-flex items-center rounded-sm bg-ink-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink-700"
                >
                  Confirm Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  className="inline-flex items-center rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {reorderedDocuments.map((document, index) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between rounded-sm border border-ink-700/10 bg-ink-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{index + 1}. {document.title}</span>
                      {isManualDocument(document) && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Manual
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-500">{document.whyRequired}</p>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => moveDraftDocument(document.id, "up")}
                      disabled={index === 0}
                      className="rounded-sm border border-ink-700/10 bg-surface-raised px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400"
                    >
                      Up
                    </button>
                    <button
                      onClick={() => moveDraftDocument(document.id, "down")}
                      disabled={index === reorderedDocuments.length - 1}
                      className="rounded-sm border border-ink-700/10 bg-surface-raised px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400"
                    >
                      Down
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!documents.length ? (
          <div className="rounded-sm border border-dashed border-ink-700/20 bg-surface-raised p-12 text-center shadow-sm">
            <p className="text-base font-medium text-ink-900">
              {isLoading
                ? "Generating consent document requirements..."
                : "Consent requirements are being prepared."}
            </p>
            <p className="mt-2 text-sm text-ink-500">
              {isLoading
                ? "We are analysing the project address and council context."
                : "This usually appears within a few seconds of project creation. Add a manual document below if anything is missing."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {documents.map((document) => {
              const upload = uploads[document.id];
              const isCompleted = Boolean(completions[document.id]);
              const href = `/projects/${projectId}/application-prep/${document.id}` as Route;
              const manual = isManualDocument(document);

              return (
                <div
                  key={document.id}
                  className="rounded-sm border border-ink-700/10 bg-surface-raised p-5 shadow-sm transition-all hover:border-ink-700/20 hover:shadow-md"
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

                    <div className="flex min-w-56 flex-col items-start gap-2 rounded-sm bg-ink-50 px-4 py-3 text-sm text-ink-500">
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
    <div className="rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{value}</div>
    </div>
  );
}

function CompletionBadge({ completed }: { completed: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        completed
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {completed ? "Complete" : "Incomplete"}
    </span>
  );
}

function UploadBadge({ uploaded }: { uploaded: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        uploaded
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {uploaded ? "File uploaded" : "No file"}
    </span>
  );
}
