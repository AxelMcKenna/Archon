"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";

export function SettingsDeleteProjectButton({
  onDelete,
  projectLabel,
  title = "Delete project?",
  description,
  triggerLabel = "Delete",
  confirmLabel = "Confirm Delete",
  pendingLabel = "Deleting…",
  triggerClassName = "cursor-pointer text-[12px] font-medium text-red-700 transition hover:text-red-800",
}: {
  onDelete: () => void | Promise<void>;
  projectLabel: string;
  title?: string;
  description?: ReactNode;
  triggerLabel?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-md rounded-sm border border-slate-200 bg-surface-raised p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {description ?? (
                <>
                  Permanently delete <strong className="text-slate-900">{projectLabel}</strong>? This cannot be undone.
                </>
              )}
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
                    try {
                      await Promise.resolve(onDelete());
                      setOpen(false);
                    } catch (error) {
                      console.error("[delete-modal] delete failed", error);
                    }
                  });
                }}
                disabled={isPending}
                className="rounded-sm bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? pendingLabel : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
