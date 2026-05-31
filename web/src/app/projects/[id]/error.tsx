"use client";

import { useEffect } from "react";
import Link from "next/link";

// Scoped boundary for a single project's pages: a crash inside (e.g. drawings,
// RFIs, inspections) is contained here and keeps the project subnav mounted,
// so the user can switch tabs instead of losing the whole project view.
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[project-error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-10 py-16 text-center">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">Something went wrong</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink-900">
        This view couldn&apos;t load
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        The error has been logged. Try again, or pick another tab above.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs text-ink-400">Ref: {error.digest}</span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-sm bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700"
      >
        Try again
      </button>
      <Link
        href="/projects"
        className="ml-3 rounded-sm border border-ink-900/15 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
      >
        All projects
      </Link>
    </div>
  );
}
