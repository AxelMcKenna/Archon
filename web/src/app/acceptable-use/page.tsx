import type { Metadata } from "next";
import { LegalShell } from "@/components/legal-shell";
import { legal } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — Archon",
  description: "Rules for acceptable use of the Archon platform.",
};

export default function AcceptableUsePage() {
  return (
    <LegalShell
      title="Acceptable Use Policy"
      activePath="/acceptable-use"
      intro="This policy sets out activities that are prohibited on the Archon platform. It is part of, and incorporated into, our Terms of Service."
    >
      <h2>1. Prohibited activities</h2>
      <p>You must not, and must not allow anyone else to:</p>
      <ul>
        <li>Use Archon to break any law or infringe anyone&apos;s rights.</li>
        <li>
          Upload content you do not have the right to upload, or that contains
          malware or harmful code.
        </li>
        <li>
          Attempt to gain unauthorised access to the service, other accounts, or
          our systems and networks.
        </li>
        <li>
          Probe, scan, or test the vulnerability of the service, or breach any
          security or authentication measures, except under an authorised
          disclosure programme.
        </li>
        <li>
          Reverse-engineer, decompile, or attempt to extract source code, except as
          permitted by law.
        </li>
        <li>
          Scrape, crawl, or use bots to access the service in a way that is not
          permitted by the interface or documented API.
        </li>
        <li>
          Overload, disrupt, or impair the service, including denial-of-service
          activity or excessive automated requests.
        </li>
        <li>
          Resell, sublicense, or provide the service to third parties except as
          expressly permitted.
        </li>
        <li>
          Use the service to generate or distribute content that is unlawful,
          defamatory, harassing, or deceptive.
        </li>
        <li>
          Misrepresent AI output as a verified compliance determination or
          professional certification.
        </li>
      </ul>

      <h2>2. Fair use</h2>
      <p>
        We may apply reasonable limits on usage (including API calls, storage, and
        AI processing) to protect the service for all customers. We will use
        reasonable efforts to notify you before applying restrictions, except where
        immediate action is needed to protect the service.
      </p>

      <h2>3. Reporting abuse</h2>
      <p>
        To report a violation of this policy, contact{" "}
        <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.
      </p>

      <h2>4. Enforcement</h2>
      <p>
        We may investigate suspected violations and may suspend or terminate access
        for breaches of this policy, consistent with our{" "}
        <a href="/terms">Terms of Service</a>.
      </p>
    </LegalShell>
  );
}
