import { isAllowedDocumentFile } from "@/lib/file-types";
import type { ChecklistRow, Status } from "./types";

export function statusLabel(status: Status) {
  if (status === "complete") return "completed";
  return status.replaceAll("_", " ");
}

export const checklistStatusBadge = (status: ChecklistRow["status"]): Status =>
  status === "accepted" ? "complete" : status === "uploaded" ? "in_progress" : "not_started";

export function hasAnyText(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

export const isAllowedMemorandaFile = isAllowedDocumentFile;

export function memorandaDisplayName(filename: string) {
  return filename.replace(/^LBP Memoranda \/ Record of Building Work -\s*/, "").trim() || filename;
}

export function memorandaRowFileLabel(files: Array<{ filename: string }>) {
  if (files.length <= 0) return undefined;
  if (files.length === 1) return memorandaDisplayName(files[0].filename);
  return `${files.length} file(s)`;
}
