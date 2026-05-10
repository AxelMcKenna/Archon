import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type {
  ChecklistResult,
  CompletionRecord,
  SubmissionPackage,
  StoredManualConsentDocument,
  UploadRecord,
} from "./model";

export interface ConsentAssessmentRow {
  checklist: ChecklistResult | null;
  manualDocuments: StoredManualConsentDocument[];
  hiddenDocumentIds: string[];
  documentOrder: string[];
  uploads: Record<string, UploadRecord[]>;
  completions: Record<string, CompletionRecord>;
  forecastContext: Record<string, unknown> | null;
  submissionPackages: SubmissionPackage[];
  documentSubmissionIds: Record<string, string>;
}

export const EMPTY_ROW: ConsentAssessmentRow = {
  checklist: null,
  manualDocuments: [],
  hiddenDocumentIds: [],
  documentOrder: [],
  uploads: {},
  completions: {},
  forecastContext: null,
  submissionPackages: [],
  documentSubmissionIds: {},
};

interface RawRow {
  checklist: ChecklistResult | null;
  manual_documents: StoredManualConsentDocument[] | null;
  hidden_document_ids: string[] | null;
  document_order: string[] | null;
  uploads: Record<string, UploadRecord | UploadRecord[]> | null;
  completions: Record<string, CompletionRecord> | null;
  forecast_context: Record<string, unknown> | null;
  submission_packages?: SubmissionPackage[] | null;
  document_submission_ids?: Record<string, string> | null;
}

function fromRow(row: RawRow): ConsentAssessmentRow {
  const legacySubmissionFallback = getLegacySubmissionFallback(row.forecast_context);

  return {
    checklist: row.checklist ?? null,
    manualDocuments: row.manual_documents ?? [],
    hiddenDocumentIds: row.hidden_document_ids ?? [],
    documentOrder: row.document_order ?? [],
    uploads: normalizeUploads(row.uploads),
    completions: row.completions ?? {},
    forecastContext: stripLegacySubmissionFallback(row.forecast_context),
    submissionPackages: normalizeSubmissionPackages(
      row.submission_packages ?? legacySubmissionFallback.submissionPackages,
    ),
    documentSubmissionIds:
      row.document_submission_ids ?? legacySubmissionFallback.documentSubmissionIds,
  };
}

export async function loadConsentAssessment(
  client: SupabaseClient,
  projectId: string,
): Promise<ConsentAssessmentRow> {
  const fullQuery = await client
    .from("consent_assessments")
    .select(
      "checklist, manual_documents, hidden_document_ids, document_order, uploads, completions, forecast_context, submission_packages, document_submission_ids",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (!fullQuery.error) {
    if (!fullQuery.data) return EMPTY_ROW;
    return fromRow(fullQuery.data as unknown as RawRow);
  }

  if (!isMissingSubmissionColumnsError(fullQuery.error)) {
    return EMPTY_ROW;
  }

  const legacyQuery = await client
    .from("consent_assessments")
    .select(
      "checklist, manual_documents, hidden_document_ids, document_order, uploads, completions, forecast_context",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (legacyQuery.error || !legacyQuery.data) return EMPTY_ROW;
  return fromRow(legacyQuery.data as unknown as RawRow);
}

export async function saveConsentAssessment(
  client: SupabaseClient,
  projectId: string,
  row: ConsentAssessmentRow,
): Promise<void> {
  const fullSave = await client.from("consent_assessments").upsert(
    {
      project_id: projectId,
      checklist: row.checklist,
      manual_documents: row.manualDocuments,
      hidden_document_ids: row.hiddenDocumentIds,
      document_order: row.documentOrder,
      uploads: row.uploads,
      completions: row.completions,
      forecast_context: row.forecastContext,
      submission_packages: row.submissionPackages,
      document_submission_ids: row.documentSubmissionIds,
    },
    { onConflict: "project_id" },
  );
  if (!fullSave.error) {
    return;
  }

  if (isMissingSubmissionColumnsError(fullSave.error)) {
    const legacyForecastContext = mergeLegacySubmissionFallback(
      row.forecastContext,
      row.submissionPackages,
      row.documentSubmissionIds,
    );
    const { error } = await client.from("consent_assessments").upsert(
      {
        project_id: projectId,
        checklist: row.checklist,
        manual_documents: row.manualDocuments,
        hidden_document_ids: row.hiddenDocumentIds,
        document_order: row.documentOrder,
        uploads: row.uploads,
        completions: row.completions,
        forecast_context: legacyForecastContext,
      },
      { onConflict: "project_id" },
    );
    if (!error) {
      return;
    }
    console.warn("[consent-assessment] save failed", error.message);
    return;
  }

  console.warn("[consent-assessment] save failed", fullSave.error.message);
}

export async function loadForecastContext(
  client: SupabaseClient,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from("consent_assessments")
    .select("forecast_context")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return stripLegacySubmissionFallback(
    (data as { forecast_context: Record<string, unknown> | null }).forecast_context ?? null,
  );
}

export function browserClient() {
  return getSupabaseBrowser();
}

function isMissingSubmissionColumnsError(error: { message?: string | null }) {
  const message = String(error.message ?? "");
  return (
    message.includes("submission_packages") ||
    message.includes("document_submission_ids")
  );
}

function normalizeUploads(
  uploads: Record<string, UploadRecord | UploadRecord[]> | null | undefined,
): Record<string, UploadRecord[]> {
  const normalized: Record<string, UploadRecord[]> = {};
  for (const [documentId, value] of Object.entries(uploads ?? {})) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    normalized[documentId] = list.filter(Boolean).map((upload) => ({
      id: upload.id,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      uploadedAt: upload.uploadedAt,
      storagePath: upload.storagePath,
      mimeType: upload.mimeType ?? null,
    }));
  }
  return normalized;
}

function normalizeSubmissionPackages(submissionPackages: SubmissionPackage[] | null | undefined) {
  return (submissionPackages ?? []).map((submissionPackage) => ({
    ...submissionPackage,
    status: submissionPackage.status ?? "draft",
    submittedAt: submissionPackage.submittedAt ?? null,
    councilUrl: submissionPackage.councilUrl ?? null,
  }));
}

function getLegacySubmissionFallback(
  forecastContext: Record<string, unknown> | null | undefined,
): Pick<ConsentAssessmentRow, "submissionPackages" | "documentSubmissionIds"> {
  const submissionPackages = Array.isArray(forecastContext?.__submission_packages)
    ? normalizeSubmissionPackages(
        forecastContext.__submission_packages as SubmissionPackage[],
      )
    : [];
  const documentSubmissionIds =
    forecastContext?.__document_submission_ids &&
    typeof forecastContext.__document_submission_ids === "object"
      ? (forecastContext.__document_submission_ids as Record<string, string>)
      : {};

  return {
    submissionPackages,
    documentSubmissionIds,
  };
}

function mergeLegacySubmissionFallback(
  forecastContext: Record<string, unknown> | null,
  submissionPackages: SubmissionPackage[],
  documentSubmissionIds: Record<string, string>,
) {
  return {
    ...(forecastContext ?? {}),
    __submission_packages: normalizeSubmissionPackages(submissionPackages),
    __document_submission_ids: documentSubmissionIds,
  };
}

function stripLegacySubmissionFallback(
  forecastContext: Record<string, unknown> | null | undefined,
) {
  if (!forecastContext) {
    return null;
  }

  const next = { ...forecastContext };
  delete next.__submission_packages;
  delete next.__document_submission_ids;

  return Object.keys(next).length > 0 ? next : null;
}
