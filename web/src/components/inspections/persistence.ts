import type { InspectionPdf, InspectionRecord } from "./model";

export const INSPECTION_PDF_BUCKET = "inspection-pdfs";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => unknown;
  };
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>;
    };
  };
};

export interface InspectionRow {
  project_id: string;
  inspection_id: string;
  base_inspection_id: string;
  inspection_type_id: string;
  manual: boolean;
  deleted: boolean;
  sort_order: number;
  title: string;
  category: string;
  timing: string;
  requirements: string[];
  details: string;
  due_date: string | null;
  booked_date: string | null;
  status: string;
  result_notes: string;
  rescheduled_from: string | null;
  created_at: string;
  updated_at: string;
  project_inspection_checklist_items?: ChecklistItemRow[];
  project_inspection_pdfs?: PdfRow[];
}

export interface ChecklistItemRow {
  requirement: string;
  checked: boolean;
  sort_order: number;
}

export interface PdfRow {
  id: string;
  name: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  uploaded_at: string;
}

export function inspectionToRow(projectId: string, inspection: InspectionRecord) {
  return {
    project_id: projectId,
    inspection_id: inspection.id,
    base_inspection_id: inspection.baseInspectionId,
    inspection_type_id: inspection.inspectionTypeId,
    manual: Boolean(inspection.manual),
    deleted: Boolean(inspection.deleted),
    sort_order: inspection.sortOrder ?? 0,
    title: inspection.title,
    category: inspection.category,
    timing: inspection.timing,
    requirements: inspection.requirements,
    details: inspection.details,
    due_date: inspection.dueDate || null,
    booked_date: inspection.bookedDate || null,
    status: inspection.status,
    result_notes: inspection.resultNotes,
    rescheduled_from: inspection.rescheduledFrom ?? null,
    created_at: inspection.createdAt,
    updated_at: inspection.updatedAt,
  };
}

export function checklistToRows(projectId: string, inspection: InspectionRecord) {
  return inspection.requirements.map((requirement, index) => ({
    project_id: projectId,
    inspection_id: inspection.id,
    requirement,
    checked: Boolean(inspection.checklist[requirement]),
    sort_order: (index + 1) * 1000,
    updated_at: inspection.updatedAt,
  }));
}

export function pdfToRow(projectId: string, inspectionId: string, pdf: InspectionPdf) {
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

export async function loadInspectionRecords(
  supabase: SupabaseLike,
  projectId: string,
): Promise<Record<string, InspectionRecord>> {
  const query = supabase
    .from("project_inspections")
    .select(`
      *,
      project_inspection_checklist_items (
        requirement,
        checked,
        sort_order
      ),
      project_inspection_pdfs (
        id,
        name,
        size_bytes,
        storage_bucket,
        storage_path,
        uploaded_at
      )
    `) as {
    eq: (column: string, value: string) => {
      order: (column: string, options?: { ascending?: boolean }) => Promise<{
        data: InspectionRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  };

  const { data, error } = await query
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingInspectionTables(error)) {
      return {};
    }

    throw new Error(error.message || "Unable to load inspection records.");
  }

  const entries = await Promise.all((data ?? []).map(async (row) => [row.inspection_id, await rowToInspection(row, supabase)] as const));
  return Object.fromEntries(entries);
}

export function isMissingInspectionTables(error: { message?: string }) {
  const message = String(error.message ?? "").toLowerCase();
  return (
    (message.includes("project_inspections") ||
      message.includes("project_inspection_checklist_items") ||
      message.includes("project_inspection_pdfs")) &&
    (message.includes("could not find the table") ||
      message.includes("schema cache") ||
      message.includes("does not exist"))
  );
}

async function rowToInspection(row: InspectionRow, supabase: SupabaseLike): Promise<InspectionRecord> {
  const checklistRows = [...(row.project_inspection_checklist_items ?? [])].sort(
    (left, right) => left.sort_order - right.sort_order,
  );
  const pdfRows = [...(row.project_inspection_pdfs ?? [])].sort(
    (left, right) => left.uploaded_at.localeCompare(right.uploaded_at),
  );

  return {
    id: row.inspection_id,
    baseInspectionId: row.base_inspection_id,
    inspectionTypeId: row.inspection_type_id,
    manual: row.manual,
    deleted: row.deleted,
    sortOrder: row.sort_order,
    title: row.title,
    category: row.category,
    timing: row.timing,
    requirements: row.requirements ?? [],
    details: row.details ?? "",
    dueDate: row.due_date ?? "",
    bookedDate: row.booked_date ?? "",
    status: row.status === "Passed" || row.status === "Failed" ? row.status : "Not Conducted",
    resultNotes: row.result_notes ?? "",
    checklist: Object.fromEntries(checklistRows.map((item) => [item.requirement, item.checked])),
    pdfs: await Promise.all(pdfRows.map((pdf) => rowToPdf(pdf, supabase))),
    rescheduledFrom: row.rescheduled_from ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function rowToPdf(row: PdfRow, supabase: SupabaseLike): Promise<InspectionPdf> {
  const { data } = await supabase.storage
    .from(row.storage_bucket || INSPECTION_PDF_BUCKET)
    .createSignedUrl(row.storage_path, 60 * 60);

  return {
    id: row.id,
    name: row.name,
    size: Number(row.size_bytes),
    uploadedAt: row.uploaded_at,
    dataUrl: data?.signedUrl ?? "",
    storageBucket: row.storage_bucket || INSPECTION_PDF_BUCKET,
    storagePath: row.storage_path,
  };
}
