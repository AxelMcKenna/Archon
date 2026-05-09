import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ConsentDocumentPage } from "@/components/consent-assessment/consent-document-page";

export const dynamic = "force-dynamic";

export default async function ProjectConsentDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("id, address")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  return (
    <ConsentDocumentPage
      projectId={project.id}
      address={project.address}
      documentId={documentId}
    />
  );
}
