import { getSupabaseServer } from "@/lib/supabase/server";
import { ProjectsPageClient, type ProjectListItem } from "@/components/projects-page-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await getSupabaseServer();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, address, application_ref, project_type, status, updated_at, rfi_letters(id, status)")
    .order("updated_at", { ascending: false });

  return <ProjectsPageClient projects={dedupeProjects((projects ?? []) as ProjectListItem[])} />;
}

function dedupeProjects(projects: ProjectListItem[]) {
  return Array.from(new Map(projects.map((project) => [project.id, project])).values());
}
