"use client";

import { useState, useTransition } from "react";

export function SettingsDeleteProjectButton({
  onDelete,
  projectLabel,
}: {
  onDelete: () => Promise<void>;
  projectLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-medium text-red-700 transition hover:text-red-800 cursor-pointer"
      >
        Delete
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-sm border border-slate-200 bg-surface-raised p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-950">Delete project?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Permanently delete <strong className="text-slate-900">{projectLabel}</strong>? This cannot be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-sm border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    await onDelete();
                    setOpen(false);
                  });
                }}
                disabled={isPending}
                className="rounded-sm bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
