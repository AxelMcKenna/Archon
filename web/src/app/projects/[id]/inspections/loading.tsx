import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-ink-700/10 bg-surface-raised p-8 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-ink-700/10 bg-surface-raised p-6 shadow-sm space-y-3"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr),minmax(18rem,0.9fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink-700/10 bg-surface-raised p-8 shadow-sm space-y-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-ink-700/10 bg-surface-raised p-8 shadow-sm space-y-4">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-ink-700/10 bg-surface-raised p-8 shadow-sm space-y-4">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    </div>
  );
}
