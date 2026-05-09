"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const mainTabs = [
  { name: "Dashboard", href: "/dashboard" as Route },
  { name: "Projects", href: "/projects" as Route },
  { name: "Workflow", href: "/workflow" as Route },
  { name: "Documents", href: "/documents" as Route },
  { name: "Plans", href: "/plans" as Route },
  { name: "RFI", href: "/rfi" as Route },
  { name: "Settings", href: "/settings" as Route },
  { name: "Help", href: "/help" as Route },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 flex-shrink-0 border-r border-ink-800 bg-ink-900 text-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {mainTabs.map((tab) => {
              const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={`block rounded-lg px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-ink-700 text-white font-medium"
                        : "text-ink-300 hover:bg-ink-800"
                    }`}
                  >
                    {tab.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-ink-800 px-4 py-4 text-xs text-ink-400">
          <div>Version 0.1.0</div>
        </div>
      </div>
    </aside>
  );
}
