import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  FolderOpen,
  PencilRuler,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@archon/shared";

export const dynamic = "force-dynamic";

type LetterRow = {
  id: string;
  project_id: string;
  rfi_number: number | null;
  status: string;
  created_at: string;
  projects: { address: string; bca: string } | null;
};

type PlanRow = {
  id: string;
  project_id: string;
  filename: string;
  status: string;
  created_at: string;
  analysis: { flags?: { severity: string }[] } | null;
  projects: { address: string; bca: string } | null;
};

export default async function Dashboard() {
  const supabase = await getSupabaseServer();

  const [
    { count: projectCount },
    { count: planCount },
    { count: cadCount },
    { count: letterCount },
    { count: itemCount },
    { count: draftedCount },
    { data: recentLettersRaw },
    { data: recentPlansRaw },
    { data: flagPlans },
  ] = await Promise.all([
    supabase.from("projects").select("*", { count: "exact", head: true }),
    supabase.from("plan_uploads").select("*", { count: "exact", head: true }),
    supabase.from("cad_uploads").select("*", { count: "exact", head: true }),
    supabase.from("rfi_letters").select("*", { count: "exact", head: true }),
    supabase.from("rfi_items").select("*", { count: "exact", head: true }),
    supabase.from("responses").select("*", { count: "exact", head: true }),
    supabase
      .from("rfi_letters")
      .select("id, project_id, rfi_number, status, created_at, projects(address, bca)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("plan_uploads")
      .select("id, project_id, filename, status, created_at, analysis, projects(address, bca)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("plan_uploads").select("analysis").eq("status", "analysed"),
  ]);

  const recentLetters = (recentLettersRaw ?? []) as unknown as LetterRow[];
  const recentPlans = (recentPlansRaw ?? []) as unknown as PlanRow[];

  const mustResolve = (flagPlans ?? []).reduce((acc, p) => {
    const flags =
      (p.analysis as { flags?: { severity: string }[] } | null)?.flags ?? [];
    return acc + flags.filter((f) => f.severity === "must_resolve").length;
  }, 0);

  const drawingsTotal = (planCount ?? 0) + (cadCount ?? 0);
  const draftCoverage =
    itemCount && itemCount > 0
      ? Math.round(((draftedCount ?? 0) / itemCount) * 100)
      : null;

  return (
    <div className="relative">
      {/* Subtle data-grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(8,9,11,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(8,9,11,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at top, black 30%, transparent 75%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
        <header className="flex items-end justify-between gap-6">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
              <span className="inline-block h-1 w-1 rounded-full bg-accent" />
              Overview
            </p>
            <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[44px] text-ink-900">
              Dashboard
            </h1>
            <p className="text-sm text-ink-500">
              Live state across projects, drawings and RFI letters.
            </p>
          </div>
        </header>

        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Projects"
              value={projectCount ?? 0}
              icon={<FolderOpen className="h-4 w-4" />}
              accent="ink"
              href="/projects"
            />
            <StatCard
              label="Drawings analysed"
              value={drawingsTotal}
              sublabel={`${planCount ?? 0} PDF · ${cadCount ?? 0} DXF`}
              icon={<PencilRuler className="h-4 w-4" />}
              accent="brand"
              href="/projects"
            />
            <StatCard
              label="RFI letters"
              value={letterCount ?? 0}
              sublabel={
                draftCoverage !== null
                  ? `${draftCoverage}% items drafted`
                  : "no items yet"
              }
              icon={<FileText className="h-4 w-4" />}
              accent="cyan"
              href="/projects"
            />
            <StatCard
              label="Must-resolve flags"
              value={mustResolve}
              sublabel="across analysed drawings"
              icon={<AlertTriangle className="h-4 w-4" />}
              accent={mustResolve > 0 ? "danger" : "ink"}
              href="/projects"
            />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="Recent RFI letters"
            href="/projects"
            empty="No RFI letters yet — open a project to upload one."
            rows={recentLetters.map((l) => ({
              key: l.id,
              href: `/projects/${l.project_id}/rfis?letter=${l.id}` as Route,
              primary: `${l.projects?.address ?? "(unknown)"}`,
              meta: `RFI ${l.rfi_number ?? "—"}`,
              secondary: `${
                taxonomy.bcas.find((b) => b.id === l.projects?.bca)?.name ??
                l.projects?.bca ??
                ""
              } · ${new Date(l.created_at).toLocaleDateString()}`,
              badge: l.status,
              badgeTone: l.status === "ready" ? "success" : "neutral",
            }))}
          />
          <Panel
            title="Recent drawings"
            href="/projects"
            empty="No drawings analysed yet."
            rows={recentPlans.map((p) => {
              const flags =
                (p.analysis as { flags?: { severity: string }[] } | null)?.flags ?? [];
              const must = flags.filter((f) => f.severity === "must_resolve").length;
              return {
                key: p.id,
                href: `/projects/${p.project_id}/drawings?plan=${p.id}` as Route,
                primary: `${p.projects?.address ?? "(unknown)"}`,
                meta: p.filename,
                secondary:
                  p.status === "analysed"
                    ? `${flags.length} flags · ${must} must-resolve`
                    : p.status,
                badge: p.status,
                badgeTone:
                  p.status === "analysed"
                    ? must > 0
                      ? "danger"
                      : "success"
                    : "neutral",
              };
            })}
          />
        </section>
      </div>
    </div>
  );
}

const ACCENT: Record<
  "ink" | "brand" | "cyan" | "danger",
  { bar: string; iconBg: string; iconText: string }
> = {
  ink: {
    bar: "bg-ink-900",
    iconBg: "bg-ink-100",
    iconText: "text-ink-700",
  },
  brand: {
    bar: "bg-brand-600",
    iconBg: "bg-brand-50",
    iconText: "text-brand-700",
  },
  cyan: {
    bar: "bg-accent",
    iconBg: "bg-accent/10",
    iconText: "text-accent",
  },
  danger: {
    bar: "bg-red-600",
    iconBg: "bg-red-50",
    iconText: "text-red-700",
  },
};

function StatCard({
  label,
  value,
  sublabel,
  icon,
  accent,
  href,
}: {
  label: string;
  value: number;
  sublabel?: string;
  icon: React.ReactNode;
  accent: "ink" | "brand" | "cyan" | "danger";
  href: Route;
}) {
  const a = ACCENT[accent];
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-md bg-surface-raised p-5 shadow-depth transition-shadow duration-200 hover:shadow-depth-hover cursor-pointer"
    >
      <div className={`absolute inset-x-0 top-0 h-[2px] ${a.bar}`} />
      <div className="flex items-center justify-between">
        <div
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${a.iconBg} ${a.iconText} ring-1 ring-inset ring-ink-900/5`}
        >
          {icon}
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-ink-300 transition-colors duration-200 group-hover:text-ink-900" />
      </div>
      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-ink-900">
          {value}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-700">{label}</span>
      </div>
      {sublabel && (
        <div className="mt-1 text-[11px] tracking-tight text-ink-500">
          {sublabel}
        </div>
      )}
    </Link>
  );
}

const BADGE_TONE: Record<
  "neutral" | "success" | "danger",
  { wrap: string; dot: string }
> = {
  neutral: { wrap: "bg-ink-100 text-ink-700", dot: "bg-ink-400" },
  success: { wrap: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  danger: { wrap: "bg-red-50 text-red-800", dot: "bg-red-500" },
};

function Panel({
  title,
  href,
  rows,
  empty,
}: {
  title: string;
  href: Route;
  empty: string;
  rows: Array<{
    key: string;
    href: Route;
    primary: string;
    meta: string;
    secondary: string;
    badge: string;
    badgeTone: "neutral" | "success" | "danger";
  }>;
}) {
  return (
    <div className="rounded-md bg-surface-raised shadow-depth overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-900/[0.06]">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink-900">
            {title}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-ink-400 tabular-nums">
            {String(rows.length).padStart(2, "0")}
          </span>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-brand-700 transition-colors cursor-pointer"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink-50 shadow-inset">
            <CheckCircle2 className="h-4 w-4 text-ink-400" />
          </div>
          <p className="text-sm text-ink-500">{empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-900/[0.05]">
          {rows.map((r) => {
            const tone = BADGE_TONE[r.badgeTone];
            return (
              <li key={r.key}>
                <Link
                  href={r.href}
                  className="group flex items-center gap-4 px-5 py-3 hover:bg-ink-50/70 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-ink-900 truncate">
                        {r.primary}
                      </p>
                      <span className="text-[11px] text-ink-400 truncate">
                        {r.meta}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] tracking-tight text-ink-500 truncate">
                      {r.secondary}
                    </p>
                  </div>
                  <span
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-medium ${tone.wrap}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {r.badge}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-ink-300 opacity-0 transition-all group-hover:opacity-100 group-hover:text-ink-700 group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
