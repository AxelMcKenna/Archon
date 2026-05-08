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

const stageIndex: Record<ProjectStage, number> = {
  ASSESSMENT: 0,
  APPLICATION: 1,
  RFI: 2,
  PROCESSING: 3,
  INSPECTION: 4,
  CCC: 5,
};

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("ALL");

  const uniqueProjects = useMemo(
    () => Array.from(new Map(projects.map((project) => [project.id, project])).values()),
    [projects],
  );
  const cards = useMemo(() => uniqueProjects.map(mapProjectToCard), [uniqueProjects]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return cards.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.address.toLowerCase().includes(normalizedQuery);

      const matchesFilter = filter === "ALL" || project.filterStatus === filter;
      return matchesQuery && matchesFilter;
    });
  }, [cards, filter, query]);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-100/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.15),_transparent_35%),linear-gradient(135deg,#ffffff_0%,#f8fafc_50%,#eff6ff_100%)] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  ConsentIQ Portfolio
                </p>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Projects
                  </h1>
                  <p className="text-sm leading-6 text-slate-600 sm:text-base">
                    Central command for active building consent applications, readiness,
                    and lifecycle progress across the NZ approval journey.
                  </p>
                </div>
              </div>
              <Link
                href="/projects/new"
                className="inline-flex items-center justify-center rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-700"
              >
                New Project
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="relative block">
                <span className="sr-only">Search projects</span>
                <svg
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by project name or address"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10"
                />
              </label>

              <label className="relative block">
                <span className="sr-only">Filter projects</span>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as FilterValue)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                >
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
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

            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {filteredCards.length} {filteredCards.length === 1 ? "project" : "projects"}
            </div>
          </div>
        </section>

        {!cards.length ? (
          <EmptyState />
        ) : !filteredCards.length ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">No matching projects</p>
            <p className="mt-2 text-sm text-slate-500">
              Try adjusting your search or filter to see more consent applications.
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
      className="group block rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/80"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                {getStageLabel(project.stage)}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClasses}`}>
                Risk {capitalize(project.risk)}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950 transition group-hover:text-accent">
                {project.name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{project.address}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
            <MetricTile label="Readiness" value={`${project.readinessScore}%`} tone="blue" />
            <MetricTile label="Progress" value={`${project.progress}%`} tone="slate" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Consent progress</span>
            <span>{project.progress}% complete</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        <LifecycleBar stage={project.stage} />

        <div className="grid gap-3 sm:grid-cols-3">
          <ProjectStat
            label="Open RFIs"
            value={String(project.openRFIs)}
            hint={project.openRFIs > 0 ? "Requires response planning" : "No active requests"}
          />
          <ProjectStat
            label="Missing docs"
            value={String(project.missingDocs)}
            hint={project.missingDocs > 0 ? "Likely to impact readiness" : "Document set on track"}
          />
          <ProjectStat label="Last updated" value={updatedLabel} hint="Latest activity timestamp" />
        </div>
      </div>
    </Link>
  );
}

function LifecycleBar({ stage }: { stage: ProjectStage }) {
  const currentIndex = stageIndex[stage];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap gap-3">
        {lifecycle.map((item, index) => {
          const state =
            index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

          return (
            <div key={item.key} className="flex min-w-[120px] flex-1 items-center gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  state === "complete"
                    ? "border-emerald-200 bg-emerald-500 text-white"
                    : state === "current"
                      ? "border-blue-200 bg-blue-600 text-white shadow-sm shadow-blue-200"
                      : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {index + 1}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    state === "current"
                      ? "text-blue-700"
                      : state === "complete"
                        ? "text-emerald-700"
                        : "text-slate-400"
                  }`}
                >
                  {item.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "slate";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        tone === "blue"
          ? "border-blue-100 bg-blue-50/80"
          : "border-slate-200 bg-slate-50/80"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function ProjectStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
          <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3.75 7.5A2.25 2.25 0 0 1 6 5.25h12A2.25 2.25 0 0 1 20.25 7.5v9A2.25 2.25 0 0 1 18 18.75H6A2.25 2.25 0 0 1 3.75 16.5v-9ZM8.25 9.75h7.5m-7.5 4.5h4.5"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">
          No projects yet
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Start a consent application workspace to track lifecycle progress, RFIs,
          and readiness in one place.
        </p>
        <Link
          href="/projects/new"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-700"
        >
          Create your first project
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
  if (risk === "HIGH") return "bg-rose-50 text-rose-700";
  if (risk === "MEDIUM") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
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
