import { redirect } from "next/navigation";

export default async function ProjectRfiDetailRedirect({
  params,
}: {
  params: Promise<{ id: string; letterId: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/project-application`);
}
