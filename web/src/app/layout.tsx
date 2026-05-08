import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConsentIQ — RFI",
  description: "Canterbury BCA RFI ingestion, classification, and response drafting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-ink-700/10 px-6 py-3 flex items-center justify-between">
            <a href="/" className="font-semibold tracking-tight">ConsentIQ</a>
            <nav className="text-sm text-ink-500 flex gap-4">
              <a href="/projects" className="hover:text-ink-900">Projects</a>
              <a href="/admin/reconciliation" className="hover:text-ink-900">Admin</a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-ink-700/10 px-6 py-4 text-xs text-ink-500 flex justify-between">
            <span>ConsentIQ — Canterbury BCA RFI assistant</span>
            <nav className="flex gap-4">
              <a href="/legal/privacy" className="hover:text-ink-900">Privacy</a>
              <a href="/legal/terms" className="hover:text-ink-900">Terms</a>
              <form action="/auth/sign-out" method="post"><button className="hover:text-ink-900">Sign out</button></form>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
