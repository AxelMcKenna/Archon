import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { ForecastingClient } from "./forecasting-client";

export const dynamic = "force-dynamic";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).single();
  if (!project) notFound();

  const [
    { count: drawingCount },
    { count: cadCount },
    { count: letterCount },
    { data: assessmentRow },
  ] = await Promise.all([
    supabase
      .from("plan_uploads")
      .select("*", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("cad_uploads")
      .select("*", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("rfi_letters")
      .select("*", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("consent_assessments")
      .select("forecast_context")
      .eq("project_id", id)
      .maybeSingle(),
  ]);
  const forecastPayload =
    (assessmentRow as { forecast_context?: Record<string, unknown> | null } | null)
      ?.forecast_context ?? null;

  const bca = taxonomy.bcas.find((b) => b.id === project.bca);
  const drawingsTotal = (drawingCount ?? 0) + (cadCount ?? 0);

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          {bca?.name ?? "Project"}
        </p>
        <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[36px] sm:text-[44px] text-ink-900">
          {project.address}
        </h1>
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          {project.project_type} · status <span className="text-accent">{project.status}</span>
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/projects/${id}/drawings`}
          className="group relative block overflow-hidden rounded-md bg-surface-raised p-6 shadow-depth transition-shadow duration-200 hover:shadow-depth-hover cursor-pointer"
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Drawings</p>
          <p className="mt-4 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-ink-900">{drawingsTotal}</p>
          <p className="mt-2 text-[11px] tracking-tight text-ink-500">
            {drawingCount ?? 0} PDF · {cadCount ?? 0} DXF
          </p>
        </Link>
        <Link
          href={`/projects/${id}/rfis`}
          className="group relative block overflow-hidden rounded-md bg-surface-raised p-6 shadow-depth transition-shadow duration-200 hover:shadow-depth-hover cursor-pointer"
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">RFI letters</p>
          <p className="mt-4 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-ink-900">{letterCount ?? 0}</p>
          <p className="mt-2 text-[11px] tracking-tight text-ink-500">
            {(letterCount ?? 0) > 0 ? "open the Council tab to respond" : "no RFIs received yet"}
          </p>
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Consent forecast
        </h2>
        <ForecastingClient
          projectId={project.id}
          initialPayload={forecastPayload}
        />
      </section>
    </div>
  );
}
