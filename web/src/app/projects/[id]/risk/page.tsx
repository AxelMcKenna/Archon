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
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Pre-lodgement
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Risk check</h1>
        <p className="text-sm text-ink-500">
          Score the description against historical RFI patterns for {bcaName} ·{" "}
          {project.project_type}.
        </p>
      </header>

      <RiskRunner
        bca={project.bca}
        projectType={project.project_type}
        defaultDescription={project.description ?? ""}
      />
    </div>
  );
}
