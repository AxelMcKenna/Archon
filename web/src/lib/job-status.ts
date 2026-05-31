// Analysis (plan / CAD / value-engineering) runs synchronously inside the
// upload request and the row is written to its terminal "analysed"/"failed"
// state before the request returns. So a row still sitting in an in-progress
// state long after it was created means the worker died mid-run (request
// timeout, deploy, crash) — the DB write that would have marked it failed
// never happened. Treat such rows as "stalled" so the UI can show a
// recoverable message instead of an endless spinner.

const STALL_AFTER_MS = 5 * 60 * 1000; // 5 minutes

const IN_PROGRESS_STATUSES = new Set(["pending", "analysing", "processing"]);

export function isInProgress(status: string | null | undefined): boolean {
  return IN_PROGRESS_STATUSES.has(status ?? "");
}

export function isStalled(
  status: string | null | undefined,
  createdAt: string | null | undefined,
): boolean {
  if (!isInProgress(status) || !createdAt) return false;
  const startedMs = new Date(createdAt).getTime();
  if (Number.isNaN(startedMs)) return false;
  return Date.now() - startedMs > STALL_AFTER_MS;
}

/**
 * Returns the status to drive UI off of: the raw status, or "stalled" when an
 * in-progress row has clearly been abandoned.
 */
export function effectiveStatus(
  status: string | null | undefined,
  createdAt: string | null | undefined,
): string {
  return isStalled(status, createdAt) ? "stalled" : status ?? "";
}
