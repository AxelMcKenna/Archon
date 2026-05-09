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
} from "./model";
import { useInspections } from "./use-inspections";

interface InspectionsPageProps {
  projectId: string;
  projectAddress: string | null;
  schedule: InspectionSchedule;
  savedRecords: Record<string, InspectionRecord>;
}

const statuses: EditableInspectionStatus[] = ["Passed", "Failed", "Not Conducted"];

export function InspectionsPage({
  projectId,
  projectAddress,
  schedule,
  savedRecords,
}: InspectionsPageProps) {
  const router = useRouter();
  const {
    inspections,
    stats,
    updateInspection,
    addManualInspection,
    reorderInspection,
    deleteInspection,
  } = useInspections(projectId, schedule, savedRecords);
  const [draggedInspectionId, setDraggedInspectionId] = useState<string | null>(null);
  const [expandedInspectionId, setExpandedInspectionId] = useState<string | null>(inspections[0]?.id ?? null);
  const [showScheduleDetails, setShowScheduleDetails] = useState(false);
  const [showInspectionList, setShowInspectionList] = useState(true);
  const suppressCardClickRef = useRef(false);

  function handleAddManualInspection() {
    const inspection = addManualInspection();
    setExpandedInspectionId(inspection.id);
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

  function updateChecklist(inspection: InspectionRecord, requirement: string, checked: boolean) {
    void updateInspection(inspection.id, {
      checklist: {
        ...inspection.checklist,
        [requirement]: checked,
      },
    });
  }

  function updateStatus(inspection: InspectionRecord, status: EditableInspectionStatus) {
    void updateInspection(inspection.id, { status });
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-3">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
            <span className="inline-block h-1 w-1 rounded-full bg-accent" />
            Project Workflow
          </p>
          <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[36px] sm:text-[44px] text-ink-900">
            Inspections
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
            Inspection hold points for {projectAddress ?? "this project"}. Expand a row to update checklist items, dates, and results.
          </p>
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

        {schedule.notes.length > 0 && (
          <div className="mt-6 rounded-md bg-ink-50 ring-1 ring-ink-200/70">
            <button
              type="button"
              onClick={() => setShowScheduleDetails((current) => !current)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-ink-100/70"
            >
              <span>
                <span className="block text-[11px] uppercase tracking-[0.22em] text-ink-500">More details</span>
                <span className="mt-1 block text-sm font-medium text-ink-900">Inspection schedule assumptions</span>
              </span>
              <span aria-hidden className={showScheduleDetails ? "rotate-180 text-ink-500 transition" : "text-ink-500 transition"}>
                ⌄
              </span>
            </button>
            {showScheduleDetails && (
              <ul className="space-y-1 border-t border-ink-200/70 px-4 py-3 text-sm leading-relaxed text-ink-600">
                {schedule.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Schedule</p>
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              Inspection Stages
            </h2>
            <p className="max-w-2xl text-sm text-ink-500 leading-relaxed">
              Use the dropdown rows to keep the schedule compact while editing individual inspections.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddManualInspection}
            className="inline-flex shrink-0 items-center justify-center rounded-sm border border-ink-700/10 bg-surface-raised px-4 py-3 text-sm font-medium text-ink-900 shadow-sm transition-colors hover:bg-ink-50"
          >
            Add Inspection
          </button>
        </div>

        <div className="mb-8 overflow-hidden rounded-md border border-ink-200 bg-surface-raised shadow-depth">
          <button
            type="button"
            onClick={() => setShowInspectionList((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-ink-50"
          >
            <span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-ink-500">Inspection List</span>
              <span className="mt-1 block text-xl font-semibold tracking-tight text-ink-900">View All Inspections</span>
            </span>
            <span
              aria-hidden
              className={[
                "flex h-9 w-9 items-center justify-center rounded-md bg-ink-50 text-lg text-ink-600 ring-1 ring-ink-200 transition",
                showInspectionList ? "rotate-180" : "",
              ].filter(Boolean).join(" ")}
            >
              ⌄
            </span>
          </button>

          {showInspectionList && (
            <div className="grid gap-3 border-t border-ink-200/70 bg-ink-50/40 p-5 pb-7">
              {inspections.map((inspection, index) => {
                const href = `/projects/${projectId}/inspections/${inspection.id}` as Route;
                const isDragging = draggedInspectionId === inspection.id;
                const checkedCount = inspection.requirements.filter((requirement) => inspection.checklist[requirement]).length;
                const isExpanded = expandedInspectionId === inspection.id;

                return (
                  <article
                    key={inspection.id}
                    draggable
                    onDragStart={(event) => handleDragStart(event, inspection)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDrop(event, index)}
                    className={[
                      "overflow-hidden rounded-md bg-surface-raised shadow-depth transition-all hover:shadow-depth-hover active:cursor-grabbing",
                      isExpanded ? "ring-1 ring-accent/30" : "",
                      isDragging ? "opacity-60" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (suppressCardClickRef.current) return;
                        setExpandedInspectionId(isExpanded ? null : inspection.id);
                      }}
                      className="grid w-full grid-cols-1 gap-3 px-4 py-3 text-left transition hover:bg-ink-50 sm:grid-cols-[minmax(0,1fr),auto] sm:items-center"
                    >
                      <span className="min-w-0 space-y-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-ink-900">
                            {inspection.title}
                          </span>
                          <StatusBadge status={inspection.status} />
                          <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500 ring-1 ring-ink-200/70">
                            {inspection.category}
                          </span>
                        </span>
                        <span className="block text-[12px] text-ink-500">
                          Checklist {checkedCount}/{inspection.requirements.length} · Due {inspection.dueDate ? formatDate(inspection.dueDate) : "not scheduled"}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-3 text-[12px] font-medium text-ink-600">
                        <span>{isExpanded ? "Collapse" : "Edit"}</span>
                        <span aria-hidden className={isExpanded ? "rotate-180 transition" : "transition"}>⌄</span>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-ink-200/70 px-4 py-4">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),18rem]">
                          <div className="space-y-4">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Timing</p>
                              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{inspection.timing}</p>
                            </div>

                            <div>
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Checklist</p>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">
                                  <span className="font-semibold text-ink-900 tabular-nums">{checkedCount}</span>
                                  <span> / {inspection.requirements.length}</span>
                                </p>
                              </div>
                              <div className="mt-2 grid gap-1.5">
                                {inspection.requirements.map((requirement) => (
                                  <label
                                    key={requirement}
                                    className="flex items-start gap-3 rounded-md bg-ink-50 px-3 py-2 text-[13px] ring-1 ring-ink-200/70 transition hover:bg-ink-100/80 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(inspection.checklist[requirement])}
                                      onChange={(event) => updateChecklist(inspection, requirement, event.target.checked)}
                                      className="mt-0.5 h-4 w-4 rounded border-ink-700/30 accent-ink-900"
                                    />
                                    <span className="leading-relaxed text-ink-700">{requirement}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <label className="block">
                                <span className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Due</span>
                                <input
                                  type="date"
                                  value={inspection.dueDate}
                                  onChange={(event) => void updateInspection(inspection.id, { dueDate: event.target.value })}
                                  className="mt-1.5 w-full rounded-md bg-surface-sunken px-3 py-2 text-[12px] text-ink-900 outline-none shadow-inset focus:ring-2 focus:ring-brand-500/30"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Booked</span>
                                <input
                                  type="date"
                                  value={inspection.bookedDate}
                                  onChange={(event) => void updateInspection(inspection.id, { bookedDate: event.target.value })}
                                  className="mt-1.5 w-full rounded-md bg-surface-sunken px-3 py-2 text-[12px] text-ink-900 outline-none shadow-inset focus:ring-2 focus:ring-brand-500/30"
                                />
                              </label>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Result</p>
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {statuses.map((status) => {
                                  const isActive = inspection.status === status;
                                  return (
                                    <button
                                      key={status}
                                      type="button"
                                      onClick={() => updateStatus(inspection, status)}
                                      className={[
                                        "rounded-md px-2 py-2 text-center text-[12px] font-medium transition shadow-depth cursor-pointer",
                                        isActive
                                          ? "bg-ink-900 text-white hover:shadow-depth-hover"
                                          : "bg-surface-raised text-ink-700 ring-1 ring-ink-200/70 hover:bg-ink-50",
                                      ].join(" ")}
                                    >
                                      {status === "Not Conducted" ? "Not Done" : status}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-4">
                              <Link
                                href={href}
                                draggable={false}
                                className="inline-flex items-center justify-center rounded-md bg-ink-900 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-ink-700"
                              >
                                Full details
                              </Link>
                              <button
                                type="button"
                                draggable={false}
                                onClick={() => deleteInspection(inspection.id)}
                                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 transition hover:bg-red-100 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
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
