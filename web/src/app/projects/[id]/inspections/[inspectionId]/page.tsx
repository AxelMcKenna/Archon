import { notFound } from "next/navigation";
import { InspectionDetailPage } from "@/components/inspections/inspection-detail-page";
import { getInspectionSchedule } from "@/lib/inspections";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectInspectionDetailRoute({
  params,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
}) {
  const { id, inspectionId } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("id, address, project_type, description")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const schedule = getInspectionSchedule(project);

  return (
    <InspectionDetailPage
      projectId={project.id}
      inspectionId={inspectionId}
      schedule={schedule}
    />
  );
}
