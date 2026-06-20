"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectSubnav, activeTabSlug } from "@/components/project-subnav";
import { AgentPanel } from "@/components/agent/agent-panel";
import { AgentProvider } from "@/components/agent/agent-provider";
import { AgentTrigger } from "@/components/agent/agent-trigger";
import { TabContextProvider } from "@/components/agent/tab-context";
import { SiteFooter } from "@/components/site-footer";

type NavItem = { name: string; href: Route };

// Routes that render fullbleed with their own chrome (no app header/footer).
const FULLBLEED_PREFIXES = [
  "/login",
  "/auth",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
  "/subprocessors",
];

const PRIMARY_NAV: NavItem[] = [
  { name: "Projects", href: "/projects" as Route },
];

export function LayoutContent({
  children,
  userMenu,
}: {
  children: React.ReactNode;
  userMenu?: React.ReactNode;
}) {
  const pathname = usePathname();

  // Landing page, auth pages, and legal pages render fullbleed (own chrome).
  if (
    pathname === "/" ||
    FULLBLEED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return <>{children}</>;
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;
  const isProjectPage = projectId && projectId !== "new";
  const activeSlug = isProjectPage && projectId ? activeTabSlug(pathname, projectId) : null;

  return (
    <TabContextProvider>
      <AgentProvider>
        <div className="min-h-screen bg-surface-canvas flex flex-col">
          <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-surface-canvas">
            <div className="flex w-full items-center justify-between px-10 py-6">
              <Link
                href="/projects"
                className="font-display uppercase font-bold tracking-[0.16em] text-[22px] text-ink-900 transition-colors hover:text-accent"
              >
                Arro
              </Link>
              <nav className="flex items-center gap-8">
                <NavList items={PRIMARY_NAV} pathname={pathname} />
                {userMenu && (
                  <>
                    <span aria-hidden className="h-4 w-px bg-ink-200" />
                    {userMenu}
                  </>
                )}
              </nav>
            </div>
          </header>
          <main className="flex-1">
            {isProjectPage && projectId && (
              <div className="flex w-full items-center gap-4 px-10 pt-8">
                <div className="flex-1 min-w-0">
                  <ProjectSubnav projectId={projectId} />
                </div>
                {activeSlug && (
                  <div className="shrink-0 pr-1">
                    <AgentTrigger
                      tab={activeSlug}
                      projectId={projectId}
                      size="lg"
                    />
                  </div>
                )}
              </div>
            )}
            {children}
          </main>
          <SiteFooter />
        </div>
        <AgentPanel />
      </AgentProvider>
    </TabContextProvider>
  );
}

function NavList({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  return (
    <ul className="flex items-center gap-8">
      {items.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <li key={tab.href}>
            <Link
              href={tab.href}
              className={`relative font-display uppercase tracking-[0.14em] text-[14px] transition-colors ${
                isActive
                  ? "text-ink-900 font-semibold"
                  : "text-ink-600 font-medium hover:text-ink-900"
              }`}
            >
              {tab.name}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -bottom-2 left-0 right-0 h-[2px] bg-accent"
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
