"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { ProjectSubnav } from "@/components/project-subnav";

type NavItem = { name: string; href: Route; icon: LucideIcon };

const PRIMARY_NAV: NavItem[] = [
  { name: "Dashboard", href: "/dashboard" as Route, icon: LayoutDashboard },
  { name: "Projects", href: "/projects" as Route, icon: FolderOpen },
];

const SECONDARY_NAV: NavItem[] = [
  { name: "Settings", href: "/settings" as Route, icon: Settings },
  { name: "Help", href: "/help" as Route, icon: LifeBuoy },
];

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;
  const isProjectPage = projectId && projectId !== "new";

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md shadow-header">
        <div className="flex items-center gap-1 px-8 py-3.5">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2.5 mr-6 text-[15px] font-semibold tracking-tight text-ink-900 transition-colors hover:text-ink-700"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-ink-900 text-tan-300 text-xs font-bold ring-1 ring-tan-300/30 shadow-card">
              C
            </span>
            ConsentIQ
          </Link>
          <NavList items={PRIMARY_NAV} pathname={pathname} />
          <div className="ml-auto flex items-center gap-1">
            <NavList items={SECONDARY_NAV} pathname={pathname} compact />
          </div>
        </div>
        {isProjectPage && projectId && <ProjectSubnav projectId={projectId} />}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavList({
  items,
  pathname,
  compact = false,
}: {
  items: NavItem[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <nav className="flex items-center gap-0.5">
      {items.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-ink-900 text-white font-medium shadow-card"
                : "text-ink-600 hover:bg-ink-150 hover:text-ink-900"
            }`}
            title={tab.name}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {!compact && <span>{tab.name}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
