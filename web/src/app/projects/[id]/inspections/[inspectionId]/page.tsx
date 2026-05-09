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
    .select(`
      id,
      address,
      project_type,
      description,
      estimated_floor_area_m2,
      estimated_construction_value_nzd,
      involves_structural_work,
      involves_earthworks,
      existing_structure_demolished,
      new_road_access,
      service_connection_water,
      service_connection_wastewater,
      service_connection_stormwater
    `)
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
