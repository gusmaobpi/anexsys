"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  activateWorkspaceTab,
  buildWorkspaceHref,
  clearWorkspaceScopedState,
  cloneWorkspaceTabState,
  createEmptyWorkspaceStore,
  createWorkspaceTab,
  findWorkspaceTabByBasePath,
  getWorkspaceBasePath,
  getWorkspaceScopedState,
  HOME_WORKSPACE_PATH,
  isHomeWorkspacePath,
  isMeaningfulWorkspaceTab,
  isPinnedWorkspacePath,
  normalizeWorkspacePathname,
  normalizeWorkspaceStore,
  removeWorkspaceTab,
  resolveLandingWorkspaceTab,
  revealWorkspaceTab,
  setActiveWorkspaceTab,
  setWorkspaceScopedState,
  sameWorkspaceValue,
  upsertWorkspaceTab,
  isWorkspaceListPath,
  type WorkspaceStore,
  type WorkspaceTab,
  WORKSPACE_QUERY_PARAM,
} from "@/components/app-shell/workspace-manager-store";
import { useWorkspacePane } from "@/components/app-shell/workspace-pane";
import { clearLegacyWorkspaceStores, WORKSPACE_STORAGE_KEY } from "@/components/app-shell/workspace-storage";

const DASHBOARD_PATH = HOME_WORKSPACE_PATH;

function isSingletonWorkspacePath(pathname: string) {
  return !pathname.includes("?") && !pathname.includes("#");
}

function resolveComparableCurrentPath(pathname: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete(WORKSPACE_QUERY_PARAM);
  const query = params.toString();
  return normalizeWorkspacePathname(query ? `${pathname}?${query}` : pathname);
}

type WorkspaceRegistrationInput = {
  label: string;
  subtitle?: string | null;
  pathname?: string;
  tabId?: string;
};

type WorkspaceManagerContextValue = {
  currentTabId: string | null;
  currentTab: WorkspaceTab | null;
  tabs: WorkspaceTab[];
  storageReady: boolean;
  registerCurrentWorkspace: (input: WorkspaceRegistrationInput) => string | null;
  closeWorkspace: (tabId: string) => void;
  activateWorkspace: (tabId: string) => void;
  goHome: () => void;
  isHome: boolean;
  openWorkspaceFromMenu: (pathname: string, label: string) => void;
  openWorkspaceInNewTab: (
    pathname: string,
    label: string,
    opts?: { subtitle?: string | null; cloneCurrent?: boolean; reuse?: "path" | "base" | "none" },
  ) => void;
  openWorkspaceInBrowserTab: (pathname?: string, label?: string, opts?: { subtitle?: string | null; cloneCurrent?: boolean }) => void;
  openWorkspaceInBrowserWindow: (pathname?: string, label?: string, opts?: { subtitle?: string | null; cloneCurrent?: boolean }) => void;
  getWorkspaceHref: (pathname: string, opts?: { preserveCurrent?: boolean }) => string;
  navigateWithinWorkspace: (pathname: string) => void;
  buildWorkspaceHref: (pathname: string, tabId: string) => string;
  readScopedState: <T,>(scope: string, tabId?: string | null) => T | null;
  writeScopedState: <T,>(scope: string, value: T, tabId?: string | null) => void;
  clearScopedState: (scope: string, tabId?: string | null) => void;
};

const WorkspaceManagerContext = createContext<WorkspaceManagerContextValue | null>(null);

function createTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return ["tab", Date.now().toString(36), Math.random().toString(36).slice(2, 10)].join("-");
}

function readStore(): WorkspaceStore {
  if (typeof window === "undefined") {
    return createEmptyWorkspaceStore();
  }

  clearLegacyWorkspaceStores();
  const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) {
    return createEmptyWorkspaceStore();
  }

  try {
    const parsed = JSON.parse(raw) as WorkspaceStore;
    return normalizeWorkspaceStore({
      tabs: parsed.tabs ?? [],
      activeTabId: parsed.activeTabId ?? null,
      stateByTabId: parsed.stateByTabId ?? {},
    });
  } catch {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    return createEmptyWorkspaceStore();
  }
}

const WORKSPACE_PERSIST_DELAY_MS = 400;
let persistTimer: number | null = null;
let persistSnapshot: WorkspaceStore | null = null;
let lastPersistedJson = "";

function flushWorkspaceStore() {
  if (typeof window === "undefined" || !persistSnapshot) {
    return;
  }
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  const json = JSON.stringify(persistSnapshot);
  if (json === lastPersistedJson) {
    return;
  }
  lastPersistedJson = json;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, json);
}

function scheduleWorkspaceStore(store: WorkspaceStore) {
  persistSnapshot = store;
  if (typeof window === "undefined") {
    return;
  }
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
  }
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    flushWorkspaceStore();
  }, WORKSPACE_PERSIST_DELAY_MS);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushWorkspaceStore);
}

export function WorkspaceManagerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTabId = searchParams.get(WORKSPACE_QUERY_PARAM);
  const [store, setStore] = useState<WorkspaceStore>(() => createEmptyWorkspaceStore());
  const [storageReady, setStorageReady] = useState(false);
  const storeRef = useRef(store);
  const storageReadyRef = useRef(false);
  const storeRenderQueuedRef = useRef(false);
  const hydratedFromUrlRef = useRef(false);
  const lastSyncedHrefRef = useRef<string | null>(null);
  const currentTabId = store.activeTabId;
  const currentTab = currentTabId ? store.tabs.find((candidate) => candidate.id === currentTabId) ?? null : null;
  const currentComparablePath = resolveComparableCurrentPath(pathname, searchParams);

  const commitStore = useCallback((next: WorkspaceStore | ((current: WorkspaceStore) => WorkspaceStore)) => {
    const resolved = typeof next === "function" ? next(storeRef.current) : next;
    if (resolved === storeRef.current) {
      return resolved;
    }
    storeRef.current = resolved;
    if (storageReadyRef.current) {
      scheduleWorkspaceStore(resolved);
    }
    if (!storeRenderQueuedRef.current) {
      storeRenderQueuedRef.current = true;
      queueMicrotask(() => {
        storeRenderQueuedRef.current = false;
        setStore(storeRef.current);
      });
    }
    return resolved;
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    scheduleWorkspaceStore(store);
  }, [storageReady, store]);

  useEffect(() => {
    const persisted = readStore();
    storeRef.current = persisted;
    storageReadyRef.current = true;
    // Tabs live in localStorage; apply them after mount so SSR and the first client paint stay empty together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore(persisted);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady || hydratedFromUrlRef.current) {
      return;
    }

    hydratedFromUrlRef.current = true;
    if (pathname.startsWith("/floor/")) {
      return;
    }
    const landing = resolveLandingWorkspaceTab(storeRef.current, pathname, urlTabId);
    if (landing.goHome) {
      commitStore((current) => setActiveWorkspaceTab(current, null));
      if (urlTabId || currentComparablePath !== DASHBOARD_PATH) {
        lastSyncedHrefRef.current = DASHBOARD_PATH;
        router.replace(DASHBOARD_PATH);
      }
      return;
    }
    if (landing.activeTabId && landing.activeTabId !== storeRef.current.activeTabId) {
      commitStore((current) => setActiveWorkspaceTab(current, landing.activeTabId));
    }
  }, [commitStore, currentComparablePath, pathname, router, storageReady, urlTabId]);

  const findSingletonTabByPath = useCallback((targetPathname: string) => {
    const normalizedPath = normalizeWorkspacePathname(targetPathname);
    if (!isSingletonWorkspacePath(normalizedPath)) {
      return null;
    }

    return storeRef.current.tabs.find((candidate) => candidate.pathname === normalizedPath) ?? null;
  }, []);

  const syncWorkspaceUrl = useCallback(
    (targetPathname: string, tabId: string) => {
      const href = buildWorkspaceHref(targetPathname, tabId);
      if (lastSyncedHrefRef.current === href) {
        return;
      }
      if (currentComparablePath === normalizeWorkspacePathname(targetPathname) && urlTabId === tabId) {
        lastSyncedHrefRef.current = href;
        return;
      }
      lastSyncedHrefRef.current = href;
      router.replace(href);
    },
    [currentComparablePath, router, urlTabId],
  );

  const activateWorkspace = useCallback(
    (tabId: string) => {
      const target = storeRef.current.tabs.find((candidate) => candidate.id === tabId);
      if (!target) {
        return;
      }

      commitStore((current) => setActiveWorkspaceTab(current, tabId));
      syncWorkspaceUrl(target.pathname, tabId);
    },
    [commitStore, syncWorkspaceUrl],
  );

  const ensureWorkspaceTab = useCallback(
    (input: WorkspaceRegistrationInput) => {
      const resolvedPathname = input.pathname ?? currentComparablePath;
      const nextLabel = input.label.trim();
      const nextSubtitle = input.subtitle?.trim() || null;

      if (input.tabId) {
        const paneTab = storeRef.current.tabs.find((candidate) => candidate.id === input.tabId);
        if (!paneTab) {
          return null;
        }

        if (paneTab.label !== nextLabel || (paneTab.subtitle ?? null) !== nextSubtitle) {
          commitStore((current) =>
            upsertWorkspaceTab(current, {
              ...paneTab,
              label: nextLabel,
              subtitle: nextSubtitle,
            }),
          );
        }
        return paneTab.id;
      }

      if (storeRef.current.activeTabId) {
        return storeRef.current.activeTabId;
      }

      if (isHomeWorkspacePath(resolvedPathname)) {
        return null;
      }

      const seedTab = createWorkspaceTab({
        id: createTabId(),
        pathname: resolvedPathname,
        label: nextLabel,
        subtitle: nextSubtitle,
      });
      if (!isMeaningfulWorkspaceTab(seedTab)) {
        return null;
      }

      const singletonTab = findSingletonTabByPath(seedTab.pathname);
      if (singletonTab) {
        commitStore((current) => revealWorkspaceTab(current, singletonTab.id));
        syncWorkspaceUrl(singletonTab.pathname, singletonTab.id);
        return singletonTab.id;
      }

      commitStore((current) => activateWorkspaceTab(current, seedTab));
      syncWorkspaceUrl(seedTab.pathname, seedTab.id);
      return seedTab.id;
    },
    [commitStore, currentComparablePath, findSingletonTabByPath, syncWorkspaceUrl],
  );

  const goHome = useCallback(() => {
    commitStore((current) => setActiveWorkspaceTab(current, null));
    if (lastSyncedHrefRef.current === DASHBOARD_PATH) {
      return;
    }
    lastSyncedHrefRef.current = DASHBOARD_PATH;
    router.replace(DASHBOARD_PATH);
  }, [commitStore, router]);

  const closeWorkspace = useCallback(
    (tabId: string) => {
      const closingTab = storeRef.current.tabs.find((candidate) => candidate.id === tabId);
      if (closingTab && isPinnedWorkspacePath(closingTab.pathname)) {
        return;
      }

      const closingTabIndex = storeRef.current.tabs.findIndex((candidate) => candidate.id === tabId);
      const nextStore = removeWorkspaceTab(storeRef.current, tabId);
      const activeTabId = storeRef.current.activeTabId;

      if (tabId !== activeTabId) {
        commitStore(nextStore);
        return;
      }

      const remainingTabs = nextStore.tabs;
      if (remainingTabs.length === 0) {
        commitStore(nextStore);
        lastSyncedHrefRef.current = DASHBOARD_PATH;
        router.replace(DASHBOARD_PATH);
        return;
      }

      const fallbackTab = remainingTabs[Math.max(Math.min(closingTabIndex, remainingTabs.length - 1), 0)] ?? remainingTabs[0];
      commitStore(setActiveWorkspaceTab(nextStore, fallbackTab.id));
      syncWorkspaceUrl(fallbackTab.pathname, fallbackTab.id);
    },
    [commitStore, router, syncWorkspaceUrl],
  );

  const openWorkspaceInNewTab = useCallback(
    (
      nextPathname: string,
      label: string,
      opts: { subtitle?: string | null; cloneCurrent?: boolean; reuse?: "path" | "base" | "none" } = {},
    ) => {
      const nextTabId = createTabId();
      const nextTab = createWorkspaceTab({
        id: nextTabId,
        pathname: nextPathname,
        label,
        subtitle: opts.subtitle,
      });
      if (!isMeaningfulWorkspaceTab(nextTab)) {
        return;
      }

      if (isHomeWorkspacePath(nextTab.pathname)) {
        goHome();
        return;
      }

      const reuse = opts.reuse ?? "path";
      const existingTab =
        reuse === "none"
          ? undefined
          : reuse === "base"
            ? findWorkspaceTabByBasePath(storeRef.current.tabs, nextTab.pathname)
            : findSingletonTabByPath(nextTab.pathname);
      if (existingTab) {
        commitStore((current) => revealWorkspaceTab(current, existingTab.id));
        syncWorkspaceUrl(existingTab.pathname, existingTab.id);
        return;
      }

      let nextStore = activateWorkspaceTab(storeRef.current, nextTab);
      if (opts.cloneCurrent !== false && currentTabId) {
        nextStore = cloneWorkspaceTabState(nextStore, currentTabId, nextTabId);
        nextStore = setActiveWorkspaceTab(nextStore, nextTabId);
      }

      commitStore(nextStore);
      syncWorkspaceUrl(nextTab.pathname, nextTabId);
    },
    [commitStore, currentTabId, findSingletonTabByPath, goHome, syncWorkspaceUrl],
  );

  const openWorkspaceFromMenu = useCallback(
    (nextPathname: string, label: string) => {
      const basePath = getWorkspaceBasePath(nextPathname);
      const existing = storeRef.current.tabs.find(
        (tab) => getWorkspaceBasePath(tab.pathname) === basePath && isWorkspaceListPath(tab.pathname),
      );
      if (existing) {
        const pathname = normalizeWorkspacePathname(nextPathname);
        commitStore((current) =>
          revealWorkspaceTab(
            upsertWorkspaceTab(current, {
              ...existing,
              pathname,
              label,
              subtitle: null,
            }),
            existing.id,
          ),
        );
        syncWorkspaceUrl(pathname, existing.id);
        return;
      }
      openWorkspaceInNewTab(nextPathname, label, { cloneCurrent: false, reuse: "path" });
    },
    [commitStore, openWorkspaceInNewTab, syncWorkspaceUrl],
  );

  const openWorkspaceInBrowserTab = useCallback(
    (nextPathname?: string, label?: string, opts: { subtitle?: string | null; cloneCurrent?: boolean } = {}) => {
      const pathnameToOpen = nextPathname ?? currentTab?.pathname;
      const labelToOpen = label ?? currentTab?.label;
      if (!pathnameToOpen || !labelToOpen) {
        return;
      }

      const nextTabId = createTabId();
      const nextTab = createWorkspaceTab({
        id: nextTabId,
        pathname: pathnameToOpen,
        label: labelToOpen,
        subtitle: opts.subtitle,
      });
      if (!isMeaningfulWorkspaceTab(nextTab)) {
        return;
      }

      let nextStore = upsertWorkspaceTab(storeRef.current, nextTab);
      if (opts.cloneCurrent !== false && currentTabId) {
        nextStore = cloneWorkspaceTabState(nextStore, currentTabId, nextTabId);
      }
      commitStore(nextStore);
      if (typeof window !== "undefined") {
        window.open(buildWorkspaceHref(nextTab.pathname, nextTabId), "_blank", "noopener,noreferrer");
      }
    },
    [commitStore, currentTab, currentTabId],
  );

  const openWorkspaceInBrowserWindow = useCallback(
    (nextPathname?: string, label?: string, opts: { subtitle?: string | null; cloneCurrent?: boolean } = {}) => {
      const pathnameToOpen = nextPathname ?? currentTab?.pathname;
      const labelToOpen = label ?? currentTab?.label;
      if (!pathnameToOpen || !labelToOpen) {
        return;
      }

      const nextTabId = createTabId();
      const nextTab = createWorkspaceTab({
        id: nextTabId,
        pathname: pathnameToOpen,
        label: labelToOpen,
        subtitle: opts.subtitle,
      });
      if (!isMeaningfulWorkspaceTab(nextTab)) {
        return;
      }

      let nextStore = upsertWorkspaceTab(storeRef.current, nextTab);
      if (opts.cloneCurrent !== false && currentTabId) {
        nextStore = cloneWorkspaceTabState(nextStore, currentTabId, nextTabId);
      }
      commitStore(nextStore);
      if (typeof window !== "undefined") {
        window.open(buildWorkspaceHref(nextTab.pathname, nextTabId), "_blank", "popup=yes,width=1440,height=900,noopener");
      }
    },
    [commitStore, currentTab, currentTabId],
  );

  const getWorkspaceHref = useCallback(
    (nextPathname: string, opts: { preserveCurrent?: boolean } = {}) => {
      if (opts.preserveCurrent !== false && currentTabId) {
       return buildWorkspaceHref(nextPathname, currentTabId);
      }

      return nextPathname;
    },
    [currentTabId],
  );

  const navigateWithinWorkspace = useCallback(
    (nextPathname: string) => {
      const tabId = storeRef.current.activeTabId;
      if (!tabId) {
        if (lastSyncedHrefRef.current === nextPathname) {
          return;
        }
        lastSyncedHrefRef.current = nextPathname;
        router.replace(nextPathname);
        return;
      }

      const existingTab = storeRef.current.tabs.find((candidate) => candidate.id === tabId);
      if (existingTab) {
        commitStore((current) =>
          setActiveWorkspaceTab(
            upsertWorkspaceTab(current, {
              ...existingTab,
              pathname: normalizeWorkspacePathname(nextPathname),
            }),
            tabId,
          ),
        );
      }

      syncWorkspaceUrl(nextPathname, tabId);
    },
    [commitStore, router, syncWorkspaceUrl],
  );

  const readScopedState = useCallback(<T,>(scope: string, tabId?: string | null): T | null => {
    const resolvedTabId = tabId ?? storeRef.current.activeTabId;
    if (!resolvedTabId) {
      return null;
    }

    return getWorkspaceScopedState<T>(storeRef.current, resolvedTabId, scope);
  }, []);

  const writeScopedState = useCallback((scope: string, value: unknown, tabId?: string | null) => {
    const resolvedTabId = tabId ?? storeRef.current.activeTabId;
    if (!resolvedTabId) {
      return;
    }

    commitStore((current) => setWorkspaceScopedState(current, resolvedTabId, scope, value));
  }, [commitStore]);

  const clearScopedState = useCallback((scope: string, tabId?: string | null) => {
    const resolvedTabId = tabId ?? storeRef.current.activeTabId;
    if (!resolvedTabId) {
      return;
    }

    commitStore((current) => clearWorkspaceScopedState(current, resolvedTabId, scope));
  }, [commitStore]);

  const isHome = isHomeWorkspacePath(pathname);

  const value = useMemo<WorkspaceManagerContextValue>(
    () => ({
      currentTabId,
      currentTab,
      tabs: store.tabs,
      storageReady,
      registerCurrentWorkspace: (input) =>
        ensureWorkspaceTab({
          pathname: input.pathname ?? currentComparablePath,
          label: input.label,
          subtitle: input.subtitle,
          tabId: input.tabId,
        }),
      closeWorkspace,
      activateWorkspace,
      goHome,
      isHome,
      openWorkspaceFromMenu,
      openWorkspaceInNewTab,
      openWorkspaceInBrowserTab,
      openWorkspaceInBrowserWindow,
      getWorkspaceHref,
      navigateWithinWorkspace,
      buildWorkspaceHref,
      readScopedState,
      writeScopedState,
      clearScopedState,
    }),
    [
      activateWorkspace,
      clearScopedState,
      closeWorkspace,
      goHome,
      isHome,
      currentTab,
      currentTabId,
      getWorkspaceHref,
      navigateWithinWorkspace,
      ensureWorkspaceTab,
      openWorkspaceFromMenu,
      openWorkspaceInBrowserWindow,
      openWorkspaceInBrowserTab,
      openWorkspaceInNewTab,
      currentComparablePath,
      readScopedState,
      storageReady,
      store.tabs,
      writeScopedState,
    ],
  );

  return <WorkspaceManagerContext.Provider value={value}>{children}</WorkspaceManagerContext.Provider>;
}

export function useWorkspaceManager() {
  const context = useContext(WorkspaceManagerContext);
  if (!context) {
    throw new Error("useWorkspaceManager must be used inside WorkspaceManagerProvider.");
  }

  return context;
}

export function useWorkspaceRegistration(input: { label: string; subtitle?: string | null }) {
  const {
    currentTab,
    currentTabId,
    openWorkspaceInBrowserTab,
    openWorkspaceInBrowserWindow,
    openWorkspaceFromMenu,
    openWorkspaceInNewTab,
    navigateWithinWorkspace,
    registerCurrentWorkspace,
    storageReady,
  } = useWorkspaceManager();
  const pane = useWorkspacePane();
  const { label, subtitle = null } = input;

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    registerCurrentWorkspace({
      label,
      subtitle,
      pathname: pane?.pathname,
      tabId: pane?.tabId,
    });
  }, [label, pane?.pathname, pane?.tabId, registerCurrentWorkspace, storageReady, subtitle]);

  return {
    currentTab,
    currentTabId,
    openWorkspaceInBrowserTab,
    openWorkspaceInBrowserWindow,
    openWorkspaceFromMenu,
    openWorkspaceInNewTab,
    navigateWithinWorkspace,
  };
}

export function useWorkspaceScopedState<T>(scope: string, initialValue: T): [T, (value: T | ((current: T) => T)) => void, boolean] {
  const { currentTabId, readScopedState, writeScopedState } = useWorkspaceManager();
  const pane = useWorkspacePane();
  const scopedTabId = pane?.tabId ?? currentTabId;
  const initialValueRef = useRef(initialValue);
  const [value, setValue] = useState<T>(() => initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    initialValueRef.current = initialValue;
  }, [initialValue, scope]);

  useEffect(() => {
    if (!scopedTabId) {
      setValue(initialValueRef.current);
      setHydrated(false);
      return;
    }

    const stored = readScopedState<T>(scope, scopedTabId);
    setValue(stored ?? initialValueRef.current);
    setHydrated(true);
  }, [readScopedState, scope, scopedTabId]);

  const setPersistedValue = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = next instanceof Function ? (next as (value: T) => T)(current) : next;
        if (scopedTabId && !sameWorkspaceValue(current, resolved)) {
          queueMicrotask(() => {
            writeScopedState(scope, resolved, scopedTabId);
          });
        }
        return resolved;
      });
    },
    [scope, scopedTabId, writeScopedState],
  );

  return [value, setPersistedValue, hydrated];
}

export function TopbarChipTray() {
  const { goHome, isHome } = useWorkspaceManager();

  return (
    <div className="topbar__chips" aria-label="Atalhos fixos">
      <button
        aria-current={isHome ? "page" : undefined}
        className={`topbar-chip${isHome ? " topbar-chip--active" : ""}`}
        onClick={() => goHome()}
        type="button"
      >
        Dashboard
      </button>
    </div>
  );
}

export function WorkspaceTabsBar() {
  const { currentTabId, tabs, activateWorkspace, closeWorkspace } = useWorkspaceManager();
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const workTabs = useMemo(
    () => tabs.filter((tab) => !isHomeWorkspacePath(tab.pathname) && !isPinnedWorkspacePath(tab.pathname)),
    [tabs],
  );

  useEffect(() => {
    const bar = tabListRef.current;
    const active = bar?.querySelector<HTMLElement>(".workspace-tab--active");
    if (!bar || !active) {
      return;
    }
    const firstWorkId = workTabs[0]?.id;
    if (firstWorkId === currentTabId) {
      bar.scrollLeft = 0;
      return;
    }
    const left = active.offsetLeft - bar.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < bar.scrollLeft) {
      bar.scrollLeft = left;
    } else if (right > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = right - bar.clientWidth;
    }
  }, [currentTabId, workTabs, tabs]);

  function renderTab(tab: WorkspaceTab, closeable: boolean) {
    const active = tab.id === currentTabId;
    return (
      <div
        className={`workspace-tab${active ? " workspace-tab--active" : ""}${closeable ? "" : " workspace-tab--pinned"}`}
        key={tab.id}
        role="presentation"
      >
        <button
          aria-selected={active}
          className="workspace-tab__trigger"
          onClick={() => activateWorkspace(tab.id)}
          role="tab"
          title={tab.subtitle ? `${tab.label} · ${tab.subtitle}` : closeable ? tab.label : `${tab.label} (fixa)`}
          type="button"
        >
          <span className="workspace-tab__title">{tab.label}</span>
          {tab.subtitle ? <small className="workspace-tab__subtitle">{tab.subtitle}</small> : null}
        </button>
        {closeable ? (
          <button
            aria-label={`Fechar ${tab.label}`}
            className="workspace-tab__close"
            onClick={() => closeWorkspace(tab.id)}
            type="button"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }

  if (workTabs.length === 0) {
    return null;
  }

  return (
    <div className="workspace-tabs" role="tablist" aria-label="Abas abertas">
      <div className="workspace-tabs__scroll" ref={tabListRef}>
        {workTabs.map((tab) => renderTab(tab, true))}
      </div>
    </div>
  );
}
