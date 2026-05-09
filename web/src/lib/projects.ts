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
  const withProjectDetails = selectClause === "*" ? "*" : appendProjectDetails(selectClause);
  const withDetails = await supabase
    .from("projects")
    .select(withProjectDetails)
    .eq("id", projectId)
    .single<ProjectRecord>();

  if (!withDetails.error) {
    return withDetails;
  }

  if (selectClause !== "*" && isMissingProjectDetailsColumnError(withDetails.error)) {
    const withoutProjectDetails = stripProjectDetails(selectClause);
    return supabase
      .from("projects")
      .select(withoutProjectDetails)
      .eq("id", projectId)
      .single<ProjectRecord>();
  }

  return withDetails;
}

export async function createProjectRecord(
  supabase: SupabaseClient,
  payload: ProjectMutation,
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
    const legacyPayload = { ...payload } as Record<string, unknown>;
    delete legacyPayload.project_details;
    return supabase.from("projects").insert(legacyPayload).select("id").single<{ id: string }>();
  }

  return withDetails;
}

export async function updateProjectRecord(
  supabase: SupabaseClient,
  projectId: string,
  payload: ProjectMutation,
) {
  const withDetails = await supabase
    .from("projects")
    .update(payload)
    .eq("id", projectId);

  if (!withDetails.error) {
    return withDetails;
  }

  if (isMissingProjectDetailsColumnError(withDetails.error)) {
    const { project_details: _projectDetails, ...legacyPayload } = payload;
    return supabase
      .from("projects")
      .update(legacyPayload)
      .eq("id", projectId);
  }

  return withDetails;
}

function appendProjectDetails(selectClause: string) {
  return selectClause.includes("project_details")
    ? selectClause
    : `${selectClause}, project_details`;
}

function stripProjectDetails(selectClause: string) {
  const next = selectClause
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "project_details");
  return next.join(", ");
}

function isMissingProjectDetailsColumnError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  const missingByMessage =
    message.includes("project_details") ||
    message.includes("Could not find the 'project_details' column") ||
    message.includes('column "project_details" does not exist');
  return (
    error.code === "PGRST204" ||
    missingByMessage ||
    (error.code === "42703" && missingByMessage)
  );
}
