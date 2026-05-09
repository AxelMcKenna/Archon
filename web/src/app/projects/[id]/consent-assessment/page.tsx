import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ConsentAssessmentPage } from "@/components/consent-assessment/consent-assessment-page";

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
    .select("id, address")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  return <ConsentAssessmentPage projectId={project.id} address={project.address} />;
}
