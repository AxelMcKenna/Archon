import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ConsentAssessmentPage } from "@/components/consent-assessment/consent-assessment-page";
import type { ProjectIntake } from "@/components/consent-assessment/use-consent-assessment";

export const dynamic = "force-dynamic";

export default async function LodgementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  const { data: assessmentRow } = await supabase
    .from("consent_assessments")
    .select("forecast_context")
    .eq("project_id", id)
    .maybeSingle();

  const project = data as
    | {
        id: string;
        address: string;
        project_type?: string | null;
        estimated_floor_area_m2?: number | null;
        estimated_construction_value_nzd?: number | null;
        involves_structural_work?: boolean | null;
        involves_earthworks?: boolean | null;
        existing_structure_demolished?: boolean | null;
        new_road_access?: boolean | null;
        service_connection_water?: boolean | null;
        service_connection_wastewater?: boolean | null;
        service_connection_stormwater?: boolean | null;
      }
    | null;

  if (!project) notFound();
  const forecastContext =
    (assessmentRow as { forecast_context?: Record<string, unknown> | null } | null)
      ?.forecast_context ?? null;
  const yearOfConstruction =
    toNumber(forecastContext?.yearOfConstruction) ??
    toNumber(forecastContext?.year_of_construction);

  const intake: ProjectIntake = {
    projectType: project.project_type ?? "new_dwelling",
    estimatedFloorAreaM2: project.estimated_floor_area_m2 ?? null,
    estimatedConstructionValueNZD: project.estimated_construction_value_nzd ?? null,
    involvesStructuralWork: project.involves_structural_work ?? false,
    involvesEarthworks: project.involves_earthworks ?? false,
    existingStructureDemolished: project.existing_structure_demolished ?? false,
    yearOfConstruction,
    newRoadAccess: project.new_road_access ?? false,
    serviceConnectionWater: project.service_connection_water ?? false,
    serviceConnectionWastewater: project.service_connection_wastewater ?? false,
    serviceConnectionStormwater: project.service_connection_stormwater ?? false,
  };

  return (
    <ConsentAssessmentPage
      projectId={project.id}
      address={project.address}
      projectIntake={intake}
    />
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
