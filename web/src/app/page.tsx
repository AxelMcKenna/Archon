import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">
        Reply to council RFIs in hours, not weeks.
      </h1>
      <p className="mt-4 text-ink-500 text-lg">
        ConsentIQ parses your Canterbury BCA RFI letter, classifies each line item against
        the Building Code, and drafts response content keyed to the relevant Acceptable
        Solution.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/projects"
          className="inline-flex items-center rounded-lg bg-ink-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-ink-700"
        >
          Get started
        </Link>
        <Link
          href="/projects/new"
          className="inline-flex items-center rounded-lg border border-ink-700/20 px-5 py-2.5 text-sm font-medium hover:bg-ink-700/5"
        >
          New project
        </Link>
      </div>
      <dl className="mt-16 grid grid-cols-3 gap-6 text-sm">
        <div><dt className="text-ink-500">RFI rate (NZ)</dt><dd className="text-2xl font-semibold">64.6%</dd></div>
        <div><dt className="text-ink-500">Median response time</dt><dd className="text-2xl font-semibold">11+ days</dd></div>
        <div><dt className="text-ink-500">B1 + E2 share of items</dt><dd className="text-2xl font-semibold">~52%</dd></div>
      </dl>
    </div>
  );
}
