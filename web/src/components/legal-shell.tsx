import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { legal, legalPages } from "@/lib/legal-config";

/**
 * Shared chrome + typography for every legal page. Pass the document title,
 * the active path (to highlight the cross-nav), and the body as children.
 */
export function LegalShell({
  title,
  intro,
  activePath,
  children,
}: {
  title: string;
  intro?: string;
  activePath: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-canvas text-ink-900">
      {/* Atmosphere — matches the rest of the app */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="glow-drift absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-accent/[0.07] blur-[130px]" />
      </div>
      <div aria-hidden className="grain pointer-events-none fixed inset-0 -z-10" />

      {/* Top bar */}
      <header className="relative z-20 flex w-full items-center justify-between px-6 py-6 md:px-10">
        <Link
          href="/"
          className="font-display uppercase font-bold tracking-[0.16em] text-[22px] text-ink-900 transition-colors hover:text-ink-700"
        >
          Atlas
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-display uppercase tracking-[0.14em] text-[13px] text-ink-700 transition-colors hover:text-ink-900"
        >
          Back to site
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-28 pt-8 md:px-8 md:pt-12">
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-accent">
          <span className="h-px w-8 bg-accent/50" />
          Legal
        </div>
        <h1
          className="mt-5 font-medium leading-[1.05] tracking-[0.01em] text-[36px] md:text-[48px] text-ink-900"
          style={{ fontFamily: "var(--font-dm-sans)" }}
        >
          {title}
        </h1>
        <p className="mt-4 font-mono tabular-nums text-[12px] text-ink-500">
          Effective {legal.effectiveDate} · Last updated {legal.lastUpdated}
        </p>
        {intro && (
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-600">
            {intro}
          </p>
        )}

        {/* Cross-nav between legal docs */}
        <nav className="mt-8 flex flex-wrap gap-2">
          {legalPages.map((p) => {
            const active = p.href === activePath;
            return (
              <Link
                key={p.href}
                href={p.href}
                className={
                  "rounded-full px-3 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors " +
                  (active
                    ? "bg-ink-900 text-white"
                    : "border border-ink-200 bg-surface-elevated text-ink-600 hover:text-ink-900 hover:shadow-card")
                }
              >
                {p.label}
              </Link>
            );
          })}
        </nav>

        {/* Document body with prose styling driven by element selectors */}
        <article
          className={[
            "mt-12 text-[15px] leading-relaxed text-ink-600",
            "[&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:text-[20px] [&_h2]:font-medium [&_h2]:text-ink-900 [&_h2]:font-[var(--font-dm-sans)]",
            "[&_h2]:flex [&_h2]:items-baseline [&_h2]:gap-3",
            "[&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h3]:font-medium [&_h3]:text-ink-900",
            "[&_p]:mt-4",
            "[&_ul]:mt-4 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-accent",
            "[&_ol]:mt-4 [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:marker:text-ink-400",
            "[&_li]:pl-1",
            "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-ink-900",
            "[&_strong]:font-medium [&_strong]:text-ink-900",
            "[&_table]:mt-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]",
            "[&_th]:border-b [&_th]:border-ink-200 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-display [&_th]:uppercase [&_th]:tracking-[0.14em] [&_th]:text-[11px] [&_th]:text-ink-500",
            "[&_td]:border-b [&_td]:border-ink-100 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_td]:text-ink-700",
          ].join(" ")}
        >
          {children}
        </article>

        <div className="mt-16 rounded-lg border border-ink-200 bg-surface-elevated p-5 shadow-card">
          <p className="text-[13px] text-ink-600">
            Questions about this document? Contact us at{" "}
            <a
              href={`mailto:${legal.contactEmail}`}
              className="text-accent underline underline-offset-2 hover:text-ink-900"
            >
              {legal.contactEmail}
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
