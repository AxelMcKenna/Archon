"use client";

import { Fragment, useRef, type Dispatch, type SetStateAction } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import { DOCUMENT_ACCEPT } from "@/lib/file-types";
import { statusTone } from "../constants";
import { checklistStatusBadge } from "../helpers";
import type {
  ChecklistRow,
  Form6AEntry,
  Form6ANonRestrictedEntry,
  LbpMemorandaFile,
} from "../types";
import { FormInlineSection } from "./form-inline-section";
import { Form6AInlineTable } from "./form-6a-inline-table";
import { SpecifiedSystemsInlineSection } from "./specified-systems-inline";

export function ChecklistTable({
  rows,
  uploadingRowId,
  dragOverRowId,
  onDragEnter,
  onDragLeave,
  onUpload,
  formPanelOpenByRow,
  onToggleFormPanel,
  form6AEntries,
  setForm6AEntries,
  form6ANonRestrictedEntries,
  setForm6ANonRestrictedEntries,
  form6ACompletionDate,
  setForm6ACompletionDate,
  onUploadLbpMemoranda,
  noSpecifiedSystems,
  setNoSpecifiedSystems,
  selectedSpecifiedSystems,
  setSelectedSpecifiedSystems,
}: {
  rows: ChecklistRow[];
  uploadingRowId: string | null;
  dragOverRowId: string | null;
  onDragEnter: (id: string) => void;
  onDragLeave: (id: string) => void;
  onUpload: (id: string, files: FileList | null) => Promise<void>;
  formPanelOpenByRow: Record<string, boolean>;
  onToggleFormPanel: (id: string) => void;
  form6AEntries: Form6AEntry[];
  setForm6AEntries: Dispatch<SetStateAction<Form6AEntry[]>>;
  form6ANonRestrictedEntries: Form6ANonRestrictedEntry[];
  setForm6ANonRestrictedEntries: Dispatch<SetStateAction<Form6ANonRestrictedEntry[]>>;
  form6ACompletionDate: string;
  setForm6ACompletionDate: Dispatch<SetStateAction<string>>;
  lbpMemorandaFiles: LbpMemorandaFile[];
  onUploadLbpMemoranda: (files: FileList | null) => Promise<void>;
  onUpdateLbpMemorandaName: (fileId: string, lbpName: string) => void;
  onPersistLbpMemorandaName: (fileId: string, lbpName: string) => Promise<void>;
  onRemoveLbpMemorandaFile: (file: LbpMemorandaFile) => Promise<void>;
  onPreviewLbpMemorandaFile: (file: LbpMemorandaFile) => Promise<void>;
  noSpecifiedSystems: boolean;
  setNoSpecifiedSystems: Dispatch<SetStateAction<boolean>>;
  selectedSpecifiedSystems: string[];
  setSelectedSpecifiedSystems: Dispatch<SetStateAction<string[]>>;
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="overflow-x-auto rounded-md border border-ink-100">
      <table className="min-w-full table-fixed text-xs">
        <thead className="bg-ink-50 text-left text-ink-500">
          <tr>
            <th className="w-[28%] px-2.5 py-2">Document</th>
            <th className="w-[42%] px-2.5 py-2">Description</th>
            <th className="w-[15%] px-2.5 py-2">Status</th>
            <th className="w-[15%] px-2.5 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = checklistStatusBadge(row.status);
            const uploadDisabled = uploadingRowId === row.id;
            return (
              <Fragment key={row.id}>
                <tr className="border-t border-ink-100">
                <td className="px-2.5 py-2">{row.name}</td>
                <td className="px-2.5 py-2">{row.description}</td>
                <td className="px-2.5 py-2">
                  <StatusPill tone={statusTone[badge]} className="whitespace-nowrap text-[11px]">
                    {row.status.replaceAll("_", " ")}
                  </StatusPill>
                  {row.fileName && <div className="mt-1 text-xs text-ink-700">✓ {row.fileName}</div>}
                </td>
                <td className="px-2.5 py-2">
                  {row.id === "2" || row.id === "9" ? (
                    <button
                      type="button"
                      onClick={() => onToggleFormPanel(row.id)}
                      className="rounded-md border border-ink-200 px-2 py-1 text-xs hover:bg-ink-50"
                    >
                      {formPanelOpenByRow[row.id] ? "Hide form" : "Fill in"}
                    </button>
                  ) : (
                    <>
                      <input
                    ref={(element) => {
                      inputRefs.current[row.id] = element;
                    }}
                    type="file"
                    className="hidden"
                    multiple={row.id === "2m"}
                    accept={row.id === "2m" ? DOCUMENT_ACCEPT : undefined}
                    onChange={(event) => {
                      if (row.id === "2m") {
                        void onUploadLbpMemoranda(event.target.files);
                      } else {
                        void onUpload(row.id, event.target.files);
                      }
                      event.target.value = "";
                    }}
                  />
                      <button
                    type="button"
                    onClick={() => inputRefs.current[row.id]?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      onDragEnter(row.id);
                    }}
                    onDragLeave={() => onDragLeave(row.id)}
                    onDrop={(event) => {
                      event.preventDefault();
                      onDragLeave(row.id);
                      if (row.id === "2m") {
                        void onUploadLbpMemoranda(event.dataTransfer.files);
                      } else {
                        void onUpload(row.id, event.dataTransfer.files);
                      }
                    }}
                    disabled={uploadDisabled}
                    className={`rounded-md border border-dashed px-2 py-1 text-xs transition ${
                      dragOverRowId === row.id
                        ? "border-ink-500 bg-ink-100 text-ink-900"
                        : "border-ink-200 hover:bg-ink-50"
                    } disabled:opacity-60`}
                  >
                    {uploadingRowId === row.id ? "Uploading..." : "Upload / Drop"}
                      </button>
                    </>
                  )}
                </td>
                </tr>
                {(row.id === "2" || row.id === "9") && formPanelOpenByRow[row.id] && (
                <tr className="border-t border-ink-100 bg-ink-50/40">
                  <td colSpan={4} className="px-3 py-3">
                    {row.id === "2" ? (
                      <FormInlineSection title="Record of Building Work Carried Out or Supervised" subtitle={row.description}>
                      <Form6AInlineTable
                        completionDate={form6ACompletionDate}
                        onCompletionDateChange={setForm6ACompletionDate}
                        entries={form6AEntries}
                        nonRestrictedEntries={form6ANonRestrictedEntries}
                        onChange={setForm6AEntries}
                        onChangeNonRestricted={setForm6ANonRestrictedEntries}
                      />
                      </FormInlineSection>
                    ) : (
                      <FormInlineSection
                        title="Specified Systems"
                        subtitle="The following specified systems are contained on the compliance schedule for the building and, in the opinion of the personnel who installed them, are capable of performing to the performance standards set out in the building consent:"
                      >
                        <SpecifiedSystemsInlineSection
                          noSpecifiedSystems={noSpecifiedSystems}
                          onNoSpecifiedSystemsChange={setNoSpecifiedSystems}
                          selectedCodes={selectedSpecifiedSystems}
                          onSelectedCodesChange={setSelectedSpecifiedSystems}
                        />
                      </FormInlineSection>
                    )}
                  </td>
                </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
