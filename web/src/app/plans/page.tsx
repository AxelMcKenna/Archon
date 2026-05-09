import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { UploadPlanInline } from "./upload-plan-inline";
import { PlanReview } from "./plan-review";

export const dynamic = "force-dynamic";

type PlanRow = {
  id: string;
  project_id: string;
  filename: string;
  status: string;
  analyser_version: string | null;
  analysis_version: string | null;
  prompt_version: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  analysis: {
    flags?: { severity: string }[];
    summary?: string;
    pages_analysed?: number;
    taxonomy_version?: string;
  } | null;
  created_at: string;
  projects: { address: string; bca: string; project_type: string } | null;
};

type ProjectRow = {
  id: string;
  address: string;
  bca: string;
  project_type: string;
};

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planId } = await searchParams;
  const supabase = await getSupabaseServer();

  const { data: plansRaw } = await supabase
    .from("plan_uploads")
    .select(
      "id, project_id, filename, status, analyser_version, analysis_version, prompt_version, " +
        "processing_ms, cost_usd, analysis, created_at, " +
        "projects(address, bca, project_type)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const plans = (plansRaw ?? []) as unknown as PlanRow[];

  const { data: projectsRaw } = await supabase
    .from("projects")
    .select("id, address, bca, project_type")
    .order("updated_at", { ascending: false });
  const projects = (projectsRaw ?? []) as unknown as ProjectRow[];

  const selectedPlan = planId ? plans.find((p) => p.id === planId) ?? null : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Building plan analyser</h1>
        <p className="text-sm text-ink-500 mt-1">
          Pre-flight a building plan against likely council RFIs before lodgement.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Analyse a building plan
        </h2>
        <UploadPlanInline projects={projects} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Plans ({plans.length})
        </h2>
        <PlansList plans={plans} activeId={planId} />
      </section>

      {selectedPlan && (
        <section className="space-y-3 pt-6 border-t border-ink-700/10">
          <SelectedPlanHeader plan={selectedPlan} />
          <PlanReview plan={selectedPlan as Parameters<typeof PlanReview>[0]["plan"]} />
        </section>
      )}
    </div>
  );
}

function PlansList({ plans, activeId }: { plans: PlanRow[]; activeId?: string }) {
  if (!plans.length) {
    return (
      <p className="text-sm text-ink-500 italic">
        No plans analysed yet — upload one above.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-ink-700/10 rounded-lg border border-ink-700/10">
      {plans.map((p) => {
        const bcaName =
          taxonomy.bcas.find((b) => b.id === p.projects?.bca)?.name ?? p.projects?.bca;
        const isActive = p.id === activeId;
        const flags = p.analysis?.flags ?? [];
        const must = flags.filter((f) => f.severity === "must_resolve").length;
        const nice = flags.length - must;
        return (
          <li key={p.id} className={isActive ? "bg-ink-700/5" : "hover:bg-ink-700/5"}>
            <Link
              href={`/plans?plan=${p.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {p.projects?.address ?? "(unknown project)"} — {p.filename}
                </p>
                <p className="text-xs text-ink-500">
                  {bcaName} · {new Date(p.created_at).toLocaleDateString()} ·{" "}
                  {p.status === "analysed"
                    ? `${flags.length} flags (${must} must / ${nice} nice)`
                    : p.status}
                </p>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  p.status === "analysed"
                    ? must > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-emerald-100 text-emerald-800"
                    : p.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-ink-700/10"
                }`}
              >
                {p.status}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedPlanHeader({ plan }: { plan: PlanRow }) {
  const bcaName =
    taxonomy.bcas.find((b) => b.id === plan.projects?.bca)?.name ?? plan.projects?.bca;
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-2">
      <div>
        <p className="text-xs text-ink-500">{bcaName} · {plan.projects?.address}</p>
        <h2 className="text-xl font-semibold">{plan.filename}</h2>
      </div>
      <Link href="/plans" className="text-sm text-ink-500 hover:text-ink-900">
        Close →
      </Link>
    </div>
  );
}
