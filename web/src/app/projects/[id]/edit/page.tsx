import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project-form";
import { buildProjectFormValues } from "@/lib/project-details";
import { getProjectById } from "@/lib/projects";
import { updateProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  const { data: project, error } = await getProjectById(
    supabase,
    id,
    "id, address, bca, project_type, description",
  );

  if (!project) {
    if (error) {
      throw error;
    }
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Edit project</h1>
      <ProjectForm
        action={updateProject.bind(null, id)}
        initialValues={buildProjectFormValues(project)}
        submitLabel="Save changes"
        pendingLabel="Saving..."
      />
    </div>
  );
}
