import type { Metadata } from "next";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Cookie Policy | Arro",
  description: "How and why Arro uses cookies and similar technologies.",
};

export default function CookiesPage() {
  return (
    <LegalShell
      title="Cookie Policy"
      activePath="/cookies"
      intro="This policy explains how Arro uses cookies and similar technologies, and the choices available to you."
    >
      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files stored on your device when you visit a
        website. They let a site remember your actions and preferences (such as
        keeping you signed in) over time.
      </p>

      <h2>2. How we use them</h2>
      <p>
        Arro keeps cookie use to a minimum. We primarily use{" "}
        <strong>strictly necessary</strong> cookies required to authenticate you
        and operate the platform securely. Our authentication and session cookies
        are set by our auth provider, Supabase.
      </p>

      <h2>3. Cookies we set</h2>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Purpose</th>
            <th>Type</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>sb-access-token</td>
            <td>Authenticated session (Supabase Auth)</td>
            <td>Strictly necessary</td>
            <td>Session / short-lived</td>
          </tr>
          <tr>
            <td>sb-refresh-token</td>
            <td>Refreshes your session so you stay signed in</td>
            <td>Strictly necessary</td>
            <td>Persistent</td>
          </tr>
          <tr>
            <td>Preference cookies</td>
            <td>Remember UI settings such as your last workspace</td>
            <td>Functional</td>
            <td>Persistent</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not use third-party advertising cookies. If we add analytics in
        future, we will update this policy and, where required, ask for your
        consent first.
      </p>

      <h2>4. Managing cookies</h2>
      <p>
        Most browsers let you block or delete cookies through their settings.
        Because our authentication cookies are strictly necessary, blocking them
        will prevent you from signing in and using Arro.
      </p>

      <h2>5. Changes</h2>
      <p>
        We may update this policy as our use of cookies changes. The
        &quot;Last updated&quot; date above reflects the latest version.
      </p>
    </LegalShell>
  );
}
