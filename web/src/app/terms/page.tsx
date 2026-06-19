import type { Metadata } from "next";
import { LegalShell } from "@/components/legal-shell";
import { legal } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Terms of Service | Arro",
  description: "The terms governing your use of the Arro platform.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      activePath="/terms"
      intro={`These terms are a binding agreement between you (and the organisation you represent) and ${legal.entity} governing your use of the Arro platform. By creating an account or using Arro, you agree to these terms.`}
    >
      <h2>1. The agreement</h2>
      <p>
        &quot;Arro&quot;, &quot;we&quot;, or &quot;us&quot; means {legal.entity}.
        &quot;You&quot; or &quot;Customer&quot; means the person or organisation
        using the service. If you accept these terms on behalf of an organisation,
        you warrant that you have authority to bind it.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate information and keep it up to date.</li>
        <li>
          You are responsible for safeguarding your credentials and for all
          activity under your account.
        </li>
        <li>
          You must notify us promptly of any unauthorised use at{" "}
          <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.
        </li>
        <li>You must be at least 16 years old to use Arro.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>
        Your use of Arro must comply with our{" "}
        <a href="/acceptable-use">Acceptable Use Policy</a>, which is incorporated
        into these terms. We may suspend or terminate access for material or
        repeated breaches.
      </p>

      <h2>4. Customer data</h2>
      <p>
        You retain all rights in the content you upload (&quot;Customer Data&quot;).
        You grant us a worldwide, non-exclusive licence to host, process, transmit,
        and display Customer Data <strong>solely</strong> to provide and support the
        service, including processing by our AI sub-processors as described in our{" "}
        <a href="/privacy">Privacy Policy</a>. You are responsible for ensuring you
        have the rights to upload Customer Data and that doing so does not breach
        any third party&apos;s rights or any law.
      </p>

      <h2>5. AI features &amp; professional-advice disclaimer</h2>
      <p>
        Arro uses automated AI systems to analyse plans, interpret RFIs, identify
        potential compliance issues, and draft responses. <strong>This output is
        provided for assistance only.</strong> It may be inaccurate, incomplete, or
        out of date, and it does not constitute legal, engineering, architectural,
        surveying, or building-compliance advice.
      </p>
      <p>
        You must independently verify all AI output and rely on the judgement of
        appropriately qualified and licensed professionals. Nothing produced by
        Arro is a determination, approval, or assurance of compliance with the New
        Zealand Building Code, any standard, or any consent condition, and it does
        not replace the assessment of a Building Consent Authority or other
        regulator. You are solely responsible for any decisions made or documents
        submitted in reliance on the service.
      </p>

      <h2>6. Our intellectual property</h2>
      <p>
        The Arro platform, software, and all related intellectual property are and
        remain owned by us and our licensors. We grant you a limited,
        non-exclusive, non-transferable right to use the service during your
        subscription, subject to these terms. You may not copy, reverse-engineer,
        resell, or create derivative works from the service except as permitted by
        law.
      </p>

      <h2>7. Fees</h2>
      <p>
        If your plan is paid, you agree to the fees and billing terms presented at
        sign-up or in your order. Unless stated otherwise, fees are exclusive of
        GST and other taxes, and are non-refundable except as required by law.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        Arro integrates with third-party services (including our hosting,
        database, authentication, and AI providers). We are not responsible for
        third-party services, and your use of them may be subject to their own
        terms.
      </p>

      <h2>9. Confidentiality</h2>
      <p>
        Each party will protect the other&apos;s confidential information and use it
        only as needed to perform under these terms. Customer Data is treated as
        your confidential information.
      </p>

      <h2>10. Warranties &amp; disclaimers</h2>
      <p>
        We provide the service with reasonable care and skill. Except as expressly
        stated, and to the maximum extent permitted by law, the service is provided
        &quot;as is&quot; and &quot;as available&quot; without warranties of any
        kind, whether express or implied. Nothing in these terms limits any rights
        you have under the New Zealand Consumer Guarantees Act 1993 that cannot
        lawfully be excluded; where you acquire the service for business purposes,
        you agree that the Consumer Guarantees Act does not apply.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, neither party is liable for any
        indirect, incidental, special, or consequential loss, or for loss of
        profits, revenue, data, or goodwill. Our total aggregate liability arising
        out of or in connection with the service is limited to the fees you paid to
        us in the twelve (12) months before the event giving rise to the liability
        (or NZ$100 if you use a free plan).
      </p>

      <h2>12. Indemnity</h2>
      <p>
        You will indemnify us against claims, losses, and costs arising from your
        Customer Data, your use of the service in breach of these terms, or your
        reliance on AI output in breach of section 5.
      </p>

      <h2>13. Term &amp; termination</h2>
      <p>
        These terms apply while you use the service. You may stop using Arro and
        close your account at any time. We may suspend or terminate access if you
        materially breach these terms, fail to pay, or where required by law. On
        termination, your right to use the service ends; we will make Customer Data
        available for export for a reasonable period, after which it may be deleted.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may update the service and these terms from time to time. We will post
        changes here and update the &quot;Last updated&quot; date; material changes
        will be notified where appropriate. Continued use after changes take effect
        constitutes acceptance.
      </p>

      <h2>15. Governing law</h2>
      <p>
        These terms are governed by the laws of {legal.governingLaw}, and the
        courts of {legal.jurisdiction} have exclusive jurisdiction, without regard
        to conflict-of-laws rules.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these terms? Contact{" "}
        <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.
      </p>
    </LegalShell>
  );
}
