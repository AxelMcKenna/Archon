"use client";

import { useState } from "react";
import type { Attachment } from "../types";

export function Attachments({
  attachments,
  onAttach,
  onDelete,
}: {
  attachments: Attachment[];
  onAttach: (file: File) => Promise<void>;
  onDelete: (attachmentId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function handleFile(f: File) {
    setBusy(true);
    try {
      await onAttach(f);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 border-t border-ink-700/10 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Attachments</h4>
        <label className="text-xs rounded-sm border border-ink-700/20 px-2 py-1 cursor-pointer hover:bg-ink-700/5">
          {busy ? "Uploading…" : "Add file"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {attachments.length ? (
        <ul className="space-y-1 text-xs">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-sm bg-ink-700/5 px-2 py-1">
              <span className="truncate">{a.filename}</span>
              <button
                onClick={() => onDelete(a.id)}
                className="text-ink-500 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-500">No attachments yet.</p>
      )}
    </div>
  );
}
