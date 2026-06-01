import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/dashboard", label: "Platform" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
] as const;

/** Shared site footer used on the landing page and across the app chrome. */
export function SiteFooter() {
  return (
    <footer className="relative border-t border-ink-100">
      <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-6 px-8 py-10 md:flex-row md:items-center md:px-10">
        <div className="flex items-center gap-3">
          <span className="font-display uppercase font-bold tracking-[0.16em] text-[18px] text-ink-900">
            Archon
          </span>
          <span className="hidden h-4 w-px bg-ink-200 md:inline-block" />
          <span className="text-[12px] text-ink-500">
            Construction, accelerated by AI.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-500">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-ink-900"
            >
              {l.label}
            </Link>
          ))}
          <span className="font-mono tabular-nums text-[11px] text-ink-400">
            © 2026 Archon
          </span>
        </div>
      </div>
    </footer>
  );
}
