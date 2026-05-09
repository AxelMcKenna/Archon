import { redirect } from "next/navigation";

export default async function ProjectConsentDocumentRedirect({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = await params;
  redirect(`/projects/${id}/project-application/${documentId}`);
}
