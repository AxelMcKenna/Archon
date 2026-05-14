type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-sm bg-ink-900/[0.06] ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonHeader({
  eyebrowWidth = "w-32",
  titleWidth = "w-56",
  subtitle = true,
}: {
  eyebrowWidth?: string;
  titleWidth?: string;
  subtitle?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Skeleton className={`h-3 ${eyebrowWidth}`} />
      <Skeleton className={`h-7 ${titleWidth}`} />
      {subtitle && <Skeleton className="h-4 w-full max-w-xl mt-2" />}
    </div>
  );
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-depth p-8 space-y-4 ${className}`}
    >
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function SkeletonListRow() {
  return (
    <li className="flex items-center justify-between px-5 py-3.5 gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </li>
  );
}

export function SkeletonPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-depth p-8 space-y-4">
      {children}
    </section>
  );
}

export function SkeletonListPanel({
  headingWidth = "w-32",
  rows = 4,
}: {
  headingWidth?: string;
  rows?: number;
}) {
  return (
    <SkeletonPanel>
      <Skeleton className={`h-3 ${headingWidth}`} />
      <ul className="divide-y divide-ink-200/70 rounded-sm bg-surface-raised ring-1 ring-ink-700/10 overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </ul>
    </SkeletonPanel>
  );
}
