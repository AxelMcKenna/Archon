"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SettingsDeleteProjectButton } from "@/app/settings/project-row-delete";
import { DEFAULT_COUNCIL_SUBMISSION_URL } from "./submission-defaults";
import { formatSubmissionDate, groupDocumentsByCategory } from "./submission-groups";
import { useConsentAssessment } from "./use-consent-assessment";

interface SubmissionPackagePageProps {
  projectId: string;
  address: string;
  submissionId: string;
}

export function SubmissionPackagePage({
  projectId,
  address,
  submissionId,
}: SubmissionPackagePageProps) {
  const router = useRouter();
  const {
    documents,
    uploads,
    completions,
    documentSubmissionIds,
    deleteSubmissionPackage,
    submissionPackageMap,
    updateSubmissionPackageCouncilUrl,
    isLoading,
    error,
  } = useConsentAssessment({
    projectId,
    address,
  });

  const submissionPackage = submissionPackageMap.get(submissionId);
  const submissionDocuments = useMemo(
    () => documents.filter((document) => documentSubmissionIds[document.id] === submissionId),
    [documents, documentSubmissionIds, submissionId],
  );
  const resolvedCouncilUrl = submissionPackage?.councilUrl ?? DEFAULT_COUNCIL_SUBMISSION_URL;
  const categoryGroups = useMemo(
    () => groupDocumentsByCategory(submissionDocuments),
    [submissionDocuments],
  );
  const totalFiles = useMemo(
    () => submissionDocuments.reduce((count, document) => count + (uploads[document.id]?.length ?? 0), 0),
    [submissionDocuments, uploads],
  );

  const [councilUrlInput, setCouncilUrlInput] = useState("");
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setCouncilUrlInput(submissionPackage?.councilUrl ?? "");
  }, [submissionPackage?.councilUrl]);

  function handleCouncilUrlBlur() {
    if ((submissionPackage?.councilUrl ?? "") === councilUrlInput.trim()) {
      return;
    }

    setFlashMessage(null);
    setFormError(null);

    try {
      const updated = updateSubmissionPackageCouncilUrl(submissionId, councilUrlInput);
      if (!updated) {
        setFormError("Submission package not found.");
        return;
      }

      setFlashMessage(councilUrlInput.trim() ? "Council link saved." : "Council link cleared.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save council link.");
    }
  }

  async function handleDeleteSubmission() {
    const deleted = deleteSubmissionPackage(submissionId);
    if (!deleted) {
      setFormError("Unable to delete this submission package.");
      throw new Error("Unable to delete this submission package.");
    }

    router.push(`/projects/${projectId}/application-prep`);
  }

  if (error) {
    return (
      <section className="rounded-sm border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {error}
      </section>
    );
  }

  if (!submissionPackage) {
    return (
      <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {isLoading ? "Loading submission..." : "Submission not available"}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {isLoading
            ? "The submission package is loading."
            : "This submission package could not be found for the current project."}
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-8 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/projects/${projectId}/application-prep` as Route}
          className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          ← Back to Lodgement
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={resolvedCouncilUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-ink-700/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Open Council Submission
          </a>
          <a
            href={`/submissions/${submissionId}/download`}
            className="rounded-sm border border-ink-700/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Download ZIP
          </a>
          <SettingsDeleteProjectButton
            onDelete={handleDeleteSubmission}
            projectLabel={submissionPackage.title}
            title="Delete submission?"
            description={
              <>
                Permanently delete{" "}
                <strong className="text-slate-900">{submissionPackage.title}</strong>? Documents will remain
                available and move back to Unsubmitted Documents.
              </>
            }
            triggerLabel="Delete Submission"
            triggerClassName="rounded-sm border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
          />
        </div>
      </div>

      <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Submission Package</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
              {submissionPackage.title}
            </h1>
            <p className="mt-3 text-sm text-ink-500">
              Created {formatSubmissionDate(submissionPackage.createdAt)} · {submissionDocuments.length} document
              {submissionDocuments.length === 1 ? "" : "s"} · {totalFiles} uploaded file
              {totalFiles === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {submissionPackage.status && (
              <span className="rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
                {submissionPackage.status}
              </span>
            )}
            {submissionPackage.submittedAt && (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                Submitted {formatSubmissionDate(submissionPackage.submittedAt)}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(19rem,0.85fr)]">
        <div className="rounded-sm border border-ink-700/10 bg-surface-raised p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">Submission documents</h2>
          <p className="mt-2 text-sm text-ink-500">
            Categories remain intact inside the submission package.
          </p>

          {categoryGroups.length > 0 ? (
            <div className="mt-6 space-y-5">
              {categoryGroups.map((category) => (
                <section
                  key={category.id}
                  className="rounded-sm border border-ink-700/10 bg-ink-50/80"
                >
                  <div className="flex items-center justify-between border-b border-ink-700/10 px-5 py-4">
                    <h3 className="text-sm font-semibold text-ink-900">{category.label}</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink-500">
                      {category.items.length}
                    </span>
                  </div>
                  <div className="divide-y divide-ink-700/10">
                    {category.items.map((document) => {
                      const fileCount = uploads[document.id]?.length ?? 0;
                      const completed = Boolean(completions[document.id]);

                      return (
                        <div
                          key={document.id}
                          className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <Link
                              href={`/projects/${projectId}/application-prep/${document.id}` as Route}
                              className="text-sm font-medium text-ink-900 hover:text-accent"
                            >
                              {document.title}
                            </Link>
                            <p className="mt-1 text-sm text-ink-500">{document.whyRequired}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                completed
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                              }`}
                            >
                              {completed ? "Complete" : "Incomplete"}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink-500">
                              {fileCount} file{fileCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-sm border border-dashed border-ink-700/20 bg-ink-50 px-5 py-6 text-sm text-ink-500">
              This submission does not have any documents assigned.
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Council Portal</h2>
            <p className="mt-2 text-sm text-ink-500">
              External council tracking page for this submission.
            </p>

            <label className="mt-5 block text-sm font-medium text-ink-900">
              Council Submission Link
            </label>
            <input
              type="url"
              value={councilUrlInput}
              onChange={(event) => {
                setCouncilUrlInput(event.currentTarget.value);
                if (formError) setFormError(null);
                if (flashMessage) setFlashMessage(null);
              }}
              onBlur={handleCouncilUrlBlur}
              placeholder="https://..."
              className="mt-2 w-full rounded-sm border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
            />

            <p className="mt-3 text-xs text-ink-500">
              Changes save automatically when the field loses focus.
            </p>

            {formError && (
              <div className="mt-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {formError}
              </div>
            )}
            {flashMessage && (
              <div className="mt-4 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {flashMessage}
              </div>
            )}
          </section>

          <section className="rounded-sm border border-ink-700/10 bg-surface-raised p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Current link</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="break-all rounded-sm bg-ink-50 px-4 py-3 text-ink-700">
                {resolvedCouncilUrl}
              </p>
              <p className="text-ink-500">
                Opening this link will take you to the external council system in a new tab.
              </p>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
