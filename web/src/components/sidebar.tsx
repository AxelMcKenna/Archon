"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sidebarTabs = [
  { name: "Dashboard", href: "/" },
  { name: "Projects", href: "/projects" },
  { name: "Upload RFI", href: "/projects/new" },
  { name: "Classification", href: "/projects/classification" },
  { name: "Reconciliation", href: "/admin/reconciliation" },
  { name: "Settings", href: "/settings" },
  { name: "Help", href: "/help" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-ink-900 text-white border-r border-ink-800 flex flex-col">
      <div className="px-6 py-4 font-semibold tracking-tight text-lg">ConsentIQ</div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {sidebarTabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
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
      <div className="px-4 py-4 border-t border-ink-800 text-xs text-ink-400">
        <div>Version 0.1.0</div>
      </div>
    </aside>
  );
}
