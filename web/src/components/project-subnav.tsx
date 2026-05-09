"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProjectSubnavProps {
  projectId: string;
}

const projectTabs = [
  { name: "Overview", href: "" },
  { name: "Consent Assessment", href: "/consent-assessment" },
  { name: "Application Prep", href: "/application-prep" },
  { name: "Drawings", href: "/drawings" },
  { name: "RFIs", href: "/rfis" },
  { name: "Processing", href: "/processing" },
  { name: "Inspections", href: "/inspections" },
  { name: "Documents", href: "/documents" },
  { name: "CCC", href: "/ccc" },
];

export function ProjectSubnav({ projectId }: ProjectSubnavProps) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-ink-700/10 bg-ink-50">
      <ul className="flex px-4 text-sm overflow-x-auto">
        {projectTabs.map((tab) => {
          const tabPath = `/projects/${projectId}${tab.href}` as Route;
          const isActive =
            pathname === tabPath || (tab.href && pathname.startsWith(`${tabPath}/`));
          return (
            <li key={tab.href} className="flex-shrink-0">
              <Link
                href={tabPath}
                className={`relative inline-flex items-center px-4 py-2.5 transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-ink-900 font-medium"
                    : "text-ink-600 hover:text-ink-900 hover:bg-ink-700/[0.04]"
                }`}
              >
                {tab.name}
                {isActive && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-ink-900" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
