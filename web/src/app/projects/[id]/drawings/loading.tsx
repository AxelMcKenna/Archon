import {
  Skeleton,
  SkeletonHeader,
  SkeletonListRow,
} from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <SkeletonHeader eyebrowWidth="w-24" titleWidth="w-40" />
      </header>

      <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-32 w-full" />
      </section>

      <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
        <Skeleton className="h-3 w-32" />
        <ul className="divide-y divide-ink-200/70 rounded-sm bg-surface-raised ring-1 ring-ink-700/10 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonListRow key={i} />
          ))}
        </ul>
      </section>
    </div>
  );
}
