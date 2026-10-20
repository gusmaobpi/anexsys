"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { getWorkspaceSearchParams, type WorkspaceTab } from "@/components/app-shell/workspace-manager-store";

export type WorkspacePaneValue = {
  tabId: string;
  pathname: string;
  searchParams: URLSearchParams;
};

const WorkspacePaneContext = createContext<WorkspacePaneValue | null>(null);

export function WorkspacePaneProvider({
  tab,
  children,
}: Readonly<{
  tab: WorkspaceTab;
  children: ReactNode;
}>) {
  const searchParams = useMemo(() => getWorkspaceSearchParams(tab.pathname), [tab.pathname]);
  const value = useMemo<WorkspacePaneValue>(
    () => ({
      tabId: tab.id,
      pathname: tab.pathname,
      searchParams,
    }),
    [searchParams, tab.id, tab.pathname],
  );

  return <WorkspacePaneContext.Provider value={value}>{children}</WorkspacePaneContext.Provider>;
}

export function useWorkspacePane() {
  return useContext(WorkspacePaneContext);
}

export function useWorkspaceSearchParams(): URLSearchParams {
  const pane = useWorkspacePane();
  const nextParams = useSearchParams();
  return pane?.searchParams ?? nextParams;
}
