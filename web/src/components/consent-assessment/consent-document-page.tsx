"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRef, useState } from "react";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const { documents, uploads, isLoading, error, generateChecklist, saveUpload, removeUpload } =
    useConsentAssessment({
      projectId,
      address,
    });

  const document = documents.find((item) => item.id === documentId);
  const upload = uploads[documentId];

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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/projects/${projectId}/consent-assessment` as Route}
          className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          ← Back to Consent Assessment
        </Link>
      </div>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </section>
      )}

      {!document ? (
        <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {isLoading ? "Loading document requirements..." : "Document not available"}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {isLoading
              ? "The consent checklist is being generated for this project."
              : "Generate consent requirements before opening individual document pages."}
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
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
                  {document.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">{document.description}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${
                  upload
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                }`}
              >
                {upload ? "Uploaded" : "Missing"}
              </span>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(18rem,0.9fr)]">
            <div className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Why it is required</h2>
              <p className="mt-3 text-sm leading-6 text-ink-600">{document.whyRequired}</p>

              <div className="mt-6 rounded-xl border border-ink-700/10 bg-ink-50 p-5">
                <h3 className="text-sm font-semibold text-ink-900">NZ consent context</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  This document helps the council assess the proposed work against site constraints,
                  design requirements, and supporting technical information before submission.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={document.templateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl border border-ink-700/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
                >
                  Download Template
                </a>
              </div>
            </div>

            <aside className="space-y-6">
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
                <h2 className="text-lg font-semibold text-ink-900">Upload status</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
                    <span className="text-ink-500">Status</span>
                    <span className={upload ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
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
