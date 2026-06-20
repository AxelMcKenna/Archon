import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1700px] space-y-4 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="rounded-2xl border border-ink-700/10 bg-surface-raised shadow-sm overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-b border-ink-700/[0.06] px-6 py-4 last:border-b-0"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
