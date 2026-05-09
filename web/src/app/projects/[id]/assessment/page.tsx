import { redirect } from "next/navigation";

export default async function AssessmentRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/application-prep`);
}
