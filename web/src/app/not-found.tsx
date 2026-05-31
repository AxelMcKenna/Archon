import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        The page may have moved or never existed.
      </p>
      <Link
        href="/projects"
        className="mt-6 rounded-sm bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700"
      >
        Back to projects
      </Link>
    </div>
  );
}
