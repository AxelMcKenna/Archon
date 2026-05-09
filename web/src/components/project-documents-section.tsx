"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ProjectDetails } from "@/types/consent";
import { CompletionCheckbox } from "@/components/consent-assessment/completion-checkbox";
import {
  CompletionBadge,
  confirmDocumentRemoval,
  ConsentErrorAlert,
  UploadBadge,
} from "@/components/consent-assessment/document-status";
import { isManualDocument } from "@/components/consent-assessment/model";
import type { ConsentDocument } from "@/components/consent-assessment/model";
import { useConsentAssessment } from "@/components/consent-assessment/use-consent-assessment";

interface ProjectDocumentsSectionProps {
  projectId: string;
  address: string;
  projectDetails: ProjectDetails;
}

export function ProjectDocumentsSection({
  projectId,
  address,
  projectDetails,
}: ProjectDocumentsSectionProps) {
  const {
    documents,
    uploads,
    completions,
    completion,
    error,
    removeDocument,
    setDocumentCompleted,
  } = useConsentAssessment({
    projectId,
    address,
    projectDetails,
  });

  function handleRemoveDocument(document: ConsentDocument) {
    if (!confirmDocumentRemoval()) {
      return;
    }

    removeDocument(document.id);
  }

  return (
    <section id="documents" className="space-y-4 scroll-mt-24">
      <div className="flex flex-col gap-4 rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">Documents</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Overview of required consent documents, upload status, and completion progress for
            this project.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/project-application` as Route}
          className="inline-flex items-center justify-center rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
        >
          Open Project Application
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Required documents" value={String(completion.total)} />
        <MetricCard label="Completed" value={String(completion.completed)} />
        <MetricCard label="Uploaded" value={String(Object.keys(uploads).length)} />
      </div>

      {error && <ConsentErrorAlert message={error} />}

      {!documents.length ? (
        <div className="rounded-2xl border border-dashed border-ink-700/20 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-medium text-ink-900">No documents have been generated yet.</p>
          <p className="mt-2 text-sm text-ink-500">
            Open Project Application to generate consent requirements and manage uploads.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((document) => {
            const upload = uploads[document.id];
            const isCompleted = Boolean(completions[document.id]);
            const href = `/projects/${projectId}/project-application/${document.id}` as Route;
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
                      type="button"
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
