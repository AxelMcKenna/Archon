import type { Metadata } from "next";
import { LegalShell } from "@/components/legal-shell";
import { legal } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Privacy Policy — Archon",
  description: "How Archon collects, uses, stores, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      activePath="/privacy"
      intro={`This policy explains how ${legal.entity} ("Archon", "we", "us") collects, uses, discloses, and protects personal information when you use the Archon platform and website. We are committed to handling your information in accordance with the New Zealand Privacy Act 2020 and the Information Privacy Principles (IPPs).`}
    >
      <h2>1. Who we are</h2>
      <p>
        Archon is operated by {legal.entity}, {legal.address}. For the purposes of
        the Privacy Act 2020, we are the agency responsible for the personal
        information described in this policy. Where the EU/UK GDPR applies, we act
        as a <strong>data controller</strong> for account and website data, and as
        a <strong>data processor</strong> for the project content you upload on
        behalf of your organisation.
      </p>

      <h2>2. Information we collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account information</strong> — name, work email, password (stored
          only as a salted hash by our authentication provider), and organisation
          details.
        </li>
        <li>
          <strong>Project content</strong> — building consents, drawings and plans,
          RFIs, specifications, correspondence, and other documents you or your team
          upload. These may contain personal information about third parties (e.g.
          applicants, owners, consultants).
        </li>
        <li>
          <strong>Communications</strong> — messages you send to support, feedback,
          and survey responses.
        </li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Usage data</strong> — features used, actions taken, and timestamps.
        </li>
        <li>
          <strong>Technical data</strong> — IP address, browser and device type,
          and log data needed to operate and secure the service.
        </li>
        <li>
          <strong>Cookies</strong> — see our{" "}
          <a href="/cookies">Cookie Policy</a> for details.
        </li>
      </ul>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To provide, maintain, and improve the Archon platform.</li>
        <li>To authenticate you and keep your account secure.</li>
        <li>
          To analyse plans and RFIs and generate findings, drafts, and citations
          using AI features (see section 5).
        </li>
        <li>To provide support and respond to your requests.</li>
        <li>
          To monitor for abuse, debug issues, and protect the security and
          integrity of the service.
        </li>
        <li>To comply with legal obligations and enforce our terms.</li>
      </ul>

      <h2>4. Legal basis for processing</h2>
      <p>
        Under the Privacy Act 2020, we collect personal information for lawful
        purposes connected with our functions and activities, and only where it is
        necessary for those purposes. Where the GDPR applies, we rely on:
        performance of a contract (providing the service); legitimate interests
        (securing and improving the service); consent (where required, e.g. certain
        cookies); and compliance with legal obligations.
      </p>

      <h2>5. AI processing</h2>
      <p>
        Archon uses third-party large language models to read drawings, interpret
        council RFIs, and draft responses. When you use these features, the
        relevant project content is transmitted to our AI sub-processors solely to
        generate output for you. We do <strong>not</strong> permit these
        sub-processors to use your content to train their foundation models, and we
        contract for zero-retention or short-retention processing where available.
      </p>
      <p>
        AI output is generated automatically and may be incomplete or incorrect. It
        is intended to assist qualified professionals and is not a substitute for
        professional judgement or a building consent authority determination. See
        the <a href="/terms">Terms of Service</a> for the full disclaimer.
      </p>

      <h2>6. How we share information</h2>
      <p>We do not sell your personal information. We share it only:</p>
      <ul>
        <li>
          <strong>Within your organisation</strong> — with other users in your
          workspace, according to the access your administrator configures.
        </li>
        <li>
          <strong>With sub-processors</strong> — service providers who process data
          on our behalf under contract. Our database, authentication, and file
          storage are provided by <strong>Supabase</strong> (hosted on cloud
          infrastructure). See the full list on our{" "}
          <a href="/subprocessors">Sub-processors</a> page.
        </li>
        <li>
          <strong>For legal reasons</strong> — where required by law, to respond to
          lawful requests, or to protect rights, safety, and property.
        </li>
        <li>
          <strong>In a business transfer</strong> — in connection with a merger,
          acquisition, or sale of assets, subject to this policy.
        </li>
      </ul>

      <h2>7. International transfers</h2>
      <p>
        Some of our sub-processors store or process data outside New Zealand. Where
        we transfer personal information overseas, we take reasonable steps to
        ensure it is protected by comparable safeguards (e.g. contractual
        protections and, where relevant, the GDPR&apos;s standard contractual
        clauses), consistent with IPP 12 of the Privacy Act 2020. The hosting
        region for your primary data store can be confirmed on request.
      </p>

      <h2>8. Security</h2>
      <p>
        We take reasonable technical and organisational measures to protect your
        information, including encryption in transit (TLS) and at rest, role-based
        access controls, row-level security in our database, and audit logging. No
        method of transmission or storage is completely secure, and we cannot
        guarantee absolute security.
      </p>

      <h2>9. Data retention</h2>
      <p>
        We retain personal information for as long as your account is active or as
        needed to provide the service, then for the period required to meet legal,
        accounting, or reporting obligations. You may request deletion of your
        account and associated content; we will delete or de-identify it within a
        reasonable period, subject to backups and legal hold requirements.
      </p>

      <h2>10. Your rights</h2>
      <p>
        Under the Privacy Act 2020 you have the right to request access to, and
        correction of, the personal information we hold about you. Where the GDPR
        applies, you may also have rights to erasure, restriction, portability, and
        to object to certain processing. To exercise any of these rights, contact{" "}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. We may
        need to verify your identity before responding.
      </p>

      <h2>11. Children</h2>
      <p>
        Archon is a business tool not directed at children and is not intended for
        anyone under 16. We do not knowingly collect personal information from
        children.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. We will post the updated
        version here and revise the &quot;Last updated&quot; date. Material changes
        will be communicated through the service or by email where appropriate.
      </p>

      <h2>13. Contact &amp; complaints</h2>
      <p>
        For privacy questions or to make a complaint, contact us at{" "}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. If you
        are not satisfied with our response, you may contact the{" "}
        <a
          href="https://www.privacy.org.nz/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Office of the Privacy Commissioner (New Zealand)
        </a>
        .
      </p>
    </LegalShell>
  );
}
