"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  const { inspections, stats, addManualInspection, reorderInspection, deleteInspection } =
    useInspections(projectId, schedule);
  const [draggedInspectionId, setDraggedInspectionId] = useState<string | null>(null);
  const suppressCardClickRef = useRef(false);
  const currentInspectionIndex = getCurrentInspectionIndex(inspections);
  const nextInspection = inspections[currentInspectionIndex];

  function handleAddManualInspection() {
    const inspection = addManualInspection();
    router.push(`/projects/${projectId}/inspections/${inspection.id}`);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, inspection: InspectionRecord) {
    const cardBounds = event.currentTarget.getBoundingClientRect();

    suppressCardClickRef.current = true;
    setDraggedInspectionId(inspection.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", inspection.id);
    event.dataTransfer.setDragImage(
      event.currentTarget,
      event.clientX - cardBounds.left,
      event.clientY - cardBounds.top,
    );
  }

  function handleDragEnd() {
    setDraggedInspectionId(null);
    window.setTimeout(() => {
      suppressCardClickRef.current = false;
    }, 150);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedInspectionId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetIndex: number) {
    const draggedId = event.dataTransfer.getData("text/plain") || draggedInspectionId;
    if (!draggedId) return;

    event.preventDefault();
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const shouldPlaceAfter = event.clientY > targetBounds.top + targetBounds.height / 2;
    const nextTargetIndex = targetIndex + (shouldPlaceAfter ? 1 : 0);

    reorderInspection(draggedId, nextTargetIndex);
    setDraggedInspectionId(null);
  }

  function showCurrentInspection() {
    if (!nextInspection) return;

    document.getElementById(getInspectionCardId(nextInspection.id))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
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
            Add Inspection
          </button>
          {nextInspection && (
            <button
              type="button"
              onClick={showCurrentInspection}
              className="inline-flex items-center justify-center rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
            >
              Show Current Inspection
            </button>
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
              : "All inspections are complete."}
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
            const href = `/projects/${projectId}/inspections/${inspection.id}` as Route;
            const index = inspections.findIndex((item) => item.id === inspection.id);
            const isLocked = !inspection.manual && index > currentInspectionIndex;
            const isResolved = isInspectionResolved(inspection);
            const isCurrent = inspection.id === nextInspection?.id;
            const isDragging = draggedInspectionId === inspection.id;

            return (
              <article
                key={inspection.id}
                id={getInspectionCardId(inspection.id)}
                draggable
                onClick={(event) => {
                  if (suppressCardClickRef.current) return;

                  const target = event.target as HTMLElement;
                  if (target.closest("a, button")) return;

                  router.push(href);
                }}
                onDragStart={(event) => handleDragStart(event, inspection)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, index)}
                className={[
                  "group relative cursor-pointer overflow-hidden rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ink-700/20 hover:shadow-md active:cursor-grabbing",
                  isLocked ? "bg-slate-50" : "bg-white",
                  isCurrent ? "border-accent ring-2 ring-accent/20" : "border-ink-700/10",
                  isDragging ? "opacity-60" : "",
                ].filter(Boolean).join(" ")}
              >
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                  <Link
                    href={href}
                    draggable={false}
                    onClick={(event) => {
                      if (!suppressCardClickRef.current) return;

                      event.preventDefault();
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={[
                            "text-lg font-semibold transition-colors group-hover:text-accent",
                            isLocked ? "text-slate-500" : "text-ink-900",
                          ].filter(Boolean).join(" ")}
                        >
                          {inspection.title}
                        </span>
                        <StatusBadge status={inspection.status} />
                        {isCurrent && (
                          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-accent/20">
                            Current
                          </span>
                        )}
                        {isResolved && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            ✓ Done
                          </span>
                        )}
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            isLocked ? "bg-slate-100 text-slate-500" : "bg-ink-50 text-ink-500",
                          ].filter(Boolean).join(" ")}
                        >
                          {inspection.category}
                        </span>
                      </div>
                      <p className={["max-w-3xl text-sm", isLocked ? "text-slate-500" : "text-ink-600"].join(" ")}>
                        {inspection.timing}
                      </p>
                    </div>
                    <InspectionSummary inspection={inspection} isLocked={isLocked} />
                  </Link>
                  <div className="flex items-center gap-3 lg:pl-1">
                    <button
                      type="button"
                      draggable={false}
                      onClick={() => deleteInspection(inspection.id)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InspectionSummary({
  inspection,
  isLocked,
}: {
  inspection: InspectionRecord;
  isLocked: boolean;
}) {
  return (
    <div
      className={[
        "flex min-w-56 flex-col items-start gap-3 rounded-xl px-4 py-3 text-sm",
        isLocked ? "bg-slate-100 text-slate-500" : "bg-ink-50 text-ink-500",
      ].filter(Boolean).join(" ")}
    >
      <span className={["font-medium", isLocked ? "text-slate-600" : "text-ink-900"].join(" ")}>
        {inspection.dueDate ? `Due ${formatDate(inspection.dueDate)}` : "No due date"}
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

function getInspectionCardId(inspectionId: string) {
  return `inspection-card-${inspectionId}`;
}
