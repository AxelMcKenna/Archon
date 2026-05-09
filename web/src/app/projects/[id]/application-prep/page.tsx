import { redirect } from "next/navigation";

export default async function ApplicationPrepRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/project-application`);
}
