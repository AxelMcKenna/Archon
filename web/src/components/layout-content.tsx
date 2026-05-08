"use client";

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
    <div className="min-h-screen flex">
      {sidebarOpen && <Sidebar />}
      <div className="flex-1 flex flex-col">
        <header className="border-b border-ink-700/10 px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-ink-100 rounded-lg transition-colors"
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
          <nav className="text-sm text-ink-500 ml-auto">
            <a href="/auth/sign-in" className="hover:text-ink-900">
              Sign in
            </a>
          </nav>
        </header>
        {isProjectPage && projectId && <ProjectSubnav projectId={projectId} />}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
