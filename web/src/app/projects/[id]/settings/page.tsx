import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { buildProjectSettingsValues } from "@/lib/project-details";
import { getProjectById } from "@/lib/projects";
import { ProjectOwnerDetailsSettings } from "@/components/project-owner-details-settings";
import type { ProjectSettingsValues } from "@/lib/project-details";
import { updateProjectSettings } from "../actions";

export const dynamic = "force-dynamic";

function normalizePreferred(value: string): ProjectSettingsValues["ownerPreferredFormOfAddress"] {
  if (value === "Mr" || value === "Mrs" || value === "Ms" || value === "Miss" || value === "Dr") {
    return value;
  }
  return "";
}

function normalizeEvidence(value: string): ProjectSettingsValues["ownerEvidenceOfOwnershipType"] {
  if (
    value === "Certificate of title" ||
    value === "Lease" ||
    value === "Agreement for sale and purchase" ||
    value === "Other document"
  ) {
    return value;
  }
  return "";
}

function normalizeSettingsSnapshot(value: unknown): Partial<ProjectSettingsValues> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const settings =
    record.settings && typeof record.settings === "object"
      ? (record.settings as Record<string, unknown>)
      : record;
  const preferred = String(settings.ownerPreferredFormOfAddress ?? "");
  const evidence = String(settings.ownerEvidenceOfOwnershipType ?? "");
  return {
    buildingConsentNumbers: String(settings.buildingConsentNumbers ?? ""),
    ownerPreferredFormOfAddress: normalizePreferred(preferred),
    ownerFullName: String(settings.ownerFullName ?? ""),
    ownerContactPersonFullName: String(settings.ownerContactPersonFullName ?? ""),
    ownerMailingAddress: String(settings.ownerMailingAddress ?? ""),
    ownerStreetAddressDifferent: Boolean(settings.ownerStreetAddressDifferent),
    ownerStreetAddress: String(settings.ownerStreetAddress ?? ""),
    ownerPhoneLandline: String(settings.ownerPhoneLandline ?? ""),
    ownerPhoneMobile: String(settings.ownerPhoneMobile ?? ""),
    ownerPhoneDaytime: String(settings.ownerPhoneDaytime ?? ""),
    ownerPhoneAfterHours: String(settings.ownerPhoneAfterHours ?? ""),
    ownerPhoneFax: String(settings.ownerPhoneFax ?? ""),
    ownerEmailAddress: String(settings.ownerEmailAddress ?? ""),
    ownerWebsiteUrl: String(settings.ownerWebsiteUrl ?? ""),
    ownerEvidenceOfOwnershipType: normalizeEvidence(evidence),
  };
}

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: project, error } = await getProjectById(
    supabase,
    id,
    "id, address, bca, project_type, description",
  );
  const { data: fallbackProject } =
    !project && error
      ? await supabase
          .from("projects")
          .select("id, address, bca, project_type, description")
          .eq("id", id)
          .single()
      : { data: null };
  const resolvedProject = project ?? fallbackProject;
  if (!resolvedProject) notFound();

  const settings = buildProjectSettingsValues(resolvedProject);
  const { data: settingsSnapshotRows } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("project_id", id)
    .eq("action", "project_settings_snapshot")
    .order("created_at", { ascending: false })
    .limit(1);
  const snapshot = normalizeSettingsSnapshot(settingsSnapshotRows?.[0]?.metadata);
  const mergedSettings: ProjectSettingsValues = snapshot
    ? {
        ...settings,
        ...snapshot,
      }
    : settings;
  const { data: richAttachments, error: richAttachmentsError } = await supabase
    .from("attachments")
    .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type, linked_requirement_key")
    .eq("project_id", id)
    .order("uploaded_at", { ascending: false });
  const { data: basicAttachments, error: basicAttachmentsError } = richAttachmentsError
    ? await supabase
        .from("attachments")
        .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type")
        .eq("project_id", id)
        .order("uploaded_at", { ascending: false })
    : { data: null };
  const { data: minimalAttachments } = basicAttachmentsError
    ? await supabase
        .from("attachments")
        .select("id, filename, storage_path")
        .eq("project_id", id)
    : { data: null };
  const attachments = (richAttachments ?? basicAttachments ?? minimalAttachments ?? []) as Array<{
    id: string;
    filename: string;
    storage_path: string;
    uploaded_at?: string;
    size_bytes?: number | null;
    mime_type?: string | null;
    linked_requirement_key?: string | null;
  }>;
  const ownershipEvidenceFile =
    (attachments ?? []).find(
      (item) =>
        item.linked_requirement_key === "owner_evidence" ||
        item.filename.toLowerCase().startsWith("ownership evidence - "),
    ) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-ink-900">Project Settings</h1>
      <p className="mb-6 text-sm text-ink-500">Update building consent number(s) and owner info for this project.</p>
      <ProjectOwnerDetailsSettings
        projectId={id}
        initialValues={mergedSettings}
        initialOwnershipEvidenceFile={
          ownershipEvidenceFile
            ? {
                id: ownershipEvidenceFile.id,
                filename: ownershipEvidenceFile.filename,
                storagePath: ownershipEvidenceFile.storage_path,
                uploadedAt: ownershipEvidenceFile.uploaded_at ?? "",
                sizeBytes: ownershipEvidenceFile.size_bytes ?? null,
                mimeType: ownershipEvidenceFile.mime_type ?? null,
              }
            : null
        }
        action={updateProjectSettings.bind(null, id)}
      />
    </div>
  );
}
