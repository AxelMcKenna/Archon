"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MANUAL_INSPECTION_TYPE_ID,
  getInspectionTypeDefinition,
  manualInspectionTypeOptions,
  type InspectionSchedule,
} from "@/lib/inspections";
import { type EditableInspectionStatus, type InspectionRecord, getCurrentInspectionIndex } from "./model";
import { StatusBadge } from "./inspections-page";
import { useInspections } from "./use-inspections";

interface InspectionDetailPageProps {
  projectId: string;
  inspectionId: string;
  schedule: InspectionSchedule;
  savedRecords: Record<string, InspectionRecord>;
}

const statuses: EditableInspectionStatus[] = ["Passed", "Failed", "Not Conducted"];
const MAX_PDF_SIZE_BYTES = 2 * 1024 * 1024;

export function InspectionDetailPage({
  projectId,
  inspectionId,
  schedule,
  savedRecords,
}: InspectionDetailPageProps) {
  const router = useRouter();
  const { inspections, updateInspection, deleteInspection, uploadInspectionPdf, removeInspectionPdf } =
    useInspections(projectId, schedule, savedRecords);
  const inspection = inspections.find((item) => item.id === inspectionId);
  const inspectionIndex = inspections.findIndex((item) => item.id === inspectionId);
  const currentInspectionIndex = getCurrentInspectionIndex(inspections);
  const isResultLocked = inspection ? !inspection.manual && inspectionIndex > currentInspectionIndex : false;
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const checkedCount = useMemo(
    () => Object.values(inspection?.checklist ?? {}).filter(Boolean).length,
    [inspection?.checklist],
  );

  if (!inspection) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <BackLink projectId={projectId} />
        <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Inspection not available
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Return to inspections and open one of the generated hold points.
          </p>
        </section>
      </div>
    );
  }

  async function save(update: Parameters<typeof updateInspection>[1], message = "Inspection updated.") {
    const persisted = await updateInspection(inspectionId, update);
    setFlashMessage(persisted ? message : "Inspection updated locally, but database save failed.");
    if (persisted) {
      router.refresh();
    }
  }

  function updateChecklist(requirement: string, checked: boolean) {
    if (!inspection) return;
    void save(
      {
        checklist: {
          ...inspection.checklist,
          [requirement]: checked,
        },
      },
      "Checklist updated.",
    );
  }

  function updateStatus(status: EditableInspectionStatus) {
    if (isResultLocked) {
      setFlashMessage("Complete the current inspection before setting the result for this one.");
      return;
    }

    void save(
      { status },
      status === "Failed"
        ? "Inspection marked failed. A rescheduled follow-up has been added to the inspection list."
        : "Inspection status updated.",
    );
  }

  function updateInspectionType(inspectionTypeId: string) {
    if (!inspection) return;

    const inspectionType = getInspectionTypeDefinition(inspectionTypeId);
    if (!inspectionType) {
      void save(
        {
          inspectionTypeId: MANUAL_INSPECTION_TYPE_ID,
          category: "Manual",
          timing: "User-added inspection",
          requirements: ["Confirm inspection scope"],
          checklist: { "Confirm inspection scope": false },
        },
        "Inspection type updated.",
      );
      return;
    }

    void save(
      {
        inspectionTypeId: inspectionType.id,
        title: inspectionType.title,
        category: inspectionType.category,
        timing: inspectionType.timing,
        requirements: inspectionType.requirements,
        checklist: Object.fromEntries(inspectionType.requirements.map((requirement) => [requirement, false])),
      },
      "Inspection type updated.",
    );
  }

  function handleDeleteInspection() {
    deleteInspection(inspectionId);
    router.push(`/projects/${projectId}/inspections`);
  }

  async function uploadPdf(file: File | undefined) {
    if (!inspection || !file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFlashMessage("Upload a PDF file.");
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setFlashMessage(`PDF must be ${formatFileSize(MAX_PDF_SIZE_BYTES)} or smaller.`);
      return;
    }

    try {
      await uploadInspectionPdf(inspectionId, file);
      setFlashMessage("PDF uploaded.");
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "PDF upload failed.");
    }
  }

  async function removePdf(pdfId: string) {
    try {
      await removeInspectionPdf(inspectionId, pdfId);
      setFlashMessage("PDF removed.");
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "PDF remove failed.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <BackLink projectId={projectId} />

      <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-500">
              Inspection
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
              {inspection.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
              {inspection.timing}
            </p>
          </div>
          <StatusBadge status={inspection.status} />
        </div>
      </section>

      {flashMessage && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {flashMessage}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(18rem,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Inspection details</h2>
            <div className="mt-5 grid gap-4">
              {inspection.manual && (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-ink-500">Inspection type</span>
                  <select
                      value={inspection.inspectionTypeId}
                      onChange={(event) => updateInspectionType(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                    >
                      {manualInspectionTypeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-ink-500">Inspection name</span>
                    <input
                      type="text"
                      value={inspection.title}
                      onChange={(event) => void save({ title: event.target.value }, "Inspection name updated.")}
                      className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="text-sm font-medium text-ink-500">Due date</span>
                <input
                  type="date"
                  value={inspection.dueDate}
                  onChange={(event) => void save({ dueDate: event.target.value }, "Due date updated.")}
                  className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink-500">Booked date</span>
                <input
                  type="date"
                  value={inspection.bookedDate}
                  onChange={(event) => void save({ bookedDate: event.target.value }, "Booked date updated.")}
                  className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink-500">Booking and site details</span>
                <textarea
                  value={inspection.details}
                  onChange={(event) => void save({ details: event.target.value }, "Inspection details updated.")}
                  rows={5}
                  className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                  placeholder="Add booking reference, inspector name, site contact, access notes, or preparation details."
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Readiness checklist</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {checkedCount}/{inspection.requirements.length} items marked ready.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {inspection.requirements.map((requirement) => (
                <label
                  key={requirement}
                  className="flex items-start gap-3 rounded-xl border border-ink-700/10 bg-ink-50 px-4 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(inspection.checklist[requirement])}
                    onChange={(event) => updateChecklist(requirement, event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-ink-700/30"
                  />
                  <span className="text-ink-700">{requirement}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Result</h2>
            <p className="mt-2 text-sm text-ink-500">
              Mark the outcome after the BCO inspection. Failed inspections create a follow-up.
            </p>
            {(inspection.status === "Passed" || inspection.status === "Failed") && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                ✓ Inspection result recorded
              </div>
            )}
            {isResultLocked && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This inspection is locked until the current inspection is passed or failed.
              </div>
            )}

            <div className="mt-5 grid gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isResultLocked}
                  onClick={() => updateStatus(status)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                    inspection.status === status
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-700/10 bg-white text-ink-700 hover:bg-ink-50"
                  } ${isResultLocked ? "cursor-not-allowed opacity-50 hover:bg-white" : ""}`}
                >
                  {status}
                </button>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-ink-500">Pass/fail notes</span>
              <textarea
                value={inspection.resultNotes}
                disabled={isResultLocked}
                onChange={(event) => void save({ resultNotes: event.target.value }, "Result notes updated.")}
                rows={5}
                className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500"
                placeholder="Record BCO comments, failed items, remedial work required, or pass evidence."
              />
            </label>

            <div className="mt-6 border-t border-ink-700/10 pt-5">
              <h3 className="text-sm font-semibold text-ink-900">Returned inspection PDF</h3>
              <label className="mt-3 block">
                <span className="sr-only">Upload returned inspection PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={isResultLocked}
                  onChange={(event) => {
                    void uploadPdf(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                  className="block w-full text-sm text-ink-600 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <p className="mt-2 text-xs text-ink-500">
                PDF only. Maximum file size {formatFileSize(MAX_PDF_SIZE_BYTES)}.
              </p>

              <div className="mt-4 space-y-2">
                {inspection.pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-700/10 bg-ink-50 px-3 py-2 text-sm"
                  >
                    <a
                      href={pdf.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate font-medium text-ink-900 underline-offset-2 hover:underline"
                    >
                      {pdf.name}
                    </a>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-ink-500">
                      <span>{formatFileSize(pdf.size)}</span>
                      <button
                        type="button"
                        onClick={() => void removePdf(pdf.id)}
                        className="font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {inspection.pdfs.length === 0 && (
                  <p className="text-sm text-ink-500">No returned PDFs uploaded.</p>
                )}
              </div>
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <button
          type="button"
          onClick={handleDeleteInspection}
          className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          Delete Inspection
        </button>
      </section>
    </div>
  );
}

function BackLink({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/inspections` as Route}
      className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
    >
      Back to Inspections
    </Link>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
