"use server";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { parseProjectFormData } from "@/lib/project-details";
import { createProjectRecord } from "@/lib/projects";

export async function createProject(formData: FormData) {
  const supabase = await getSupabaseServer();
  const project = parseProjectFormData(formData);
  const description = project.description || null;

  const recentThreshold = new Date(Date.now() - 15_000).toISOString();
  const { data: existingProject } = await supabase
    .from("projects")
    .select("id")
    .eq("address", project.address)
    .eq("bca", project.bca)
    .eq("project_type", project.projectType)
    .gte("created_at", recentThreshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingProject) {
    redirect(`/projects/${existingProject.id}`);
  }

  const { data, error } = await createProjectRecord(supabase, {
    address: project.address,
    bca: project.bca,
    project_type: project.projectType,
    description,
    project_details: project.projectDetails,
  });

  if (error) {
    throw error;
  }

  redirect(`/projects/${data.id}`);
}
