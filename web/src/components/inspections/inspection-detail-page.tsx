"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { InspectionSchedule } from "@/lib/inspections";
import { type EditableInspectionStatus, getCurrentInspectionIndex } from "./model";
import { StatusBadge } from "./inspections-page";
import { useInspections } from "./use-inspections";

interface InspectionDetailPageProps {
  projectId: string;
  inspectionId: string;
  schedule: InspectionSchedule;
}

const statuses: EditableInspectionStatus[] = [
  "Not booked",
  "Booked",
  "Passed",
  "Failed",
  "Rescheduled",
];

export function InspectionDetailPage({
  projectId,
  inspectionId,
  schedule,
}: InspectionDetailPageProps) {
  const { inspections, updateInspection } = useInspections(projectId, schedule);
  const inspection = inspections.find((item) => item.id === inspectionId);
  const inspectionIndex = inspections.findIndex((item) => item.id === inspectionId);
  const currentInspectionIndex = getCurrentInspectionIndex(inspections);
  const isResultLocked = inspectionIndex > currentInspectionIndex;
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

  function save(update: Parameters<typeof updateInspection>[1], message = "Inspection updated.") {
    updateInspection(inspectionId, update);
    setFlashMessage(message);
  }

  function updateChecklist(requirement: string, checked: boolean) {
    if (!inspection) return;
    save(
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

    save(
      { status },
      status === "Failed"
        ? "Inspection marked failed. A rescheduled follow-up has been added to the inspection list."
        : "Inspection status updated.",
    );
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
                <label className="block">
                  <span className="text-sm font-medium text-ink-500">Inspection name</span>
                  <input
                    type="text"
                    value={inspection.title}
                    onChange={(event) => save({ title: event.target.value }, "Inspection name updated.")}
                    className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-sm font-medium text-ink-500">Due date</span>
                <input
                  type="date"
                  value={inspection.dueDate}
                  onChange={(event) => save({ dueDate: event.target.value }, "Due date updated.")}
                  className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink-500">Booking and site details</span>
                <textarea
                  value={inspection.details}
                  onChange={(event) => save({ details: event.target.value }, "Inspection details updated.")}
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
              Mark the outcome after the BCO inspection. Failed inspections create a rescheduled follow-up.
            </p>
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
                onChange={(event) => save({ resultNotes: event.target.value }, "Result notes updated.")}
                rows={5}
                className="mt-1 w-full rounded-xl border border-ink-700/20 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500"
                placeholder="Record BCO comments, failed items, remedial work required, or pass evidence."
              />
            </label>
          </section>

          <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Inspection summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Category" value={inspection.category} />
              <SummaryRow label="Due date" value={inspection.dueDate || "Not set"} />
              <SummaryRow label="Checklist" value={`${checkedCount}/${inspection.requirements.length} ready`} />
              {isResultLocked && <SummaryRow label="Sequence" value="Waiting for current inspection" />}
              {inspection.rescheduledFrom && <SummaryRow label="Rescheduled from" value="Failed inspection" />}
            </div>
          </section>
        </aside>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-4 py-3">
      <div className="text-ink-500">{label}</div>
      <div className="mt-1 font-medium text-ink-900">{value}</div>
    </div>
  );
}
