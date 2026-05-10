"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CompletionCheckbox } from "./completion-checkbox";
import { browserClient } from "./persistence";
import { isManualDocument } from "./model";
import { useConsentAssessment } from "./use-consent-assessment";

interface ConsentDocumentPageProps {
  projectId: string;
  address: string;
  documentId: string;
}

export function ConsentDocumentPage({
  projectId,
  address,
  documentId,
}: ConsentDocumentPageProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supabaseRef = useRef(browserClient());
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const {
    documents,
    uploads,
    completions,
    documentSubmissionIds,
    submissionPackageMap,
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
  });

  const document = documents.find((item) => item.id === documentId);
  const uploadFiles = uploads[documentId] ?? [];
  const latestUpload = uploadFiles[uploadFiles.length - 1];
  const isCompleted = Boolean(completions[documentId]);
  const manual = isManualDocument(document);
  const submissionPackage = submissionPackageMap.get(documentSubmissionIds[documentId] ?? "");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void saveUpload(documentId, file)
      .then(() => setFlashMessage(`${file.name} uploaded successfully.`))
      .catch((error) =>
        setFlashMessage(
          typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message ?? "Upload failed.")
            : "Upload failed.",
        ),
      );
    event.target.value = "";
  }

  function handleRemoveFile(uploadId: string) {
    void removeUpload(documentId, uploadId)
      .then(() => setFlashMessage("Uploaded file removed."))
      .catch((error) =>
        setFlashMessage(
          typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message ?? "Delete failed.")
            : "Delete failed.",
        ),
      );
  }

  function handlePreviewFile(storagePath: string) {
    void supabaseRef.current.storage
      .from("attachments")
      .createSignedUrl(storagePath, 60)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          throw error ?? new Error("Unable to open file.");
        }
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      })
      .catch((error) =>
        setFlashMessage(
          typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message ?? "Preview failed.")
            : "Preview failed.",
        ),
      );
  }

  function handleDeleteDocument() {
    if (!document) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to remove this required document?",
    );
    if (!confirmed) {
      return;
    }

    removeDocument(documentId);
    router.push(`/projects/${projectId}/application-prep`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/projects/${projectId}/application-prep` as Route}
          className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          ← Back to Consent Assessment
        </Link>
        {document && (
          <button
            onClick={handleDeleteDocument}
            className="inline-flex items-center rounded-sm border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            Remove Document
          </button>
        )}
      </div>

      {error && (
        <section className="rounded-sm border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </section>
      )}

      {!document ? (
        <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-8 shadow-sm">
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
              className="mt-6 inline-flex items-center rounded-sm bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
            >
              Generate Consent Requirements
            </button>
          )}
        </section>
      ) : (
        <>
          <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-8 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
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
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">{document.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CompletionBadge completed={isCompleted} />
                <UploadBadge uploaded={uploadFiles.length > 0} />
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(18rem,0.9fr)]">
            <div className="rounded-sm border border-ink-700/10 bg-surface-raised p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Why it is required</h2>
              <p className="mt-3 text-sm leading-6 text-ink-600">{document.whyRequired}</p>

              <div className="mt-6 rounded-sm border border-ink-700/10 bg-ink-50 p-5">
                <h3 className="text-sm font-semibold text-ink-900">NZ consent context</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  This document helps the council assess the proposed work against site constraints,
                  design requirements, and supporting technical information before submission.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={document.referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
                >
                  Open Guidance / Template
                </a>
              </div>
            </div>

            <aside className="space-y-6">
              <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink-900">Completion tracking</h2>
                <p className="mt-2 text-sm text-ink-500">
                  Mark this requirement complete once the document is reviewed and ready for submission.
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

              <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-6 shadow-sm">
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
                  className="mt-5 inline-flex w-full items-center justify-center rounded-sm bg-ink-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink-700"
                >
                  {uploadFiles.length > 0 ? "Upload another file" : "Upload file"}
                </button>

                {uploadFiles.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {uploadFiles.map((upload) => (
                      <div
                        key={upload.id}
                        className="rounded-sm border border-ink-700/10 bg-ink-50 px-4 py-3"
                      >
                        <div className="font-medium text-ink-900">{upload.fileName}</div>
                        <div className="mt-1 text-xs text-ink-500">
                          {new Date(upload.uploadedAt).toLocaleString("en-NZ", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handlePreviewFile(upload.storagePath)}
                            className="rounded-sm border border-ink-700/10 bg-white px-3 py-2 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-50"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => handleRemoveFile(upload.id)}
                            className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {flashMessage && (
                  <div
                    className={`mt-4 rounded-sm px-4 py-3 text-sm ${
                      uploadFiles.length > 0
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {flashMessage}
                  </div>
                )}
              </section>

              <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink-900">Document status</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-sm bg-ink-50 px-4 py-3">
                    <span className="text-ink-500">Submission package</span>
                    <span className="font-medium text-ink-900">
                      {submissionPackage?.title ?? "Unsubmitted"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-sm bg-ink-50 px-4 py-3">
                    <span className="text-ink-500">Completion</span>
                    <span
                      className={isCompleted ? "font-medium text-emerald-700" : "font-medium text-amber-700"}
                    >
                      {isCompleted ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-sm bg-ink-50 px-4 py-3">
                    <span className="text-ink-500">Upload</span>
                    <span className={uploadFiles.length > 0 ? "font-medium text-sky-700" : "font-medium text-slate-600"}>
                      {uploadFiles.length > 0 ? `${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"}` : "Missing"}
                    </span>
                  </div>
                  <div className="rounded-sm bg-ink-50 px-4 py-3">
                    <div className="text-ink-500">Latest file</div>
                    <div className="mt-1 font-medium text-ink-900">
                      {latestUpload ? latestUpload.fileName : "No file uploaded"}
                    </div>
                  </div>
                  {latestUpload && (
                    <div className="rounded-sm bg-ink-50 px-4 py-3">
                      <div className="text-ink-500">Uploaded</div>
                      <div className="mt-1 font-medium text-ink-900">
                        {new Date(latestUpload.uploadedAt).toLocaleString("en-NZ", {
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

function CompletionBadge({ completed }: { completed: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${
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
      className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${
        uploaded
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {uploaded ? "File uploaded" : "No file"}
    </span>
  );
}
