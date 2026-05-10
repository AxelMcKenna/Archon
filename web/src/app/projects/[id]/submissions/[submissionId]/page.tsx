import { notFound } from "next/navigation";
import { SubmissionPackagePage } from "@/components/consent-assessment/submission-package-page";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectSubmissionPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("id, address")
    .eq("id", id)
    .single();
  if (!project) notFound();

  return (
    <SubmissionPackagePage
      projectId={project.id}
      address={project.address}
      submissionId={submissionId}
    />
  );
}
