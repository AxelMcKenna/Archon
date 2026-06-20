import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1700px] mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-64" />
      </header>
      <div className="rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card p-8">
        <Skeleton className="h-4 w-3/4 max-w-md" />
      </div>
    </div>
  );
}
