import type { SupabaseClient } from "@supabase/supabase-js";

interface ProjectRecord {
  id: string;
  address: string;
  bca: string;
  project_type: string;
  description: string | null;
  status?: string;
  application_ref?: string | null;
  project_details?: unknown;
  [key: string]: unknown;
}

interface ProjectMutation {
  address: string;
  bca: string;
  project_type: string;
  description: string | null;
  project_details: unknown;
}

export async function getProjectById(
  supabase: SupabaseClient,
  projectId: string,
  selectClause = "*",
) {
  const withDetails = await supabase
    .from("projects")
    .select(selectClause === "*" ? "*" : appendProjectDetails(selectClause))
    .eq("id", projectId)
    .single<ProjectRecord>();

  if (!withDetails.error) {
    return withDetails;
  }

  if (selectClause !== "*" && isMissingProjectDetailsColumnError(withDetails.error)) {
    return supabase
      .from("projects")
      .select(selectClause)
      .eq("id", projectId)
      .single<ProjectRecord>();
  }

  return withDetails;
}

export async function createProjectRecord(
  supabase: SupabaseClient,
  payload: ProjectMutation & { user_id: string },
) {
  const withDetails = await supabase
    .from("projects")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (!withDetails.error) {
    return withDetails;
  }

  if (isMissingProjectDetailsColumnError(withDetails.error)) {
    const { project_details: _projectDetails, ...legacyPayload } = payload;
    return supabase
      .from("projects")
      .insert(legacyPayload)
      .select("id")
      .single<{ id: string }>();
  }

  return withDetails;
}

export async function updateProjectRecord(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  payload: ProjectMutation,
) {
  const withDetails = await supabase
    .from("projects")
    .update(payload)
    .eq("id", projectId)
    .eq("user_id", userId);

  if (!withDetails.error) {
    return withDetails;
  }

  if (isMissingProjectDetailsColumnError(withDetails.error)) {
    const { project_details: _projectDetails, ...legacyPayload } = payload;
    return supabase
      .from("projects")
      .update(legacyPayload)
      .eq("id", projectId)
      .eq("user_id", userId);
  }

  return withDetails;
}

function appendProjectDetails(selectClause: string) {
  return selectClause.includes("project_details")
    ? selectClause
    : `${selectClause}, project_details`;
}

function isMissingProjectDetailsColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST204" ||
    error.message?.includes("project_details") ||
    error.message?.includes("Could not find the 'project_details' column") ||
    error.message?.includes('column "project_details" does not exist')
  );
}
