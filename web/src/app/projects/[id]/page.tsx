import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { deleteProject } from "./actions";
import { ProjectDeleteButton } from "@/components/project-delete-button";

export const dynamic = "force-dynamic";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
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
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">{bca?.name}</p>
          <h1 className="text-2xl font-semibold">{project.address}</h1>
          <p className="mt-2 text-sm text-ink-500">
            {project.project_type} · status {project.status}
          </p>
        </div>
        <Link
          href={`/projects/${id}/risk`}
          className="rounded-sm border border-ink-700/15 px-3 py-2 text-sm hover:bg-ink-700/5"
        >
          Pre-lodgement risk check →
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href={`/projects/${id}/drawings`}
          className="rounded-sm border border-ink-700/10 p-5 hover:bg-ink-700/5 transition-colors"
        >
          <p className="text-xs uppercase tracking-wide text-ink-500">Drawings</p>
          <p className="mt-2 text-2xl font-semibold">{drawingsTotal}</p>
          <p className="mt-1 text-xs text-ink-500">
            {drawingCount ?? 0} PDF · {cadCount ?? 0} DXF
          </p>
        </Link>
        <Link
          href={`/projects/${id}/rfis`}
          className="rounded-sm border border-ink-700/10 p-5 hover:bg-ink-700/5 transition-colors"
        >
          <p className="text-xs uppercase tracking-wide text-ink-500">RFI letters</p>
          <p className="mt-2 text-2xl font-semibold">{letterCount ?? 0}</p>
          <p className="mt-1 text-xs text-ink-500">
            {(letterCount ?? 0) > 0 ? "open the RFIs tab to respond" : "no RFIs received yet"}
          </p>
        </Link>
      </section>

      <section className="border-t border-ink-700/10 pt-8">
        <div className="rounded-sm border border-red-200 bg-red-50/60 p-5">
          <h2 className="text-lg font-semibold text-red-900">Danger zone</h2>
          <p className="mt-2 text-sm text-red-800/80">
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
