import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ConsentAssessmentPage } from "@/components/consent-assessment/consent-assessment-page";
import { normalizeProjectDetails } from "@/lib/project-details";
import { getProjectById } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectConsentAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project, error } = await getProjectById(
    supabase,
    id,
    "id, address, project_type",
  );

  if (!project) {
    if (error) {
      throw error;
    }
    notFound();
  }

  return (
    <ConsentAssessmentPage
      projectId={project.id}
      address={project.address}
      projectDetails={normalizeProjectDetails(project.project_details, project.project_type)}
    />
  );
}
