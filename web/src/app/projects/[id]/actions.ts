"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { normalizeProjectDetails, parseProjectFormData, parseProjectSettingsFormData } from "@/lib/project-details";
import { getProjectById, updateProjectRecord } from "@/lib/projects";

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
  const nextProject = parseProjectFormData(formData);
  const { error } = await updateProjectRecord(supabase, projectId, {
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

export async function updateProjectSettings(projectId: string, formData: FormData) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    "id, address, bca, project_type, description",
  );
  const { data: fallbackProject } =
    !project && projectError
      ? await supabase
          .from("projects")
          .select("id, address, bca, project_type, description")
          .eq("id", projectId)
          .single()
      : { data: null };
  const resolvedProject = project ?? fallbackProject;
  if (!resolvedProject) redirect(`/projects/${projectId}`);

  const settings = parseProjectSettingsFormData(formData);
  const snapshotMetadata = {
    kind: "project_settings_snapshot",
    schemaVersion: 1,
    settings,
  };
  const { error: snapshotError } = await supabase.from("audit_log").insert({
    project_id: projectId,
    action: "project_settings_snapshot",
    metadata: snapshotMetadata,
  });
  if (snapshotError) throw snapshotError;

  if (!("project_details" in resolvedProject)) {
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}/settings`);
  }

  const currentDetails = normalizeProjectDetails(
    "project_details" in resolvedProject ? resolvedProject.project_details : null,
    resolvedProject.project_type,
  );
  const nextDetails = {
    ...currentDetails,
    buildingConsentNumbers: settings.buildingConsentNumbers,
    ownerPreferredFormOfAddress: settings.ownerPreferredFormOfAddress,
    ownerFullName: settings.ownerFullName,
    ownerContactPersonFullName: settings.ownerContactPersonFullName,
    ownerMailingAddress: settings.ownerMailingAddress,
    ownerStreetAddressDifferent: settings.ownerStreetAddressDifferent,
    ownerStreetAddress: settings.ownerStreetAddress,
    ownerPhoneLandline: settings.ownerPhoneLandline,
    ownerPhoneMobile: settings.ownerPhoneMobile,
    ownerPhoneDaytime: settings.ownerPhoneDaytime,
    ownerPhoneAfterHours: settings.ownerPhoneAfterHours,
    ownerPhoneFax: settings.ownerPhoneFax,
    ownerEmailAddress: settings.ownerEmailAddress,
    ownerWebsiteUrl: settings.ownerWebsiteUrl,
    ownerEvidenceOfOwnershipType: settings.ownerEvidenceOfOwnershipType,
  };

  const { error } = await updateProjectRecord(supabase, projectId, user.id, {
    address: resolvedProject.address,
    bca: resolvedProject.bca,
    project_type: resolvedProject.project_type,
    description: resolvedProject.description || null,
    project_details: nextDetails,
  });
  if (error) throw error;

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/settings`);
}
