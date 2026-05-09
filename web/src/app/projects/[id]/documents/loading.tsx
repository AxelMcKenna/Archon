export default function LoadingDocuments() {
  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-6 h-10 w-48 animate-pulse rounded-sm bg-ink-100" />
      <div className="mb-6 h-24 animate-pulse rounded-sm border border-ink-200 bg-white" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-sm border border-ink-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
