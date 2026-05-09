"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DragEvent } from "react";
import type { InspectionSchedule } from "@/lib/inspections";
import {
  type EditableInspectionStatus,
  type InspectionRecord,
  getCurrentInspectionIndex,
  isInspectionResolved,
} from "./model";
import { useInspections } from "./use-inspections";

interface InspectionsPageProps {
  projectId: string;
  schedule: InspectionSchedule;
}

export function InspectionsPage({ projectId, schedule }: InspectionsPageProps) {
  const router = useRouter();
  const { inspections, stats, addManualInspection, reorderManualInspection } =
    useInspections(projectId, schedule);
  const [draggedInspectionId, setDraggedInspectionId] = useState<string | null>(null);
  const currentInspectionIndex = getCurrentInspectionIndex(inspections);
  const nextInspection = inspections[currentInspectionIndex];

  function handleAddManualInspection() {
    const inspection = addManualInspection();
    router.push(`/projects/${projectId}/inspections/${inspection.id}`);
  }

  function handleDragStart(event: DragEvent<HTMLAnchorElement>, inspection: InspectionRecord) {
    if (!inspection.manual || isInspectionResolved(inspection)) {
      event.preventDefault();
      return;
    }

    setDraggedInspectionId(inspection.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", inspection.id);
  }

  function handleDragOver(event: DragEvent<HTMLAnchorElement>) {
    if (!draggedInspectionId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: DragEvent<HTMLAnchorElement>, targetIndex: number) {
    const draggedId = event.dataTransfer.getData("text/plain") || draggedInspectionId;
    if (!draggedId) return;

    event.preventDefault();
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const shouldPlaceAfter = event.clientY > targetBounds.top + targetBounds.height / 2;
    const nextTargetIndex = targetIndex + (shouldPlaceAfter ? 1 : 0);

    reorderManualInspection(draggedId, nextTargetIndex);
    setDraggedInspectionId(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-500">
            Project Workflow
          </p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
              Inspections
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-500">
              Automatically generated BCO hold points for {schedule.profile.toLowerCase()}.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleAddManualInspection}
            className="inline-flex items-center justify-center rounded-xl border border-ink-700/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Add Manual Inspection
          </button>
          {nextInspection && (
            <Link
              href={`/projects/${projectId}/inspections/${nextInspection.id}` as Route}
              className="inline-flex items-center justify-center rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
            >
              Open Current Inspection
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-ink-700/10 bg-gradient-to-br from-white to-slate-50 p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink-500">Inspection Readiness</p>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
                {stats.completed} / {String(stats.total)} Inspections Complete
              </h2>
              <p className="mt-1 text-sm text-ink-500">{schedule.summary}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Required stages" value={String(stats.total)} />
            <MetricCard label="Failed" value={String(stats.failed)} />
            <MetricCard label="Remaining" value={String(stats.remaining)} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="h-3 overflow-hidden rounded-full bg-ink-700/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-ink-500">
            <span>{stats.percent}% complete</span>
            <span>{stats.remaining} inspections still need attention</span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-ink-700/10 bg-white/80 p-5">
          <p className="text-sm font-medium text-ink-900">Next inspection</p>
          <p className="mt-3 text-sm text-ink-600">
            {nextInspection
              ? `${nextInspection.title} is the next inspection to prepare. ${nextInspection.timing}.`
              : "All generated inspections are marked as passed."}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">
            Inspection Stages
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Open each inspection to add booking details, due dates, checklist progress, results, and notes.
          </p>
          {schedule.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-ink-500">
              {schedule.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-4">
          {inspections.map((inspection) => {
            const checkedCount = Object.values(inspection.checklist).filter(Boolean).length;
            const href = `/projects/${projectId}/inspections/${inspection.id}` as Route;
            const index = inspections.findIndex((item) => item.id === inspection.id);
            const isLocked = !inspection.manual && index > currentInspectionIndex;
            const isResolved = isInspectionResolved(inspection);
            const canDrag = inspection.manual && !isResolved;
            const isDragging = draggedInspectionId === inspection.id;

            return (
              <Link
                key={inspection.id}
                href={href}
                draggable={canDrag}
                onDragStart={(event) => handleDragStart(event, inspection)}
                onDragEnd={() => setDraggedInspectionId(null)}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, index)}
                className={[
                  "group relative overflow-hidden rounded-2xl border border-ink-700/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ink-700/20 hover:shadow-md",
                  canDrag ? "cursor-grab active:cursor-grabbing" : "",
                  isDragging ? "opacity-60" : "",
                ].filter(Boolean).join(" ")}
              >
                {isLocked && <div className="pointer-events-none absolute inset-0 bg-slate-200/30" />}
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-ink-900">{inspection.title}</h3>
                      <StatusBadge status={inspection.status} />
                      {isResolved && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          ✓ Done
                        </span>
                      )}
                      {isLocked && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          Locked
                        </span>
                      )}
                      <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500">
                        {inspection.category}
                      </span>
                    </div>
                    <p className="max-w-3xl text-sm text-ink-600">{inspection.timing}</p>
                    <div className="flex flex-wrap gap-2">
                      {inspection.requirements.map((requirement) => (
                        <span
                          key={requirement}
                          className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                        >
                          {requirement}
                        </span>
                      ))}
                    </div>
                  </div>
                  <InspectionSummary
                    inspection={inspection}
                    checkedCount={checkedCount}
                    isLocked={isLocked}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InspectionSummary({
  inspection,
  checkedCount,
  isLocked,
}: {
  inspection: InspectionRecord;
  checkedCount: number;
  isLocked: boolean;
}) {
  return (
    <div className="flex min-w-56 flex-col items-start gap-2 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
      <span className="font-medium text-ink-900">
        {inspection.dueDate ? `Due ${formatDate(inspection.dueDate)}` : "No due date"}
      </span>
      <span>
        {checkedCount}/{inspection.requirements.length} checklist items done
      </span>
      <span className="text-xs text-ink-500/80 group-hover:text-ink-500">
        {isLocked ? "Complete current inspection first" : "View inspection details"}
      </span>
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

export function StatusBadge({ status }: { status: EditableInspectionStatus }) {
  const styles: Record<EditableInspectionStatus, string> = {
    "Not Conducted": "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
    Passed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    Failed: "bg-red-50 text-red-700 ring-1 ring-red-200",
  };
  const labels: Record<EditableInspectionStatus, string> = {
    "Not Conducted": "Not Conducted",
    Passed: "✓ Passed",
    Failed: "✓ Failed",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
