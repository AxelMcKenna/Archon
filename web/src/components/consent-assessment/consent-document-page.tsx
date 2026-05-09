"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProjectDetails } from "@/types/consent";
import { CompletionCheckbox } from "./completion-checkbox";
import {
  CompletionBadge,
  confirmDocumentRemoval,
  ConsentErrorAlert,
  UploadBadge,
} from "./document-status";
import { isManualDocument } from "./model";
import { useConsentAssessment } from "./use-consent-assessment";

interface ConsentDocumentPageProps {
  projectId: string;
  address: string;
  documentId: string;
  projectDetails: ProjectDetails;
  basePath?: string;
  pageLabel?: string;
}

export function ConsentDocumentPage({
  projectId,
  address,
  documentId,
  projectDetails,
  basePath = "consent-assessment",
  pageLabel = "Consent Assessment",
}: ConsentDocumentPageProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const {
    documentMap,
    uploads,
    completions,
    isLoading,
    error,
    generateChecklist,
    removeDocument,
    saveUpload,
    removeUpload,
    setDocumentCompleted,
  } = useConsentAssessment({
    projectId,
    address,
    projectDetails,
  });

  const document = documentMap.get(documentId);
  const upload = uploads[documentId];
  const isCompleted = Boolean(completions[documentId]);
  const manual = isManualDocument(document);

  useEffect(() => {
    setFlashMessage(null);
  }, [documentId]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    saveUpload(documentId, file);
    setFlashMessage(`${file.name} uploaded successfully.`);
    event.target.value = "";
  }

  function handleRemoveFile() {
    removeUpload(documentId);
    setFlashMessage("Uploaded file removed.");
  }

  function handleDeleteDocument() {
    if (!document || !confirmDocumentRemoval()) {
      return;
    }

    removeDocument(documentId);
    router.push(`/projects/${projectId}/${basePath}` as Route);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/projects/${projectId}/${basePath}` as Route}
          className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          ← Back to {pageLabel}
        </Link>
        {document && (
          <button
            onClick={handleDeleteDocument}
            className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            Remove Document
          </button>
        )}
      </div>

      {error && <ConsentErrorAlert message={error} />}

      {!document ? (
        <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {isLoading ? "Loading document requirements..." : "Document not available"}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {isLoading
              ? "The consent checklist is being generated for this project."
              : "Generate consent requirements or add a manual document before opening individual document pages."}
          </p>
          {!isLoading && (
            <button
              onClick={() => void generateChecklist()}
              className="mt-6 inline-flex items-center rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
            >
              Generate Consent Requirements
            </button>
          )}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-500">
                  Consent Document
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
                    {document.title}
                  </h1>
                  {manual && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      Manual
                    </span>
                  )}
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
                  {document.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CompletionBadge completed={isCompleted} />
                <UploadBadge uploaded={Boolean(upload)} />
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(18rem,0.9fr)]">
            <div className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Why it is required</h2>
              <p className="mt-3 text-sm leading-6 text-ink-600">{document.whyRequired}</p>

              <div className="mt-6 rounded-xl border border-ink-700/10 bg-ink-50 p-5">
                <h3 className="text-sm font-semibold text-ink-900">NZ consent context</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  This document helps the council assess the proposed work against site
                  constraints, design requirements, and supporting technical information before
                  submission.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={document.referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl border border-ink-700/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
                >
                  Open Guidance / Template
                </a>
              </div>
            </div>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink-900">Completion tracking</h2>
                <p className="mt-2 text-sm text-ink-500">
                  Mark this requirement complete once the document is reviewed and ready for
                  submission.
                </p>
                <div className="mt-5">
                  <CompletionCheckbox
                    checked={isCompleted}
                    onChange={(checked) => setDocumentCompleted(documentId, checked)}
                    label={isCompleted ? "Marked complete" : "Mark document as complete"}
                    muted
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-900">Upload document</h2>
                    <p className="mt-2 text-sm text-ink-500">
                      Add the prepared file for this requirement. You can replace it at any time.
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink-700"
                >
                  {upload ? "Replace uploaded file" : "Upload file"}
                </button>

                {upload && (
                  <button
                    onClick={handleRemoveFile}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
                  >
                    Remove File
                  </button>
                )}

                {flashMessage && (
                  <div
                    className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                      upload
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {flashMessage}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink-900">Document status</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
                    <span className="text-ink-500">Completion</span>
                    <span
                      className={
                        isCompleted ? "font-medium text-emerald-700" : "font-medium text-amber-700"
                      }
                    >
                      {isCompleted ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
                    <span className="text-ink-500">Upload</span>
                    <span
                      className={upload ? "font-medium text-sky-700" : "font-medium text-slate-600"}
                    >
                      {upload ? "Uploaded" : "Missing"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-ink-50 px-4 py-3">
                    <div className="text-ink-500">File</div>
                    <div className="mt-1 font-medium text-ink-900">
                      {upload ? upload.fileName : "No file uploaded"}
                    </div>
                  </div>
                  {upload && (
                    <div className="rounded-xl bg-ink-50 px-4 py-3">
                      <div className="text-ink-500">Uploaded</div>
                      <div className="mt-1 font-medium text-ink-900">
                        {new Date(upload.uploadedAt).toLocaleString("en-NZ", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
