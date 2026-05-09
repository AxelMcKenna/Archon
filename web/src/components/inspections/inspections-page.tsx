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
  projectAddress: string | null;
  schedule: InspectionSchedule;
  savedRecords: Record<string, InspectionRecord>;
}

export function InspectionsPage({
  projectId,
  projectAddress,
  schedule,
  savedRecords,
}: InspectionsPageProps) {
  const router = useRouter();
  const { inspections, stats, addManualInspection, reorderInspection, deleteInspection } =
    useInspections(projectId, schedule, savedRecords);
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
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
            <span className="inline-block h-1 w-1 rounded-full bg-accent" />
            Project Workflow
          </p>
          <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[36px] sm:text-[44px] text-ink-900">
            Inspections
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
            Inspection hold points for {projectAddress ?? "this project"}. Drag to reorder, open a stage to record results.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleAddManualInspection}
            className="inline-flex items-center justify-center rounded-md border border-ink-200 bg-surface-raised px-4 py-2.5 text-[13px] font-medium text-ink-900 shadow-depth transition hover:bg-ink-50 cursor-pointer"
          >
            Add Inspection
          </button>
          {nextInspection && (
            <button
              type="button"
              onClick={showCurrentInspection}
              className="inline-flex items-center justify-center rounded-md bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-depth transition-all hover:bg-ink-700 hover:shadow-depth-hover cursor-pointer"
            >
              Show Current Inspection
            </button>
          )}
        </div>
      </header>

      <section className="relative overflow-hidden rounded-md bg-surface-raised p-6 shadow-depth">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Inspection Readiness</p>
            <h2 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[28px] sm:text-[32px] text-ink-900">
              {stats.completed} / {String(stats.total)} Complete
            </h2>
            <p className="text-sm text-ink-500 leading-relaxed">{schedule.summary}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Required stages" value={String(stats.total)} />
            <MetricCard label="Failed" value={String(stats.failed)} />
            <MetricCard label="Remaining" value={String(stats.remaining)} />
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-ink-100 shadow-inset">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-ink-500">
            <span className="tabular-nums text-ink-900">{stats.percent}% complete</span>
            <span>{stats.remaining} still need attention</span>
          </div>
        </div>

        <div className="mt-6 rounded-md bg-ink-50 ring-1 ring-ink-200/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Next inspection</p>
          <p className="mt-2 text-sm text-ink-700 leading-relaxed">
            {nextInspection
              ? `${nextInspection.title} is the next inspection to prepare. ${nextInspection.timing}.`
              : "All inspections are complete."}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Schedule</p>
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">
            Inspection Stages
          </h2>
          <p className="text-sm text-ink-500 leading-relaxed">
            Open each inspection to add booking details, due dates, checklist progress, results, and notes.
          </p>
          {schedule.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-ink-500">
              {schedule.notes.map((note) => (
                <li key={note}>• {note}</li>
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
                  "group relative cursor-pointer overflow-hidden rounded-md p-5 shadow-depth transition-all hover:shadow-depth-hover active:cursor-grabbing",
                  isLocked ? "bg-ink-50" : "bg-surface-raised",
                  isCurrent ? "ring-2 ring-accent/40" : "",
                  isDragging ? "opacity-60" : "",
                ].filter(Boolean).join(" ")}
              >
                <span
                  aria-hidden
                  className={[
                    "pointer-events-none absolute inset-x-0 top-0 h-[2px]",
                    isCurrent ? "bg-accent" : "bg-accent/30",
                  ].join(" ")}
                />
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                  <Link
                    href={href}
                    draggable={false}
                    onClick={(event) => {
                      if (!suppressCardClickRef.current) return;

                      event.preventDefault();
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-4 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "text-[19px] font-semibold tracking-[-0.015em] transition-colors group-hover:text-accent",
                            isLocked ? "text-ink-500" : "text-ink-900",
                          ].filter(Boolean).join(" ")}
                        >
                          {inspection.title}
                        </span>
                        <StatusBadge status={inspection.status} />
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
                            <span className="h-1 w-1 rounded-full bg-accent" />
                            Current
                          </span>
                        )}
                        {isResolved && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-700 ring-1 ring-emerald-200">
                            Done
                          </span>
                        )}
                        <span
                          className={[
                            "rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ring-1",
                            isLocked
                              ? "bg-ink-100 text-ink-500 ring-ink-200/70"
                              : "bg-ink-50 text-ink-500 ring-ink-200/70",
                          ].filter(Boolean).join(" ")}
                        >
                          {inspection.category}
                        </span>
                      </div>
                      <p className={["max-w-3xl text-[13px] leading-relaxed", isLocked ? "text-ink-500" : "text-ink-600"].join(" ")}>
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
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-700 transition hover:bg-red-100 cursor-pointer"
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
        "flex min-w-56 flex-col items-start gap-1 rounded-md px-4 py-3 text-sm ring-1",
        isLocked
          ? "bg-ink-100 text-ink-500 ring-ink-200/70"
          : "bg-ink-50 text-ink-500 ring-ink-200/70",
      ].filter(Boolean).join(" ")}
    >
      <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Due</span>
      <span className={["text-sm font-semibold tabular-nums", isLocked ? "text-ink-700" : "text-ink-900"].join(" ")}>
        {inspection.dueDate ? formatDate(inspection.dueDate) : "Not scheduled"}
      </span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-raised px-3.5 py-2.5 shadow-depth">
      <p className="text-[10px] uppercase tracking-[0.22em] text-ink-500">{label}</p>
      <p className="mt-1 text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-ink-900">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: EditableInspectionStatus }) {
  const styles: Record<EditableInspectionStatus, string> = {
    "Not Conducted": "bg-ink-50 text-ink-700 ring-ink-200/70",
    Passed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Failed: "bg-red-50 text-red-700 ring-red-200",
  };
  const labels: Record<EditableInspectionStatus, string> = {
    "Not Conducted": "Not Conducted",
    Passed: "Passed",
    Failed: "Failed",
  };

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ring-1 ${styles[status]}`}>
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
