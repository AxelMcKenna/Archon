"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { parseProjectFormData } from "@/lib/project-details";
import { updateProjectRecord } from "@/lib/projects";

export async function deleteProject(projectId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    throw error;
  }

  revalidatePath("/projects");
  redirect("/projects");
}

export async function updateProject(projectId: string, formData: FormData) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/sign-in");
  }

  const nextProject = parseProjectFormData(formData);
  const { error } = await updateProjectRecord(supabase, projectId, user.id, {
    address: nextProject.address,
    bca: nextProject.bca,
    project_type: nextProject.projectType,
    description: nextProject.description || null,
    project_details: nextProject.projectDetails,
  });

  if (error) {
    throw error;
  }

  redirect(`/projects/${projectId}`);
}
