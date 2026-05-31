"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console (and any attached monitoring) for debugging.
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Something went wrong</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
        This page hit an unexpected error
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        The error has been logged. You can try again, or head back to your projects.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs text-ink-400">Ref: {error.digest}</span>
        ) : null}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-sm bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700"
        >
          Try again
        </button>
        <Link
          href="/projects"
          className="rounded-sm border border-ink-900/15 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
        >
          Back to projects
        </Link>
      </div>
    </div>
  );
}
