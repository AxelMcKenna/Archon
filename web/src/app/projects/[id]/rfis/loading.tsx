import { Skeleton, SkeletonHeader, SkeletonListPanel, SkeletonPanel } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1700px] mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <SkeletonHeader eyebrowWidth="w-44" titleWidth="w-24" />
      </header>
      <SkeletonPanel>
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-32 w-full" />
      </SkeletonPanel>
      <SkeletonListPanel headingWidth="w-28" />
    </div>
  );
}
