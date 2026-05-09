import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  FolderOpen,
  PencilRuler,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";

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
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="flex items-end justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Overview
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Dashboard
          </h1>
        </div>
      </header>

      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            label="Projects"
            value={projectCount ?? 0}
            icon={<FolderOpen className="h-4 w-4" />}
            tone="neutral"
            href="/projects"
          />
          <StatCard
            label="Drawings analysed"
            value={drawingsTotal}
            sublabel={`${planCount ?? 0} PDF · ${cadCount ?? 0} DXF`}
            icon={<PencilRuler className="h-4 w-4" />}
            tone="info"
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
            tone="success"
            href="/projects"
          />
          <StatCard
            label="Must-resolve flags"
            value={mustResolve}
            sublabel="across analysed drawings"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={mustResolve > 0 ? "danger" : "neutral"}
            href="/projects"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title="Recent RFI letters"
          href="/projects"
          empty="No RFI letters yet — open a project to upload one."
          rows={recentLetters.map((l) => ({
            key: l.id,
            href: `/projects/${l.project_id}/rfis?letter=${l.id}` as Route,
            primary: `${l.projects?.address ?? "(unknown)"} — RFI ${l.rfi_number ?? "?"}`,
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
              primary: `${p.projects?.address ?? "(unknown)"} · ${p.filename}`,
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
  );
}

const TONE: Record<
  "neutral" | "info" | "success" | "danger",
  { ring: string; iconBg: string; iconText: string }
> = {
  neutral: {
    ring: "ring-ink-700/10",
    iconBg: "bg-ink-100",
    iconText: "text-ink-700",
  },
  info: {
    ring: "ring-ink-700/10",
    iconBg: "bg-tan-100",
    iconText: "text-tan-700",
  },
  success: {
    ring: "ring-ink-700/10",
    iconBg: "bg-ink-100",
    iconText: "text-ink-700",
  },
  danger: {
    ring: "ring-ink-700/10",
    iconBg: "bg-ink-900",
    iconText: "text-white",
  },
};

function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  sublabel?: string;
  icon: React.ReactNode;
  tone: "neutral" | "info" | "success" | "danger";
  href: Route;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className={`group relative block rounded-sm bg-surface-raised p-6 ring-1 ${t.ring} shadow-card hover:ring-ink-300 hover:shadow-raised hover:-translate-y-0.5 transition-all cursor-pointer`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-sm ${t.iconBg} ${t.iconText} ring-1 ring-ink-200/60`}
        >
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 text-ink-400 group-hover:text-ink-900 group-hover:translate-x-0.5 transition-all" />
      </div>
      <div className="mt-5 text-[28px] leading-none font-semibold tracking-tight tabular-nums text-ink-900">
        {value}
      </div>
      <div className="mt-2 text-sm text-ink-700">{label}</div>
      {sublabel && <div className="mt-1 text-xs text-ink-500">{sublabel}</div>}
    </Link>
  );
}

const BADGE_TONE: Record<"neutral" | "success" | "danger", string> = {
  neutral: "bg-ink-100 text-ink-700",
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-red-100 text-red-800",
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
    secondary: string;
    badge: string;
    badgeTone: "neutral" | "success" | "danger";
  }>;
}) {
  return (
    <div className="rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-ink-200/70">
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">{title}</h2>
        <Link
          href={href}
          className="text-xs font-medium text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 transition-colors cursor-pointer"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto text-ink-300 mb-2" />
          <p className="text-sm text-ink-500">{empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-200/70">
          {rows.map((r) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-ink-50 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.primary}</p>
                  <p className="text-xs text-ink-500 truncate">{r.secondary}</p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_TONE[r.badgeTone]}`}
                >
                  {r.badge}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
