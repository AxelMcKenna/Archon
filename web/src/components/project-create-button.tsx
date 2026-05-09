"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

export function ProjectCreateButton() {
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
      className="rounded-sm bg-ink-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Creating..." : "Create"}
    </button>
  );
}
