import type { Metadata } from "next";
import { LegalShell } from "@/components/legal-shell";
import { legal } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Sub-processors — Archon",
  description: "Third-party sub-processors Archon uses to deliver the service.",
};

// ⚠️ Keep this list accurate. Add/remove rows as your stack changes, and update
// the "Last updated" date in legal-config.ts when you do.
const subprocessors = [
  {
    name: "Supabase",
    purpose: "Database (PostgreSQL), authentication, and file storage",
    data: "Account data, Customer Data, session tokens",
    location: "Cloud hosting (region as configured)",
  },
  {
    name: "Cloud infrastructure provider",
    purpose: "Underlying compute and storage for the platform",
    data: "All hosted data",
    location: "[Confirm region]",
  },
  {
    name: "AI model provider(s)",
    purpose: "Plan analysis, RFI interpretation, and response drafting",
    data: "Project content submitted to AI features",
    location: "United States / configured region",
  },
  {
    name: "Email provider",
    purpose: "Transactional email (sign-in, notifications, support)",
    data: "Email address, message content",
    location: "[Confirm region]",
  },
];

export default function SubprocessorsPage() {
  return (
    <LegalShell
      title="Sub-processors"
      activePath="/subprocessors"
      intro={`To deliver Archon, ${legal.entity} engages the third-party service providers below to process data on our behalf. Each is bound by contractual obligations consistent with our Privacy Policy.`}
    >
      <h2>Current sub-processors</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Data processed</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {subprocessors.map((s) => (
            <tr key={s.name}>
              <td className="font-medium text-ink-900">{s.name}</td>
              <td>{s.purpose}</td>
              <td>{s.data}</td>
              <td>{s.location}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Changes</h2>
      <p>
        We may update this list as our infrastructure evolves. Where required by
        your agreement with us, we will notify you of new sub-processors before
        they begin processing your data, giving you an opportunity to object.
      </p>

      <h2>Questions</h2>
      <p>
        For sub-processor or data-protection questions, contact{" "}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
      </p>
    </LegalShell>
  );
}
