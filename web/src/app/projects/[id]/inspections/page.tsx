import { notFound } from "next/navigation";
import { ConstructionSubnav } from "@/components/construction-subnav";
import { InspectionsPage } from "@/components/inspections/inspections-page";
import { loadInspectionRecords } from "@/components/inspections/persistence";
import { getInspectionSchedule } from "@/lib/inspections";
import { normalizeProjectMetadata } from "@/lib/project-metadata";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectInspectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) {
    if (error) {
      throw error;
    }
    notFound();
  }

  const normalizedProject = normalizeProjectMetadata(project);
  const schedule = getInspectionSchedule(normalizedProject);
  const savedRecords = await loadInspectionRecords(supabase, project.id);

  return (
    <>
      <ConstructionSubnav projectId={project.id} />
      <InspectionsPage
        projectId={project.id}
        projectAddress={normalizedProject.address ?? project.address ?? null}
        schedule={schedule}
        savedRecords={savedRecords}
      />
    </>
  );
}
