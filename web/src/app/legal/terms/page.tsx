export const metadata = { title: "Terms — ConsentIQ" };

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold mb-2">Terms of service</h1>
      <p className="text-ink-500 text-sm">Last updated: 8 May 2026</p>

      <h2 className="mt-6 font-semibold text-lg">What ConsentIQ is</h2>
      <p className="text-sm">
        ConsentIQ helps applicants prepare and respond to Building Consent
        Authority Requests for Information. It is a drafting and document-
        assembly tool. It does not lodge applications with councils on your
        behalf.
      </p>

      <h2 className="mt-6 font-semibold text-lg">Not a substitute for professional advice</h2>
      <p className="text-sm">
        Drafts produced by ConsentIQ are a starting point. You — or a Licensed
        Building Practitioner, architect, or engineer working on your project —
        remain responsible for the technical correctness of every response. We
        do not warrant that classifications or drafts are correct.
      </p>

      <h2 className="mt-6 font-semibold text-lg">Your account</h2>
      <p className="text-sm">
        You must keep your credentials secure. You are responsible for activity
        on your account. We may suspend accounts used to abuse the service.
      </p>

      <h2 className="mt-6 font-semibold text-lg">Limitation of liability</h2>
      <p className="text-sm">
        To the extent permitted by law, ConsentIQ's liability for any claim
        arising out of use of the service is limited to fees paid in the 12
        months preceding the claim.
      </p>

      <h2 className="mt-6 font-semibold text-lg">Governing law</h2>
      <p className="text-sm">
        These terms are governed by New Zealand law. Disputes are subject to
        the non-exclusive jurisdiction of the New Zealand courts.
      </p>
    </article>
  );
}
