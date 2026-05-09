import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { ProjectDeleteButton } from "@/components/project-delete-button";
import { deleteProject } from "./actions";

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
  ]);

  const bca = taxonomy.bcas.find((b) => b.id === project.bca);
  const deleteProjectAction = deleteProject.bind(null, id);
  const drawingsTotal = (drawingCount ?? 0) + (cadCount ?? 0);

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          {bca?.name ?? "Project"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {project.address}
        </h1>
        <p className="text-sm text-ink-500">
          {project.project_type} · status {project.status}
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Link
          href={`/projects/${id}/drawings`}
          className="group rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card p-6 hover:ring-ink-300 hover:shadow-raised hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Drawings</p>
          <p className="mt-3 text-[28px] leading-none font-semibold tracking-tight tabular-nums">{drawingsTotal}</p>
          <p className="mt-2 text-xs text-ink-500">
            {drawingCount ?? 0} PDF · {cadCount ?? 0} DXF
          </p>
        </Link>
        <Link
          href={`/projects/${id}/rfis`}
          className="group rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card p-6 hover:ring-ink-300 hover:shadow-raised hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">RFI letters</p>
          <p className="mt-3 text-[28px] leading-none font-semibold tracking-tight tabular-nums">{letterCount ?? 0}</p>
          <p className="mt-2 text-xs text-ink-500">
            {(letterCount ?? 0) > 0 ? "open the RFIs tab to respond" : "no RFIs received yet"}
          </p>
        </Link>
      </section>

      <section className="pt-2">
        <div className="rounded-sm border border-red-200 bg-red-50/70 p-6 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-red-900">Danger zone</h2>
          <p className="mt-1.5 text-sm text-red-800/80">
            Deleting a project permanently removes the project and its associated consent data.
          </p>
          <div className="mt-5">
            <ProjectDeleteButton onDelete={deleteProjectAction} />
          </div>
        </div>
      </section>
    </div>
  );
}
