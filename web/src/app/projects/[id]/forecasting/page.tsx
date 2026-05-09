import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ForecastingClient } from "./forecasting-client";

export const dynamic = "force-dynamic";

export default async function ProjectForecastingPage({
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

  if (!project) notFound();

  return (
    <ForecastingClient
      projectId={project.id}
      address={project.address}
      projectType={project.project_type}
    />
  );
}

