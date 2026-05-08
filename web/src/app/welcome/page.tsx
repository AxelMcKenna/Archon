import Link from "next/link";

export default function WelcomePage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to ConsentIQ</h1>
      <p className="mt-3 text-ink-500">
        You're set up. Here's the typical flow:
      </p>
      <ol className="mt-6 space-y-3 text-sm">
        <Step n={1} title="Create a project">
          One project per consent application. Address, BCA, and project type.
        </Step>
        <Step n={2} title="Run a pre-lodgement risk check (optional)">
          Paste your project description; we'll surface the items most likely to
          trigger an RFI from your target BCA so you can address them up-front.
        </Step>
        <Step n={3} title="Upload your RFI letter">
          PDF, JPG, or PNG. We'll parse it and classify each line item against
          the Building Code.
        </Step>
        <Step n={4} title="Resolve disagreements, draft responses, attach evidence">
          Edit any drafts; attach supporting documents per item.
        </Step>
        <Step n={5} title="Export the bundle">
          A ZIP with cover letter, per-item PDFs, and an index — named to your
          BCA's convention. Upload manually to AlphaOne or Objective Build.
        </Step>
      </ol>
      <div className="mt-10 flex gap-3">
        <Link
          href="/projects"
          className="rounded-lg bg-ink-900 text-white px-5 py-2.5 text-sm font-medium"
        >
          Go to projects
        </Link>
        <Link
          href="/projects/new"
          className="rounded-lg border border-ink-700/20 px-5 py-2.5 text-sm font-medium hover:bg-ink-700/5"
        >
          Create a project
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="rounded-full bg-ink-900 text-white w-6 h-6 flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-ink-500">{children}</p>
      </div>
    </li>
  );
}
