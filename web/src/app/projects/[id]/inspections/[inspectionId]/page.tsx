import { notFound } from "next/navigation";
import { InspectionDetailPage } from "@/components/inspections/inspection-detail-page";
import { loadInspectionRecords } from "@/components/inspections/persistence";
import { getInspectionSchedule } from "@/lib/inspections";
import { normalizeProjectMetadata } from "@/lib/project-metadata";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectInspectionDetailRoute({
  params,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
}) {
  const { id, inspectionId } = await params;
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

  const schedule = getInspectionSchedule(normalizeProjectMetadata(project));
  const savedRecords = await loadInspectionRecords(supabase, project.id);

  return (
    <InspectionDetailPage
      projectId={project.id}
      inspectionId={inspectionId}
      schedule={schedule}
      savedRecords={savedRecords}
    />
  );
}
