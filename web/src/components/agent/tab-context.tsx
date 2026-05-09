"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface TabContextValue {
  projectId: string | null;
  tab: string | null;
  route: string;
}

const TabContext = createContext<TabContextValue>({
  projectId: null,
  tab: null,
  route: "/",
});

const TAB_FROM_PATH: Array<[RegExp, string]> = [
  [/^\/projects\/[^/]+\/application-prep/, "application-prep"],
  [/^\/projects\/[^/]+\/drawings/, "drawings"],
  [/^\/projects\/[^/]+\/rfis/, "rfis"],
  [/^\/projects\/[^/]+\/inspections/, "inspections"],
  [/^\/projects\/[^/]+\/documents/, "documents"],
  [/^\/projects\/[^/]+\/ccc/, "ccc"],
  [/^\/projects\/[^/]+\/?$/, "overview"],
];

/**
 * Pathname-derived agent context. Pure read of `usePathname()` — no fetching,
 * no mutable state, no side effects. Tabs that don't import `useTabContext`
 * are completely unaffected by this provider.
 */
export function TabContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const value = useMemo<TabContextValue>(() => {
    const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
    const projectId = projectMatch && projectMatch[1] !== "new" ? projectMatch[1] : null;
    let tab: string | null = null;
    for (const [re, name] of TAB_FROM_PATH) {
      if (re.test(pathname)) {
        tab = name;
        break;
      }
    }
    return { projectId, tab, route: pathname };
  }, [pathname]);
  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

export function useTabContext(): TabContextValue {
  return useContext(TabContext);
}
