"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ProjectSubnav } from "@/components/project-subnav";

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  // Extract project ID from URL if we're in a project
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;
  const isProjectPage = projectId && projectId !== "new";

  return (
    <div className="min-h-screen bg-white flex">
      {sidebarOpen && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-700/10 bg-white/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight text-ink-900 transition-colors hover:text-ink-700"
            >
              ConsentIQ
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 transition-colors hover:bg-ink-100"
              aria-label="Toggle sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </header>
        {isProjectPage && projectId && <ProjectSubnav projectId={projectId} />}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
