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
        </div>
      </body>
    </html>
  );
}
