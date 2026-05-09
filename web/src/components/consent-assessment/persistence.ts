import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type {
  ChecklistResult,
  CompletionRecord,
  StoredManualConsentDocument,
  UploadRecord,
} from "./model";

export interface ConsentAssessmentRow {
  checklist: ChecklistResult | null;
  manualDocuments: StoredManualConsentDocument[];
  hiddenDocumentIds: string[];
  documentOrder: string[];
  uploads: Record<string, UploadRecord>;
  completions: Record<string, CompletionRecord>;
  forecastContext: Record<string, unknown> | null;
}

export const EMPTY_ROW: ConsentAssessmentRow = {
  checklist: null,
  manualDocuments: [],
  hiddenDocumentIds: [],
  documentOrder: [],
  uploads: {},
  completions: {},
  forecastContext: null,
};

interface RawRow {
  checklist: ChecklistResult | null;
  manual_documents: StoredManualConsentDocument[] | null;
  hidden_document_ids: string[] | null;
  document_order: string[] | null;
  uploads: Record<string, UploadRecord> | null;
  completions: Record<string, CompletionRecord> | null;
  forecast_context: Record<string, unknown> | null;
}

function fromRow(row: RawRow): ConsentAssessmentRow {
  return {
    checklist: row.checklist ?? null,
    manualDocuments: row.manual_documents ?? [],
    hiddenDocumentIds: row.hidden_document_ids ?? [],
    documentOrder: row.document_order ?? [],
    uploads: row.uploads ?? {},
    completions: row.completions ?? {},
    forecastContext: row.forecast_context ?? null,
  };
}

export async function loadConsentAssessment(
  client: SupabaseClient,
  projectId: string,
): Promise<ConsentAssessmentRow> {
  const { data, error } = await client
    .from("consent_assessments")
    .select(
      "checklist, manual_documents, hidden_document_ids, document_order, uploads, completions, forecast_context",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !data) return EMPTY_ROW;
  return fromRow(data as unknown as RawRow);
}

export async function saveConsentAssessment(
  client: SupabaseClient,
  projectId: string,
  row: ConsentAssessmentRow,
): Promise<void> {
  const { error } = await client.from("consent_assessments").upsert(
    {
      project_id: projectId,
      checklist: row.checklist,
      manual_documents: row.manualDocuments,
      hidden_document_ids: row.hiddenDocumentIds,
      document_order: row.documentOrder,
      uploads: row.uploads,
      completions: row.completions,
      forecast_context: row.forecastContext,
    },
    { onConflict: "project_id" },
  );
  if (error) {
    console.warn("[consent-assessment] save failed", error.message);
  }
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
  return (data as { forecast_context: Record<string, unknown> | null }).forecast_context ?? null;
}

export function browserClient() {
  return getSupabaseBrowser();
}
