import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ConsentAssessmentPage } from "@/components/consent-assessment/consent-assessment-page";
import { AddressChecklist } from "@/components/AddressChecklist";

export const dynamic = "force-dynamic";

export default async function ProjectConsentAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("id, address, project_type")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <AddressChecklist address={project.address} initialProjectType={project.project_type} />
      <ConsentAssessmentPage projectId={project.id} address={project.address} />
    </div>
  );
}
