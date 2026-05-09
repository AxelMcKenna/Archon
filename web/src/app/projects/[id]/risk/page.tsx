import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { RiskRunner } from "./risk-runner";

export const dynamic = "force-dynamic";

export default async function RiskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (!project) notFound();

  const bcaName = taxonomy.bcas.find((b) => b.id === project.bca)?.name ?? project.bca;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <a href={`/projects/${id}`} className="text-sm text-ink-500 hover:text-ink-900">
          ← back to project
        </a>
        <h1 className="text-2xl font-semibold mt-2">Pre-lodgement risk check</h1>
        <p className="text-sm text-ink-500 mt-1">
          {bcaName} · {project.project_type}
        </p>
      </div>

      <RiskRunner
        bca={project.bca}
        projectType={project.project_type}
        defaultDescription={project.description ?? ""}
      />
    </div>
  );
}
