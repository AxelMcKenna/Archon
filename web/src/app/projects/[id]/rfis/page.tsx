import { redirect } from "next/navigation";

export default async function RfisRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/project-application`);
}
