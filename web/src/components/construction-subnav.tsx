"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

interface ConstructionSubnavProps {
  projectId: string;
}

const SECTIONS = [
  { name: "Inspections", href: "/inspections" },
  { name: "CCC", href: "/ccc" },
] as const;

export function ConstructionSubnav({ projectId }: ConstructionSubnavProps) {
  const pathname = usePathname();
  return (
    <div className="max-w-7xl mx-auto px-8 pt-6">
      <nav className="inline-flex rounded-sm bg-surface-raised shadow-depth p-1 gap-1">
        {SECTIONS.map((s) => {
          const path = `/projects/${projectId}${s.href}` as Route;
          const isActive =
            pathname === path || pathname.startsWith(`${path}/`);
          return (
            <Link
              key={s.href}
              href={path}
              className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${
                isActive
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {s.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
