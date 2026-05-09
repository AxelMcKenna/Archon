import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ConsentDocumentPage } from "@/components/consent-assessment/consent-document-page";
import { normalizeProjectDetails } from "@/lib/project-details";
import { getProjectById } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectConsentDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = await params;
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
    <ConsentDocumentPage
      projectId={project.id}
      address={project.address}
      documentId={documentId}
      projectDetails={normalizeProjectDetails(project.project_details, project.project_type)}
    />
  );
}
