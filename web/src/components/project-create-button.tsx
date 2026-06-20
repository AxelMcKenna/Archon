"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function ProjectCreateButton({
  idleLabel = "Create",
  pendingLabel = "Creating...",
}: {
  idleLabel?: string;
  pendingLabel?: string;
}) {
  const lockedRef = useRef(false);
  const { pending } = useFormStatus();
  const disabled = pending || lockedRef.current;

  return (
    <button
      type="submit"
      disabled={disabled}
      onClick={() => {
        lockedRef.current = true;
      }}
      className="inline-flex items-center gap-2 rounded-sm bg-ink-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
