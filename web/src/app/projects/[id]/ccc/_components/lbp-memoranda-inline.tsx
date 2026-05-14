"use client";

import { useRef, useState } from "react";
import { formatFileSize, formatUploadedDate } from "@/lib/format";
import { DOCUMENT_ACCEPT } from "@/lib/file-types";
import type { LbpMemorandaFile } from "../types";

export function LbpMemorandaInlineSection({
  files,
  uploading,
  onUpload,
  onNameChange,
  onNamePersist,
  onDelete,
  onPreview,
}: {
  files: LbpMemorandaFile[];
  uploading: boolean;
  onUpload: (files: FileList | null) => Promise<void>;
  onNameChange: (fileId: string, lbpName: string) => void;
  onNamePersist: (fileId: string, lbpName: string) => Promise<void>;
  onDelete: (file: LbpMemorandaFile) => Promise<void>;
  onPreview: (file: LbpMemorandaFile) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={DOCUMENT_ACCEPT}
        onChange={(event) => {
          void onUpload(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void onUpload(event.dataTransfer.files);
        }}
        className={`rounded-md border border-dashed px-2 py-1 text-xs transition ${
          dragOver
            ? "border-ink-500 bg-ink-100 text-ink-900"
            : "border-ink-200 hover:bg-ink-50"
        }`}
      >
        {uploading ? "Uploading..." : "Upload / Drop"}
      </button>
      <p className="text-xs text-ink-600">Upload one memoranda per LBP</p>

      <div className="max-h-80 overflow-auto rounded-md border border-ink-100 bg-surface-raised">
        {files.length === 0 ? (
          <div className="px-3 py-4 text-xs text-ink-500">No files uploaded yet.</div>
        ) : (
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-ink-50 text-left text-ink-600">
              <tr>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">LBP name</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const fileLabel = file.filename.replace(/^LBP Memoranda \/ Record of Building Work -\s*/, "");
                return (
                  <tr key={file.id} className="border-t border-ink-100 align-top">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left text-sm text-blue-700 underline underline-offset-2"
                        onClick={() => void onPreview(file)}
                      >
                        {fileLabel}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-700">{formatFileSize(file.sizeBytes)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-700">{formatUploadedDate(file.uploadedAt)}</td>
                    <td className="px-3 py-2">
                      <input
                        value={file.lbpName}
                        onChange={(event) => onNameChange(file.id, event.target.value)}
                        onBlur={(event) => {
                          void onNamePersist(file.id, event.target.value.trim());
                        }}
                        className="w-full min-w-[180px] rounded-sm border border-ink-200 px-2.5 py-2 text-xs"
                        placeholder="Enter LBP name"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded-sm border border-red-200 px-2 py-1.5 text-xs text-red-700"
                        onClick={() => void onDelete(file)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
