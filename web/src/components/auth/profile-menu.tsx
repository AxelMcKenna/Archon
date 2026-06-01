"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";

const MENU_LINKS: { name: string; href: Route }[] = [
  { name: "Settings", href: "/settings" as Route },
  { name: "Help", href: "/help" as Route },
];

export function ProfileMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 font-display uppercase tracking-[0.14em] text-[14px] font-medium transition-colors ${
          open ? "text-ink-50" : "text-ink-400 hover:text-ink-50"
        }`}
      >
        Profile
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-3 w-52 overflow-hidden rounded-sm border border-ink-200 bg-surface-raised py-1.5"
        >
          <p className="truncate px-4 pb-1.5 pt-1 font-display uppercase tracking-[0.12em] text-[11px] text-ink-400">
            {displayName}
          </p>
          <span aria-hidden className="mx-4 my-1 block h-px bg-ink-150" />
          {MENU_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 font-display uppercase tracking-[0.12em] text-[12px] text-ink-600 transition-colors hover:bg-surface-sunken hover:text-ink-900"
            >
              {item.name}
            </Link>
          ))}
          <span aria-hidden className="mx-4 my-1 block h-px bg-ink-150" />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2 text-left font-display uppercase tracking-[0.12em] text-[12px] text-ink-600 transition-colors hover:bg-surface-sunken hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
