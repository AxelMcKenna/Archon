"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { name: "Dashboard", href: "/" },
  { name: "Projects", href: "/projects" },
  { name: "Plans", href: "/plans" },
  { name: "RFI", href: "/rfi" },
  { name: "Reconciliation", href: "/admin/reconciliation" },
  { name: "Privacy", href: "/legal/privacy" },
  { name: "Terms", href: "/legal/terms" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-ink-900 text-white border-r border-black/30 flex flex-col">
      <div className="px-6 py-4 font-semibold tracking-tight text-lg">ConsentIQ</div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-ink-700 text-white font-medium"
                      : "text-ink-300 hover:bg-ink-700/40"
                  }`}
                >
                  {tab.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-4 py-4 border-t border-black/30 text-xs text-ink-400">
        v0.1.0 · single-user
      </div>
    </aside>
  );
}
