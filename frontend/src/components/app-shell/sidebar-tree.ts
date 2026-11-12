export const SIDEBAR_TREE_STORAGE_KEY = "anexsys.frontend.sidebar-tree.v1";
const SIDEBAR_TREE_EVENT = "anexsys-sidebar-tree";
export const SIDEBAR_FAVORITES_STORAGE_PREFIX = "anexsys.frontend.sidebar-favorites.v1";
export const SIDEBAR_COLLAPSED_STORAGE_PREFIX = "anexsys.frontend.sidebar-collapsed.v1";

export type SidebarTreeState = {
  collapsedSections: string[];
  collapsedItems: string[];
};

const emptyTree: SidebarTreeState = {
  collapsedSections: [],
  collapsedItems: [],
};

const emptyFavorites: string[] = [];
const favoritesCache = new Map<string, { raw: string | null; list: string[] }>();

let cachedRaw: string | null = null;
let cachedTree: SidebarTreeState = emptyTree;

export function createEmptySidebarTree(): SidebarTreeState {
  return emptyTree;
}

export function toggleTreeId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function normalizeSidebarTree(state: SidebarTreeState): SidebarTreeState {
  return {
    collapsedSections: [...new Set(state.collapsedSections.filter((id) => id.trim()))],
    collapsedItems: [...new Set(state.collapsedItems.filter((id) => id.trim()))],
  };
}

export function readSidebarTree(): SidebarTreeState {
  if (typeof window === "undefined") {
    return emptyTree;
  }

  const raw = window.localStorage.getItem(SIDEBAR_TREE_STORAGE_KEY);
  if (raw === cachedRaw) {
    return cachedTree;
  }

  cachedRaw = raw;
  if (!raw) {
    cachedTree = emptyTree;
    return cachedTree;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SidebarTreeState>;
    cachedTree = normalizeSidebarTree({
      collapsedSections: Array.isArray(parsed.collapsedSections) ? parsed.collapsedSections.map(String) : [],
      collapsedItems: Array.isArray(parsed.collapsedItems) ? parsed.collapsedItems.map(String) : [],
    });
  } catch {
    cachedTree = emptyTree;
  }

  return cachedTree;
}

export function writeSidebarTree(state: SidebarTreeState) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeSidebarTree(state);
  const raw = JSON.stringify(normalized);
  window.localStorage.setItem(SIDEBAR_TREE_STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedTree = normalized;
  window.dispatchEvent(new Event(SIDEBAR_TREE_EVENT));
}

export function subscribeSidebarTree(onChange: () => void) {
  window.addEventListener(SIDEBAR_TREE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIDEBAR_TREE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function sidebarFavoritesStorageKey(userId?: string | null): string {
  const clean = (userId ?? "").trim();
  return clean ? `${SIDEBAR_FAVORITES_STORAGE_PREFIX}.${clean}` : SIDEBAR_FAVORITES_STORAGE_PREFIX;
}

export function normalizeSidebarFavorites(hrefs: string[]): string[] {
  return [...new Set(hrefs.map((href) => String(href ?? "").trim()).filter(Boolean))];
}

export function readSidebarFavorites(userId?: string | null): string[] {
  if (typeof window === "undefined") {
    return emptyFavorites;
  }

  const key = sidebarFavoritesStorageKey(userId);
  const raw = window.localStorage.getItem(key);
  const cached = favoritesCache.get(key);
  if (cached && cached.raw === raw) {
    return cached.list;
  }

  if (!raw) {
    favoritesCache.set(key, { raw: null, list: emptyFavorites });
    return emptyFavorites;
  }

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? normalizeSidebarFavorites(parsed.map(String)) : emptyFavorites;
    favoritesCache.set(key, { raw, list });
    return list;
  } catch {
    favoritesCache.set(key, { raw, list: emptyFavorites });
    return emptyFavorites;
  }
}

export function writeSidebarFavorites(userId: string | null | undefined, hrefs: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  const key = sidebarFavoritesStorageKey(userId);
  const normalized = normalizeSidebarFavorites(hrefs);
  const raw = JSON.stringify(normalized);
  window.localStorage.setItem(key, raw);
  favoritesCache.set(key, { raw, list: normalized });
  window.dispatchEvent(new Event(SIDEBAR_TREE_EVENT));
}

export function createEmptySidebarFavorites(): string[] {
  return emptyFavorites;
}

export function sidebarCollapsedStorageKey(userId?: string | null): string {
  const clean = (userId ?? "").trim();
  return clean ? `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}.${clean}` : SIDEBAR_COLLAPSED_STORAGE_PREFIX;
}

export function readSidebarCollapsed(userId?: string | null): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(sidebarCollapsedStorageKey(userId)) === "1";
}

export function writeSidebarCollapsed(userId: string | null | undefined, collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const key = sidebarCollapsedStorageKey(userId);
  if (collapsed) {
    window.localStorage.setItem(key, "1");
  } else {
    window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(SIDEBAR_TREE_EVENT));
}
