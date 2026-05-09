"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ProjectStage =
  | "ASSESSMENT"
  | "APPLICATION"
  | "RFI"
  | "PROCESSING"
  | "INSPECTION"
  | "CCC";

type FilterValue = "ALL" | "IN_PROGRESS" | "AWAITING_RFIS" | "COMPLETED";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type ProjectStatus =
  | "pre-lodgement"
  | "lodged"
  | "rfi-open"
  | "rfi-responded"
  | "decision-pending"
  | "granted"
  | "declined";

export interface ProjectListItem {
  id: string;
  address: string;
  application_ref: string | null;
  project_type: "new_dwelling" | "extension" | "accessory" | "deck";
  status: ProjectStatus;
  updated_at: string;
  rfi_letters?: Array<{ id: string; status: string }>;
}

interface ProjectCardViewModel {
  id: string;
  name: string;
  address: string;
  stage: ProjectStage;
  progress: number;
  readinessScore: number;
  risk: RiskLevel;
  updatedAt: string;
  openRFIs: number;
  missingDocs: number;
  status: ProjectStatus;
  filterStatus: Exclude<FilterValue, "ALL">;
}

const lifecycle = [
  { key: "ASSESSMENT", label: "Consent Assessment" },
  { key: "APPLICATION", label: "Application Prep" },
  { key: "RFI", label: "RFIs" },
  { key: "PROCESSING", label: "Processing" },
  { key: "INSPECTION", label: "Inspections" },
  { key: "CCC", label: "CCC" },
] as const;

const projectTypeLabels: Record<ProjectListItem["project_type"], string> = {
  new_dwelling: "New Dwelling",
  extension: "Extension",
  accessory: "Accessory Building",
  deck: "Deck",
};

const statusMeta: Record<
  ProjectStatus,
  { stage: ProjectStage; progress: number; readinessScore: number; risk: RiskLevel }
> = {
  "pre-lodgement": {
    stage: "ASSESSMENT",
    progress: 14,
    readinessScore: 38,
    risk: "MEDIUM",
  },
  lodged: {
    stage: "APPLICATION",
    progress: 32,
    readinessScore: 61,
    risk: "LOW",
  },
  "rfi-open": {
    stage: "RFI",
    progress: 48,
    readinessScore: 52,
    risk: "HIGH",
  },
  "rfi-responded": {
    stage: "PROCESSING",
    progress: 66,
    readinessScore: 73,
    risk: "MEDIUM",
  },
  "decision-pending": {
    stage: "PROCESSING",
    progress: 79,
    readinessScore: 82,
    risk: "LOW",
  },
  granted: {
    stage: "CCC",
    progress: 100,
    readinessScore: 96,
    risk: "LOW",
  },
  declined: {
    stage: "CCC",
    progress: 100,
    readinessScore: 24,
    risk: "HIGH",
  },
};

const filterOptions: Array<{ value: FilterValue; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "AWAITING_RFIS", label: "Awaiting RFIs" },
  { value: "COMPLETED", label: "Completed" },
];

export function ProjectsPageClient({ projects }: { projects: ProjectListItem[] }) {
  const [filter, setFilter] = useState<FilterValue>("ALL");

  const uniqueProjects = useMemo(
    () => Array.from(new Map(projects.map((project) => [project.id, project])).values()),
    [projects],
  );
  const cards = useMemo(() => uniqueProjects.map(mapProjectToCard), [uniqueProjects]);

  const filteredCards = useMemo(() => {
    return cards.filter((project) => {
      return filter === "ALL" || project.filterStatus === filter;
    });
  }, [cards, filter]);

  return (
    <div className="min-h-full">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-8 py-10">
        <section className="overflow-hidden rounded-md bg-surface-raised shadow-depth">
          <div className="relative border-b border-ink-900/[0.06] bg-surface-raised px-6 py-8 sm:px-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent/40"
            />
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
                  <span className="inline-block h-1 w-1 rounded-full bg-accent" />
                  Atlas Portfolio
                </p>
                <div className="space-y-2">
                  <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[44px] text-ink-900 sm:text-[56px]">
                    Projects
                  </h1>
                  <p className="text-sm leading-6 text-ink-500 sm:text-[15px]">
                    Central command for active building consent applications, readiness,
                    and lifecycle progress across the NZ approval journey.
                  </p>
                </div>
              </div>
              <Link
                href="/projects/new"
                className="inline-flex items-center justify-center rounded-md bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-depth transition-all hover:bg-ink-700 hover:shadow-depth-hover cursor-pointer"
              >
                + New Project
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-end">
            <label className="relative block w-full sm:w-[220px]">
              <span className="sr-only">Filter projects</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as FilterValue)}
                className="w-full appearance-none rounded-md bg-surface-sunken px-4 py-2.5 pr-10 text-[13px] text-ink-900 outline-none transition shadow-inset focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m6 9 6 6 6-6"
                />
              </svg>
            </label>
          </div>
        </section>

        {!cards.length ? (
          <EmptyState />
        ) : !filteredCards.length ? (
          <section className="rounded-md border border-dashed border-ink-900/[0.10] bg-white/60 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-ink-900">No matching projects</p>
            <p className="mt-2 text-sm text-ink-500">
              Try a different filter to see more consent applications.
            </p>
          </section>
        ) : (
          <section className="grid gap-5 xl:grid-cols-2">
            {filteredCards.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectCardViewModel }) {
  const updatedLabel = formatUpdatedAt(project.updatedAt);
  const riskClasses = getRiskClasses(project.risk);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative block overflow-hidden rounded-md bg-surface-raised p-5 shadow-depth transition-shadow duration-200 hover:shadow-depth-hover cursor-pointer"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-accent opacity-60 transition-opacity group-hover:opacity-100"
      />
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
                <span className="h-1 w-1 rounded-full bg-accent" />
                {getStageLabel(project.stage)}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] font-medium ${riskClasses}`}>
                Risk · {capitalize(project.risk)}
              </span>
            </div>
            <h2 className="mt-2.5 text-[17px] font-semibold tracking-[-0.015em] text-ink-900 transition group-hover:text-accent">
              {project.name}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-500 truncate">{project.address}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Progress</p>
            <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-ink-900">{project.progress}%</p>
          </div>
        </div>

        <div className="relative h-1 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-ink-500">
          <span className="tabular-nums">
            <span className="text-ink-900 font-medium">{project.openRFIs}</span> open RFIs
            <span className="mx-2 text-ink-300">·</span>
            <span className="text-ink-900 font-medium">{project.missingDocs}</span> missing docs
          </span>
          <span className="tabular-nums">{updatedLabel}</span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <section className="overflow-hidden rounded-md bg-surface-raised px-6 py-16 text-center shadow-depth">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-50 text-ink-500 shadow-inset">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3.75 7.5A2.25 2.25 0 0 1 6 5.25h12A2.25 2.25 0 0 1 20.25 7.5v9A2.25 2.25 0 0 1 18 18.75H6A2.25 2.25 0 0 1 3.75 16.5v-9ZM8.25 9.75h7.5m-7.5 4.5h4.5"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-ink-900">
          No projects yet
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink-500">
          Start a consent application workspace to track lifecycle progress, RFIs,
          and readiness in one place.
        </p>
        <Link
          href="/projects/new"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-depth transition-all hover:bg-ink-700 hover:shadow-depth-hover cursor-pointer"
        >
          + Create your first project
        </Link>
      </div>
    </section>
  );
}

function mapProjectToCard(project: ProjectListItem): ProjectCardViewModel {
  const meta = statusMeta[project.status] ?? statusMeta["pre-lodgement"];
  const letters = project.rfi_letters ?? [];
  const openRFIs = letters.filter((letter) => letter.status !== "drafted").length;
  const missingDocs = estimateMissingDocs(meta.stage, openRFIs);
  const readinessScore = clamp(meta.readinessScore - openRFIs * 4 - missingDocs * 2, 0, 100);
  const progress =
    meta.stage === "CCC" && project.status !== "declined" ? 100 : clamp(meta.progress, 0, 100);
  const risk = getRiskLevel(project.status, openRFIs, missingDocs);

  return {
    id: project.id,
    name: getProjectName(project),
    address: project.address,
    stage: meta.stage,
    progress,
    readinessScore,
    risk,
    updatedAt: project.updated_at,
    openRFIs,
    missingDocs,
    status: project.status,
    filterStatus: getFilterStatus(project.status, openRFIs),
  };
}

function getProjectName(project: ProjectListItem) {
  if (project.application_ref?.trim()) return project.application_ref.trim();
  return `${projectTypeLabels[project.project_type]} Consent`;
}

function getFilterStatus(
  status: ProjectStatus,
  openRFIs: number,
): Exclude<FilterValue, "ALL"> {
  if (status === "declined") return "COMPLETED";
  if (status === "granted") return "COMPLETED";
  if (openRFIs > 0 || status === "rfi-open") return "AWAITING_RFIS";
  return "IN_PROGRESS";
}

function getRiskLevel(status: ProjectStatus, openRFIs: number, missingDocs: number): RiskLevel {
  if (status === "declined") return "HIGH";
  if (openRFIs >= 2 || missingDocs >= 4 || status === "rfi-open") return "HIGH";
  if (openRFIs === 1 || missingDocs >= 2 || status === "pre-lodgement") return "MEDIUM";
  return "LOW";
}

function estimateMissingDocs(stage: ProjectStage, openRFIs: number) {
  const baseByStage: Record<ProjectStage, number> = {
    ASSESSMENT: 4,
    APPLICATION: 2,
    RFI: 3,
    PROCESSING: 1,
    INSPECTION: 1,
    CCC: 0,
  };

  return clamp(baseByStage[stage] + Math.min(openRFIs, 2), 0, 6);
}

function getStageLabel(stage: ProjectStage) {
  return lifecycle.find((item) => item.key === stage)?.label ?? stage;
}

function getRiskClasses(risk: RiskLevel) {
  if (risk === "HIGH") return "bg-red-50 text-red-700 before:bg-red-500";
  if (risk === "MEDIUM") return "bg-amber-50 text-amber-700 before:bg-amber-500";
  return "bg-emerald-50 text-emerald-700 before:bg-emerald-500";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function capitalize(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
