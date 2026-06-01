export const metadata = { title: "Privacy — Archon" };

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12 prose prose-sm">
      <h1 className="text-2xl font-semibold mb-2">Privacy policy</h1>
      <p className="text-ink-500 text-sm">Last updated: 8 May 2026</p>

      <h2 className="mt-6 font-semibold text-lg">What we collect</h2>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Project metadata you enter: address, BCA, project type, description.</li>
        <li>RFI letters you upload, including any personal information they contain (e.g. application reference, council officer name).</li>
        <li>Supporting documents you attach to RFI items.</li>
        <li>Drafted responses, your edits, and edit-distance telemetry used to improve our prompts.</li>
      </ul>

      <h2 className="mt-6 font-semibold text-lg">How we use it</h2>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>To extract, classify and draft responses for the RFIs you upload.</li>
        <li>To improve our extraction and classification accuracy over time.</li>
        <li>To produce response bundles you can lodge with your BCA.</li>
      </ul>

      <h2 className="mt-6 font-semibold text-lg">Where it's stored</h2>
      <p className="text-sm">
        On Supabase infrastructure in ap-southeast-2 (Sydney). Encrypted at rest.
        Per-user row-level security ensures only you can read your projects and
        documents.
      </p>

      <h2 className="mt-6 font-semibold text-lg">Third parties</h2>
      <p className="text-sm">
        We send the text of RFI items to Anthropic (Claude) for classification
        and drafting. Anthropic does not retain inputs for training under their
        commercial API terms. We do not share your data with councils, with any
        analytics provider, or with any third party except as described here.
      </p>

      <h2 className="mt-6 font-semibold text-lg">Your rights (NZ Privacy Act 2020)</h2>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Access — request a copy of your data.</li>
        <li>Correction — fix anything that's wrong.</li>
        <li>Deletion — delete your account and all associated data.</li>
      </ul>
      <p className="text-sm mt-2">Email <a href="mailto:privacy@archon.co.nz" className="underline">privacy@archon.co.nz</a> for any of the above.</p>
    </article>
  );
}
