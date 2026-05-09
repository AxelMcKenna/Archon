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

const inputClass =
  "mt-2 w-full rounded-md bg-surface-sunken px-3.5 py-2.5 text-[13px] text-ink-900 outline-none shadow-inset transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500/30 focus:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "block text-[11px] uppercase tracking-[0.22em] text-ink-500";

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
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
        <BackLink projectId={projectId} />
        <section className="rounded-md bg-surface-raised p-6 shadow-depth">
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
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      <BackLink projectId={projectId} />

      <section className="relative overflow-hidden rounded-md bg-surface-raised p-5 shadow-depth">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
              <span className="inline-block h-1 w-1 rounded-full bg-accent" />
              Inspection
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[24px] sm:text-[30px] text-ink-900">
                {inspection.title}
              </h1>
              <StatusBadge status={inspection.status} />
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-600">
              {inspection.timing}
            </p>
          </div>
        </div>
      </section>

      {flashMessage && (
        <section className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200 shadow-depth">
          {flashMessage}
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr),minmax(18rem,0.9fr)]">
        <div className="space-y-5">
          <section className="rounded-md bg-surface-raised p-5 shadow-depth">
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Inspection details</h2>
            <div className="mt-4 grid gap-4">
              {inspection.manual && (
                <>
                  <label className="block">
                    <span className={labelClass}>Inspection type</span>
                    <select
                      value={inspection.inspectionTypeId}
                      onChange={(event) => updateInspectionType(event.target.value)}
                      className={inputClass}
                    >
                      {manualInspectionTypeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={labelClass}>Inspection name</span>
                    <input
                      type="text"
                      value={inspection.title}
                      onChange={(event) => void save({ title: event.target.value }, "Inspection name updated.")}
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Due date</span>
                  <input
                    type="date"
                    value={inspection.dueDate}
                    onChange={(event) => void save({ dueDate: event.target.value }, "Due date updated.")}
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>Booked date</span>
                  <input
                    type="date"
                    value={inspection.bookedDate}
                    onChange={(event) => void save({ bookedDate: event.target.value }, "Booked date updated.")}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block">
                <span className={labelClass}>Booking and site details</span>
                <textarea
                  value={inspection.details}
                  onChange={(event) => void save({ details: event.target.value }, "Inspection details updated.")}
                  rows={5}
                  className={inputClass}
                  placeholder="Add booking reference, inspector name, site contact, access notes, or preparation details."
                />
              </label>
            </div>
          </section>

          <section className="rounded-md bg-surface-raised p-5 shadow-depth">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-base font-semibold tracking-tight text-ink-900">Readiness checklist</h2>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">
                <span className="tabular-nums text-ink-900 font-semibold">{checkedCount}</span>
                <span> / {inspection.requirements.length} ready</span>
              </p>
            </div>

            <div className="mt-4 space-y-1.5">
              {inspection.requirements.map((requirement) => (
                <label
                  key={requirement}
                  className="flex items-start gap-3 rounded-md bg-ink-50 ring-1 ring-ink-200/70 px-3.5 py-2 text-sm transition hover:bg-ink-100/80 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(inspection.checklist[requirement])}
                    onChange={(event) => updateChecklist(requirement, event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-700/30 accent-ink-900"
                  />
                  <span className="text-ink-700 leading-relaxed">{requirement}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-md bg-surface-raised p-5 shadow-depth">
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Result</h2>
            {isResultLocked && (
              <div className="mt-3 rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[12px] text-amber-800">
                Locked until the current inspection is passed or failed.
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {statuses.map((status) => {
                const isActive = inspection.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={isResultLocked}
                    onClick={() => updateStatus(status)}
                    className={[
                      "rounded-md px-2 py-2 text-center text-[12px] font-medium transition shadow-depth cursor-pointer",
                      isActive
                        ? "bg-ink-900 text-white hover:shadow-depth-hover"
                        : "bg-surface-raised text-ink-700 ring-1 ring-ink-200/70 hover:bg-ink-50",
                      isResultLocked ? "cursor-not-allowed opacity-50 hover:shadow-depth" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {status === "Not Conducted" ? "Not Done" : status}
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block">
              <span className={labelClass}>Pass/fail notes</span>
              <textarea
                value={inspection.resultNotes}
                disabled={isResultLocked}
                onChange={(event) => void save({ resultNotes: event.target.value }, "Result notes updated.")}
                rows={4}
                className={inputClass}
                placeholder="Record BCO comments, failed items, remedial work required, or pass evidence."
              />
            </label>

            <div className="mt-5 border-t border-ink-200/70 pt-4">
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Returned inspection PDF</h3>
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
                  className="block w-full text-[13px] text-ink-600 file:mr-4 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-white file:cursor-pointer hover:file:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <p className="mt-2 text-[11px] text-ink-500">
                PDF only. Maximum file size {formatFileSize(MAX_PDF_SIZE_BYTES)}.
              </p>

              <div className="mt-4 space-y-2">
                {inspection.pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-ink-50 ring-1 ring-ink-200/70 px-3 py-2 text-[13px]"
                  >
                    <a
                      href={pdf.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate font-medium text-ink-900 underline-offset-2 hover:underline"
                    >
                      {pdf.name}
                    </a>
                    <div className="flex shrink-0 items-center gap-3 text-[11px] text-ink-500">
                      <span className="tabular-nums">{formatFileSize(pdf.size)}</span>
                      <button
                        type="button"
                        onClick={() => void removePdf(pdf.id)}
                        className="font-medium text-red-700 transition hover:text-red-800 cursor-pointer"
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

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleDeleteInspection}
          className="text-[12px] font-medium text-red-700 transition hover:text-red-800 cursor-pointer"
        >
          Delete inspection
        </button>
      </div>
    </div>
  );
}

function BackLink({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/inspections` as Route}
      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-ink-500 transition-colors hover:text-ink-900"
    >
      <span aria-hidden>←</span> Back to Inspections
    </Link>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
