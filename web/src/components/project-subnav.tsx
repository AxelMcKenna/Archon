"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

interface ProjectSubnavProps {
  projectId: string;
}

import type { TabSlug } from "@/lib/tab-summaries";

interface ProjectTab {
  name: string;
  href: string;
  slug: TabSlug;
  /** Additional path prefixes (without /projects/[id]) that should mark this tab active. */
  alsoMatch?: string[];
}

export const projectTabs: ProjectTab[] = [
  { name: "Overview", href: "", slug: "overview" },
  { name: "Drawings", href: "/drawings", slug: "drawings" },
  { name: "Lodgement", href: "/application-prep", slug: "application-prep" },
  { name: "Council", href: "/rfis", slug: "rfis" },
  { name: "Construction", href: "/inspections", slug: "inspections", alsoMatch: ["/ccc"] },
];

function tabMatchesPath(tab: ProjectTab, pathname: string, projectId: string): boolean {
  const candidates = [tab.href, ...(tab.alsoMatch ?? [])];
  for (const seg of candidates) {
    if (!seg) continue;
    const path = `/projects/${projectId}${seg}`;
    if (pathname === path || pathname.startsWith(`${path}/`)) return true;
  }
  return false;
}

export function activeTabSlug(pathname: string, projectId: string): TabSlug {
  for (const t of projectTabs) {
    if (!t.href && pathname === `/projects/${projectId}`) return t.slug;
    if (t.href && tabMatchesPath(t, pathname, projectId)) return t.slug;
  }
  return "overview";
}

export function ProjectSubnav({ projectId }: ProjectSubnavProps) {
  const pathname = usePathname();

  const activeIndex = projectTabs.findIndex((tab) => {
    if (!tab.href) return pathname === `/projects/${projectId}`;
    return tabMatchesPath(tab, pathname, projectId);
  });

  const hexClip =
    "polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)";

  return (
    <nav className="flex justify-center px-2 pb-10">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 translate-y-[10px] bg-ink-900/35 blur-xl"
          style={{ clipPath: hexClip }}
        />
        <div
          aria-hidden
          className="absolute inset-0 translate-y-[4px] bg-ink-900/25 blur-md"
          style={{ clipPath: hexClip }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-white"
          style={{ clipPath: hexClip }}
        />
        <ol
          className="relative flex items-center gap-0.5 min-w-max py-1.5 pl-7 pr-7"
        >
          {projectTabs.map((tab, index) => {
            const tabPath = `/projects/${projectId}${tab.href}` as Route;
            const isActive = index === activeIndex;
            const isPast = activeIndex >= 0 && index < activeIndex;

            return (
              <li key={tab.href} className="flex items-center gap-0.5 flex-shrink-0">
                <Link
                  href={tabPath}
                  style={isActive ? { clipPath: hexClip } : undefined}
                  className={`relative inline-flex items-center font-display tracking-tight whitespace-nowrap text-[14px] transition-all duration-200 ${
                    isActive
                      ? "text-ink-900 font-semibold bg-white pl-5 pr-5 py-1.5 [filter:drop-shadow(0_1px_1px_rgba(15,17,21,0.10))_drop-shadow(0_3px_6px_rgba(15,17,21,0.10))]"
                      : isPast
                        ? "text-ink-700 font-medium px-3.5 py-1.5 hover:text-ink-900"
                        : "text-ink-500 font-medium px-3.5 py-1.5 hover:text-ink-900"
                  }`}
                >
                  {tab.name}
                </Link>
                {index < projectTabs.length - 1 && (
                  <ChevronRight
                    aria-hidden
                    className={`h-3 w-3 flex-shrink-0 ${
                      isPast || isActive ? "text-ink-400" : "text-ink-300"
                    }`}
                    strokeWidth={2.5}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
