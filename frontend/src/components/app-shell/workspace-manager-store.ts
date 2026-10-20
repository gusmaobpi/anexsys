export type WorkspaceTab = {
  id: string;
  pathname: string;
  label: string;
  subtitle?: string | null;
};

export type WorkspaceTabState = Record<string, unknown>;

export type WorkspaceStore = {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  stateByTabId: Record<string, WorkspaceTabState>;
};

export const WORKSPACE_QUERY_PARAM = "workspaceTab";
export const HOME_WORKSPACE_PATH = "/dashboard";
/** Home destinations live in the topbar chip tray, not in the work-tab strip. */
export const PINNED_WORKSPACE_BASE_PATHS = [] as const;

export function isPinnedWorkspacePath(pathname: string): boolean {
  return (PINNED_WORKSPACE_BASE_PATHS as readonly string[]).includes(getWorkspaceBasePath(pathname));
}

export function isHomeWorkspacePath(pathname: string): boolean {
  return getWorkspaceBasePath(pathname) === HOME_WORKSPACE_PATH;
}

export function arrangeWorkspaceTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const pinned: WorkspaceTab[] = [];
  const rest: WorkspaceTab[] = [];
  for (const tab of tabs) {
    if (isPinnedWorkspacePath(tab.pathname)) {
      pinned.push(tab);
    } else {
      rest.push(tab);
    }
  }
  pinned.sort(
    (left, right) =>
      (PINNED_WORKSPACE_BASE_PATHS as readonly string[]).indexOf(getWorkspaceBasePath(left.pathname)) -
      (PINNED_WORKSPACE_BASE_PATHS as readonly string[]).indexOf(getWorkspaceBasePath(right.pathname)),
  );
  return [...pinned, ...rest];
}

export function normalizeWorkspacePathname(pathname: string): string {
  const [pathWithQuery, hashFragment = ""] = pathname.trim().split("#");
  const [basePath, rawQuery = ""] = pathWithQuery.split("?");
  const params = new URLSearchParams(rawQuery);
  params.delete(WORKSPACE_QUERY_PARAM);
  const query = params.toString();
  const hash = hashFragment ? `#${hashFragment}` : "";
  return `${query ? `${basePath}?${query}` : basePath}${hash}`;
}

export function createEmptyWorkspaceStore(): WorkspaceStore {
  return {
    tabs: [],
    activeTabId: null,
    stateByTabId: {},
  };
}

export function resolveActiveWorkspaceTabId(tabs: WorkspaceTab[], activeTabId?: string | null): string | null {
  if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) {
    return activeTabId;
  }

  return null;
}

export function createWorkspaceTab(input: {
  id: string;
  pathname: string;
  label: string;
  subtitle?: string | null;
}): WorkspaceTab {
  return {
    id: input.id.trim(),
    pathname: normalizeWorkspacePathname(input.pathname),
    label: input.label.trim(),
    subtitle: input.subtitle?.trim() || null,
  };
}

export function isMeaningfulWorkspaceTab(tab: WorkspaceTab): boolean {
  return Boolean(tab.id.trim() && tab.pathname.trim() && tab.label.trim());
}

export function normalizeWorkspaceStore(store: WorkspaceStore): WorkspaceStore {
  const stripped = stripHomeWorkspaceTabs({
    tabs: store.tabs.map((tab) => createWorkspaceTab(tab)).filter(isMeaningfulWorkspaceTab),
    activeTabId: store.activeTabId,
    stateByTabId: store.stateByTabId ?? {},
  });
  const tabs = arrangeWorkspaceTabs(stripped.tabs);
  const validTabIds = new Set(tabs.map((tab) => tab.id));
  const stateByTabId = Object.fromEntries(
    Object.entries(stripped.stateByTabId).filter(([tabId]) => validTabIds.has(tabId)),
  );

  return {
    tabs,
    activeTabId: resolveActiveWorkspaceTabId(tabs, stripped.activeTabId),
    stateByTabId,
  };
}

export function upsertWorkspaceTab(store: WorkspaceStore, tab: WorkspaceTab): WorkspaceStore {
  if (!isMeaningfulWorkspaceTab(tab)) {
    return normalizeWorkspaceStore(store);
  }

  const index = store.tabs.findIndex((candidate) => candidate.id === tab.id);
  if (index >= 0) {
    const nextTabs = [...store.tabs];
    nextTabs[index] = tab;
    return normalizeWorkspaceStore({ ...store, tabs: nextTabs });
  }

  return normalizeWorkspaceStore({
    ...store,
    tabs: [tab, ...store.tabs],
  });
}

export function moveWorkspaceTabToFront(store: WorkspaceStore, tabId: string): WorkspaceStore {
  const index = store.tabs.findIndex((tab) => tab.id === tabId);
  if (index <= 0) {
    return store;
  }

  const tab = store.tabs[index];
  return {
    ...store,
    tabs: [tab, ...store.tabs.filter((candidate) => candidate.id !== tabId)],
  };
}

export function setActiveWorkspaceTab(store: WorkspaceStore, tabId: string | null): WorkspaceStore {
  return normalizeWorkspaceStore({
    ...store,
    activeTabId: tabId,
  });
}

export function revealWorkspaceTab(store: WorkspaceStore, tabId: string): WorkspaceStore {
  return setActiveWorkspaceTab(moveWorkspaceTabToFront(store, tabId), tabId);
}

export function activateWorkspaceTab(store: WorkspaceStore, tab: WorkspaceTab): WorkspaceStore {
  return setActiveWorkspaceTab(upsertWorkspaceTab(store, tab), tab.id);
}

export function removeWorkspaceTab(store: WorkspaceStore, tabId: string): WorkspaceStore {
  const tab = store.tabs.find((candidate) => candidate.id === tabId);
  if (tab && isPinnedWorkspacePath(tab.pathname)) {
    return store;
  }

  const remainingState = { ...store.stateByTabId };
  delete remainingState[tabId];
  return normalizeWorkspaceStore({
    tabs: store.tabs.filter((candidate) => candidate.id !== tabId),
    activeTabId: store.activeTabId === tabId ? null : store.activeTabId,
    stateByTabId: remainingState,
  });
}

export function cloneWorkspaceTabState(store: WorkspaceStore, sourceTabId: string, targetTabId: string): WorkspaceStore {
  const sourceState = store.stateByTabId[sourceTabId];
  if (!sourceState) {
    return store;
  }

  return {
    ...store,
    stateByTabId: {
      ...store.stateByTabId,
      [targetTabId]: structuredClone(sourceState),
    },
  };
}

export function setWorkspaceScopedState<T>(store: WorkspaceStore, tabId: string, scope: string, value: T): WorkspaceStore {
  return {
    ...store,
    stateByTabId: {
      ...store.stateByTabId,
      [tabId]: {
        ...(store.stateByTabId[tabId] ?? {}),
        [scope]: value,
      },
    },
  };
}

export function getWorkspaceScopedState<T>(store: WorkspaceStore, tabId: string, scope: string): T | null {
  const state = store.stateByTabId[tabId];
  if (!state || !(scope in state)) {
    return null;
  }

  return state[scope] as T;
}

export function clearWorkspaceScopedState(store: WorkspaceStore, tabId: string, scope: string): WorkspaceStore {
  const tabState = store.stateByTabId[tabId];
  if (!tabState || !(scope in tabState)) {
    return store;
  }

  const remainingScopeState = { ...tabState };
  delete remainingScopeState[scope];
  return {
    ...store,
    stateByTabId: {
      ...store.stateByTabId,
      [tabId]: remainingScopeState,
    },
  };
}

export function getWorkspaceBasePath(pathname: string): string {
  return normalizeWorkspacePathname(pathname).split("?")[0] || "/";
}

export function listWorkspaceTabsForNavItem(tabs: WorkspaceTab[], href: string): WorkspaceTab[] {
  return tabs.filter((tab) => getWorkspaceBasePath(tab.pathname) === href);
}

export function shouldShowWorkspaceNavSubmenu(tabs: WorkspaceTab[], href: string): boolean {
  if (isHomeWorkspacePath(href)) {
    return false;
  }

  return listWorkspaceTabsForNavItem(tabs, href).some(
    (tab) => normalizeWorkspacePathname(tab.pathname) !== href,
  );
}

export function isDashboardWorkspacePath(pathname: string): boolean {
  return isHomeWorkspacePath(pathname);
}

export function findWorkspaceTabByBasePath(tabs: WorkspaceTab[], pathname: string): WorkspaceTab | undefined {
  const basePath = getWorkspaceBasePath(pathname);
  return tabs.find((tab) => getWorkspaceBasePath(tab.pathname) === basePath);
}

export function resolveLandingWorkspaceTab(
  store: WorkspaceStore,
  currentPathname: string,
  urlTabId: string | null,
): { activeTabId: string | null; goHome: boolean } {
  if (urlTabId && store.tabs.some((tab) => tab.id === urlTabId)) {
    return { activeTabId: urlTabId, goHome: false };
  }

  if (currentPathname.startsWith("/floor/")) {
    return { activeTabId: null, goHome: false };
  }

  if (isHomeWorkspacePath(currentPathname)) {
    return { activeTabId: null, goHome: true };
  }

  return { activeTabId: store.activeTabId, goHome: false };
}

export function stripHomeWorkspaceTabs(store: WorkspaceStore): WorkspaceStore {
  const dropIds = new Set(
    store.tabs.filter((tab) => isHomeWorkspacePath(tab.pathname)).map((tab) => tab.id),
  );
  if (dropIds.size === 0) {
    return store;
  }

  const remainingState = { ...store.stateByTabId };
  for (const tabId of dropIds) {
    delete remainingState[tabId];
  }

  return {
    ...store,
    tabs: store.tabs.filter((tab) => !dropIds.has(tab.id)),
    activeTabId: store.activeTabId && dropIds.has(store.activeTabId) ? null : store.activeTabId,
    stateByTabId: remainingState,
  };
}

export function collapseDuplicateDashboardTabs(store: WorkspaceStore): WorkspaceStore {
  return stripHomeWorkspaceTabs(store);
}

export function getWorkspaceSearchParams(pathname: string): URLSearchParams {
  const normalized = normalizeWorkspacePathname(pathname);
  const queryIndex = normalized.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? normalized.slice(queryIndex + 1) : "");
}

export function buildWorkspaceHref(pathname: string, tabId: string): string {
  const [pathWithQuery, hashFragment = ""] = pathname.split("#");
  const [basePath, rawQuery = ""] = pathWithQuery.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set(WORKSPACE_QUERY_PARAM, tabId);
  const query = params.toString();
  const hash = hashFragment ? `#${hashFragment}` : "";
  return `${query ? `${basePath}?${query}` : basePath}${hash}`;
}
