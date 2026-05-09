/**
 * Row builders + Supabase helpers for the inspections feature.
 *
 * This file disappeared from the working tree at some point in a merge; it's
 * not in `git ls-files`, but `use-inspections.ts` imports five things from it
 * (the five exports below). Reconstructed from the live Supabase schema:
 *
 *   public.project_inspections
 *     project_id, inspection_id, base_inspection_id, inspection_type_id,
 *     manual, deleted, sort_order, title, category, timing, requirements,
 *     details, due_date, booked_date, status, result_notes, rescheduled_from,
 *     created_at, updated_at
 *
 *   public.project_inspection_checklist_items
 *     project_id, inspection_id, requirement, checked, sort_order, updated_at
 *     (PK: project_id, inspection_id, sort_order)
 *
 *   public.project_inspection_pdfs
 *     id, project_id, inspection_id, name, size_bytes, storage_bucket,
 *     storage_path, uploaded_at
 */

import type { InspectionPdf, InspectionRecord } from "./model";

export const INSPECTION_PDF_BUCKET = "inspection-pdfs";

export function inspectionToRow(projectId: string, record: InspectionRecord) {
  return {
    project_id: projectId,
    inspection_id: record.id,
    base_inspection_id: record.baseInspectionId,
    inspection_type_id: record.inspectionTypeId,
    manual: record.manual ?? false,
    deleted: record.deleted ?? false,
    sort_order: record.sortOrder ?? 0,
    title: record.title,
    category: record.category,
    timing: record.timing,
    requirements: record.requirements,
    details: record.details,
    due_date: record.dueDate || null,
    booked_date: record.bookedDate || null,
    status: record.status,
    result_notes: record.resultNotes,
    rescheduled_from: record.rescheduledFrom ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function checklistToRows(projectId: string, record: InspectionRecord) {
  return record.requirements.map((requirement, index) => ({
    project_id: projectId,
    inspection_id: record.id,
    requirement,
    checked: Boolean(record.checklist[requirement]),
    sort_order: (index + 1) * 1000,
    updated_at: record.updatedAt,
  }));
}

export function pdfToRow(
  projectId: string,
  inspectionId: string,
  pdf: InspectionPdf,
) {
  return {
    id: pdf.id,
    project_id: projectId,
    inspection_id: inspectionId,
    name: pdf.name,
    size_bytes: pdf.size,
    storage_bucket: pdf.storageBucket ?? INSPECTION_PDF_BUCKET,
    storage_path: pdf.storagePath ?? "",
    uploaded_at: pdf.uploadedAt,
  };
}

/**
 * True when a Supabase error indicates the inspection tables don't exist
 * yet — lets the UI degrade gracefully (treat as "no records") instead of
 * surfacing a "relation does not exist" error.
 */
export function isMissingInspectionTables(error: { message?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("project_inspections") ||
    message.includes("project_inspection_checklist_items") ||
    message.includes("project_inspection_pdfs")
  ) && (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("could not find")
  );
}
