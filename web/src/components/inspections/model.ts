import type { InspectionSchedule, InspectionStage } from "@/lib/inspections";

export type EditableInspectionStatus = "Not booked" | "Booked" | "Passed" | "Failed" | "Rescheduled";

export interface InspectionRecord {
  id: string;
  baseInspectionId: string;
  manual?: boolean;
  title: string;
  category: string;
  timing: string;
  requirements: string[];
  details: string;
  dueDate: string;
  status: EditableInspectionStatus;
  resultNotes: string;
  checklist: Record<string, boolean>;
  rescheduledFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionUpdate {
  title?: string;
  category?: string;
  timing?: string;
  requirements?: string[];
  details?: string;
  dueDate?: string;
  status?: EditableInspectionStatus;
  resultNotes?: string;
  checklist?: Record<string, boolean>;
}

export function buildInspectionRecords(
  schedule: InspectionSchedule,
  savedRecords: Record<string, InspectionRecord>,
) {
  const generatedRecords = schedule.stages.flatMap((stage) => {
    const saved = savedRecords[stage.id];
    const record = saved ? mergeStageIntoRecord(stage, saved) : createRecordFromStage(stage);
    return [record, ...getChildInspections(record.id, savedRecords)];
  });

  const generatedIds = new Set(generatedRecords.map((record) => record.id));
  const manualRecords = Object.values(savedRecords).filter(
    (record) => record.manual && !generatedIds.has(record.id),
  );

  return [...generatedRecords, ...manualRecords].sort(compareManualInspections);
}

export function getInspectionStats(records: InspectionRecord[]) {
  const completed = records.filter((record) => record.status === "Passed").length;
  const failed = records.filter((record) => record.status === "Failed").length;
  const length = records.length - failed;
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
    title: `${record.title.replace(/\s+reinspection\s+\d+$/i, "")} reinspection ${sequence}`,
    status: "Rescheduled",
    dueDate: "",
    resultNotes: "",
    checklist: Object.fromEntries(record.requirements.map((requirement) => [requirement, false])),
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

export function createManualInspection(existingRecords: InspectionRecord[]): InspectionRecord {
  const now = new Date().toISOString();
  const manualCount = existingRecords.filter((record) => record.manual).length + 1;
  const id = `manual-inspection-${Date.now()}`;

  return {
    id,
    baseInspectionId: id,
    manual: true,
    title: `Manual inspection ${manualCount}`,
    category: "Manual",
    timing: "User-added inspection",
    requirements: ["Confirm inspection scope"],
    details: "",
    dueDate: "",
    status: "Not booked",
    resultNotes: "",
    checklist: { "Confirm inspection scope": false },
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

function createRecordFromStage(stage: InspectionStage): InspectionRecord {
  const now = new Date().toISOString();

  return {
    id: stage.id,
    baseInspectionId: stage.id,
    manual: false,
    title: stage.title,
    category: stage.category,
    timing: stage.timing,
    requirements: stage.requirements,
    details: "",
    dueDate: "",
    status: stage.status === "Upcoming" ? "Not booked" : "Not booked",
    resultNotes: "",
    checklist: Object.fromEntries(stage.requirements.map((requirement) => [requirement, false])),
    createdAt: now,
    updatedAt: now,
  };
}

function mergeStageIntoRecord(stage: InspectionStage, saved: InspectionRecord): InspectionRecord {
  return {
    ...saved,
    title: stage.title,
    category: stage.category,
    timing: stage.timing,
    requirements: stage.requirements,
    checklist: {
      ...Object.fromEntries(stage.requirements.map((requirement) => [requirement, false])),
      ...saved.checklist,
    },
  };
}

function getChildInspections(parentId: string, records: Record<string, InspectionRecord>): InspectionRecord[] {
  return Object.values(records)
    .filter((record) => record.rescheduledFrom === parentId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .flatMap((record) => [record, ...getChildInspections(record.id, records)]);
}

function compareManualInspections(left: InspectionRecord, right: InspectionRecord) {
  if (!left.manual || !right.manual) return 0;
  return left.createdAt.localeCompare(right.createdAt);
}
