import {
  MANUAL_INSPECTION_TYPE_ID,
  getInspectionTypeDefinition,
  type InspectionSchedule,
  type InspectionStage,
} from "@/lib/inspections";

export type EditableInspectionStatus = "Not Conducted" | "Passed" | "Failed";

export interface InspectionPdf {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
  storageBucket?: string;
  storagePath?: string;
}

export interface InspectionRecord {
  id: string;
  baseInspectionId: string;
  inspectionTypeId: string;
  manual?: boolean;
  deleted?: boolean;
  sortOrder?: number;
  title: string;
  category: string;
  timing: string;
  requirements: string[];
  details: string;
  dueDate: string;
  bookedDate: string;
  status: EditableInspectionStatus;
  resultNotes: string;
  checklist: Record<string, boolean>;
  pdfs: InspectionPdf[];
  rescheduledFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionUpdate {
  title?: string;
  inspectionTypeId?: string;
  deleted?: boolean;
  category?: string;
  timing?: string;
  requirements?: string[];
  details?: string;
  dueDate?: string;
  bookedDate?: string;
  status?: EditableInspectionStatus;
  resultNotes?: string;
  checklist?: Record<string, boolean>;
  pdfs?: InspectionPdf[];
  sortOrder?: number;
}

export function buildInspectionRecords(
  schedule: InspectionSchedule,
  savedRecords: Record<string, InspectionRecord>,
) {
  const generatedRecords = schedule.stages.flatMap((stage, index) => {
    const saved = savedRecords[stage.id];
    if (saved?.deleted) return [];

    const sortOrder = saved?.sortOrder ?? (index + 1) * 1000;
    const record = saved
      ? mergeStageIntoRecord(stage, saved, sortOrder)
      : createRecordFromStage(stage, sortOrder);

    return [record, ...getChildInspections(record.id, savedRecords, sortOrder)];
  });

  const generatedIds = new Set(generatedRecords.map((record) => record.id));
  const manualRecords = Object.values(savedRecords).filter(
    (record) => record.manual && !record.deleted && !generatedIds.has(record.id),
  ).map((record, index) => ({
    ...record,
    inspectionTypeId: record.inspectionTypeId ?? MANUAL_INSPECTION_TYPE_ID,
    bookedDate: record.bookedDate ?? "",
    status: normalizeInspectionStatus(record.status),
    pdfs: record.pdfs ?? [],
    sortOrder: record.sortOrder ?? (generatedRecords.length + index + 1) * 1000,
  }));

  return [...generatedRecords, ...manualRecords].sort(compareInspectionRecords);
}

export function getInspectionStats(records: InspectionRecord[]) {
  const completed = records.filter(isInspectionResolved).length;
  const failed = records.filter((record) => record.status === "Failed").length;
  const length = records.length;
  const remaining = length - completed;
  const percent = records.length === 0 ? 0 : Math.round((completed / length) * 100);

  return { completed, failed, remaining, total: length, percent };
}

export function createRescheduledInspection(record: InspectionRecord): InspectionRecord {
  const now = new Date().toISOString();
  const followUpCount = record.id.match(/reinspection/g)?.length ?? 0;
  const sequence = followUpCount + 1;
  const id = `${record.id}-reinspection-${sequence}`;

  return {
    ...record,
    id,
    manual: false,
    sortOrder: (record.sortOrder ?? 0) + 100,
    title: `${record.title.replace(/\s+reinspection\s+\d+$/i, "")} reinspection ${sequence}`,
    status: "Not Conducted",
    dueDate: "",
    bookedDate: "",
    resultNotes: "",
    checklist: Object.fromEntries(record.requirements.map((requirement) => [requirement, false])),
    pdfs: [],
    rescheduledFrom: record.id,
    createdAt: now,
    updatedAt: now,
  };
}

export function shouldCreateRescheduledInspection(
  previous: InspectionRecord | undefined,
  next: InspectionRecord,
  records: Record<string, InspectionRecord>,
) {
  if (next.status !== "Failed" || previous?.status === "Failed") return false;
  return !Object.values(records).some((record) => record.rescheduledFrom === next.id);
}

export function createManualInspection(
  existingRecords: InspectionRecord[],
  inspectionTypeId = MANUAL_INSPECTION_TYPE_ID,
): InspectionRecord {
  const now = new Date().toISOString();
  const manualCount = existingRecords.filter((record) => record.manual).length + 1;
  const id = `manual-inspection-${Date.now()}`;
  const maxSortOrder = Math.max(0, ...existingRecords.map((record) => record.sortOrder ?? 0));
  const inspectionType = getInspectionTypeDefinition(inspectionTypeId);

  return {
    id,
    baseInspectionId: id,
    inspectionTypeId: inspectionType?.id ?? MANUAL_INSPECTION_TYPE_ID,
    manual: true,
    deleted: false,
    sortOrder: maxSortOrder + 1000,
    title: inspectionType?.title ?? `Manual inspection ${manualCount}`,
    category: inspectionType?.category ?? "Manual",
    timing: inspectionType?.timing ?? "User-added inspection",
    requirements: inspectionType?.requirements ?? ["Confirm inspection scope"],
    details: "",
    dueDate: "",
    bookedDate: "",
    status: "Not Conducted",
    resultNotes: "",
    checklist: { "Confirm inspection scope": false },
    pdfs: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function getCurrentInspectionIndex(records: InspectionRecord[]) {
  const index = records.findIndex((record) => !isInspectionResolved(record));
  return index === -1 ? records.length - 1 : index;
}

export function isInspectionResolved(record: InspectionRecord) {
  return record.status === "Passed" || record.status === "Failed";
}

function createRecordFromStage(stage: InspectionStage, sortOrder: number): InspectionRecord {
  const now = new Date().toISOString();

  return {
    id: stage.id,
    baseInspectionId: stage.id,
    inspectionTypeId: stage.inspectionTypeId,
    manual: false,
    deleted: false,
    sortOrder,
    title: stage.title,
    category: stage.category,
    timing: stage.timing,
    requirements: stage.requirements,
    details: "",
    dueDate: "",
    bookedDate: "",
    status: "Not Conducted",
    resultNotes: "",
    checklist: Object.fromEntries(stage.requirements.map((requirement) => [requirement, false])),
    pdfs: [],
    createdAt: now,
    updatedAt: now,
  };
}

function mergeStageIntoRecord(
  stage: InspectionStage,
  saved: InspectionRecord,
  sortOrder: number,
): InspectionRecord {
  return {
    ...saved,
    sortOrder,
    inspectionTypeId: stage.inspectionTypeId,
    title: stage.title,
    category: stage.category,
    timing: stage.timing,
    requirements: stage.requirements,
    bookedDate: saved.bookedDate ?? "",
    status: normalizeInspectionStatus(saved.status),
    pdfs: saved.pdfs ?? [],
    checklist: {
      ...Object.fromEntries(stage.requirements.map((requirement) => [requirement, false])),
      ...saved.checklist,
    },
  };
}

function getChildInspections(
  parentId: string,
  records: Record<string, InspectionRecord>,
  parentSortOrder: number,
): InspectionRecord[] {
  return Object.values(records)
    .filter((record) => record.rescheduledFrom === parentId && !record.deleted)
    .sort(compareInspectionRecords)
    .flatMap((record, index) => {
      const sortOrder = record.sortOrder ?? parentSortOrder + (index + 1) * 100;
      const child = {
        ...record,
        sortOrder,
        bookedDate: record.bookedDate ?? "",
        status: normalizeInspectionStatus(record.status),
        pdfs: record.pdfs ?? [],
      };
      return [child, ...getChildInspections(record.id, records, sortOrder)];
    });
}

function compareInspectionRecords(left: InspectionRecord, right: InspectionRecord) {
  const sortDifference = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  if (sortDifference !== 0) return sortDifference;
  return left.createdAt.localeCompare(right.createdAt);
}

function normalizeInspectionStatus(status: string): EditableInspectionStatus {
  if (status === "Passed" || status === "Failed") return status;
  return "Not Conducted";
}
