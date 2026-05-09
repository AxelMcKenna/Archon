"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProjectSubnavProps {
  projectId: string;
}

const projectTabs = [
  { name: "Overview", href: "" },
  { name: "Forecast", href: "/forecast" },
  { name: "Project Application", href: "/project-application" },
  { name: "Inspections", href: "/inspections" },
  { name: "Documents", href: "/documents" },
  { name: "CCC", href: "/ccc" },
  { name: "Settings", href: "/settings" },
];

export function ProjectSubnav({ projectId }: ProjectSubnavProps) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-ink-700/10 bg-ink-50 px-6 py-3">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {projectTabs.map((tab) => {
          const tabPath = `/projects/${projectId}${tab.href}` as Route;
          const isActive =
            pathname === tabPath || (tab.href && pathname.startsWith(`${tabPath}/`));
          return (
            <li key={tab.href}>
              <Link
                href={tabPath}
                className={`block py-2 px-1 transition-colors border-b-2 ${
                  isActive
                    ? "border-ink-900 text-ink-900 font-medium"
                    : "border-transparent text-ink-600 hover:text-ink-900"
                }`}
              >
                {tab.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
