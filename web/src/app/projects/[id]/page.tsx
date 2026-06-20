import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@arro/shared";
import { ForecastingClient } from "./forecasting-client";
import { buildProjectSettingsValues } from "@/lib/project-details";
import type { ProjectSettingsValues } from "@/lib/project-details";
import { ProjectOwnerDetailsSettings } from "@/components/project-owner-details-settings";
import { updateProjectSettings } from "./actions";

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

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  // Fetch everything the page needs in one parallel batch — none of these
  // depend on each other, so running them concurrently (rather than awaiting
  // the project first and the attachments last) removes two serial round-trips
  // from the critical path.
  const [
    { data: project },
    { count: drawingCount },
    { count: cadCount },
    { count: letterCount },
    { data: assessmentRow },
    { data: settingsSnapshotRows },
    { data: richAttachments, error: richAttachmentsError },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("plan_uploads")
      .select("*", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("cad_uploads")
      .select("*", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("rfi_letters")
      .select("*", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("consent_assessments")
      .select("forecast_context")
      .eq("project_id", id)
      .maybeSingle(),
    supabase
      .from("audit_log")
      .select("metadata")
      .eq("project_id", id)
      .eq("action", "project_settings_snapshot")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("attachments")
      .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type, linked_requirement_key")
      .eq("project_id", id)
      .order("uploaded_at", { ascending: false }),
  ]);
  if (!project) notFound();
  const forecastPayload =
    (assessmentRow as { forecast_context?: Record<string, unknown> | null } | null)
      ?.forecast_context ?? null;
  const settingsSnapshot = normalizeSettingsSnapshot(settingsSnapshotRows?.[0]?.metadata);
  const initialSettings = buildProjectSettingsValues(project);
  const mergedSettings: ProjectSettingsValues = settingsSnapshot
    ? {
        ...initialSettings,
        ...settingsSnapshot,
      }
    : initialSettings;

  // richAttachments was fetched in the parallel batch above; the columns below
  // only run as a fallback if that select errored (older schema variants).
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

  const bca = taxonomy.bcas.find((b) => b.id === project.bca);
  const drawingsTotal = (drawingCount ?? 0) + (cadCount ?? 0);

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          {bca?.name ?? "Project"}
        </p>
        <h1 className="font-display uppercase font-medium leading-[0.95] tracking-[0.02em] text-[36px] sm:text-[44px] text-ink-900">
          {project.address}
        </h1>
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          {taxonomy.project_types.find((t) => t.id === project.project_type)?.label ??
            project.project_type}
          {project.risk_group ? <> · risk {project.risk_group}</> : null}
          {project.importance_level ? <> · {project.importance_level}</> : null}
          {" · "}status <span className="text-accent">{project.status}</span>
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/projects/${id}/drawings`}
          className="group relative block overflow-hidden rounded-md bg-surface-raised p-6 shadow-depth transition-shadow duration-200 hover:shadow-depth-hover cursor-pointer"
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Drawings</p>
          <p className="mt-4 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-ink-900">{drawingsTotal}</p>
          <p className="mt-2 text-[11px] tracking-tight text-ink-500">
            {drawingCount ?? 0} PDF · {cadCount ?? 0} DXF
          </p>
        </Link>
        <Link
          href={`/projects/${id}/rfis`}
          className="group relative block overflow-hidden rounded-md bg-surface-raised p-6 shadow-depth transition-shadow duration-200 hover:shadow-depth-hover cursor-pointer"
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">RFI letters</p>
          <p className="mt-4 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-ink-900">{letterCount ?? 0}</p>
          <p className="mt-2 text-[11px] tracking-tight text-ink-500">
            {(letterCount ?? 0) > 0 ? "open the Council tab to respond" : "no RFIs received yet"}
          </p>
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Consent forecast
        </h2>
        <ForecastingClient
          projectId={project.id}
          initialPayload={forecastPayload}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Project settings
        </h2>
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
      </section>
    </div>
  );
}
