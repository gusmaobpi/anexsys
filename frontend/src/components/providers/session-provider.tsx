"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearPersistedWorkspaceStore } from "@/components/app-shell/workspace-storage";
import {
  branchesOfEmpresa,
  isEmpresaActiveForCombo,
  resolveActiveEmpresaId,
  type BranchOption,
  type EmpresaOption,
} from "@/components/providers/session-context";

type CompanyOption = {
  tenantId: string;
  userId: string;
  code: string;
  displayName: string;
  defaultBranchId: string | null;
};

type AuthenticatedUser = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  defaultBranchId: string | null;
  status?: string;
};

type SessionRecord = {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  permissions: string[];
  communities: string[];
  branchIds: string[];
  activeBranchId: string | null;
  user: AuthenticatedUser | null;
  branches: BranchOption[];
  companies: CompanyOption[];
  empresas: EmpresaOption[];
  activeEmpresaId: string | null;
  companySelectionRequired: boolean;
};

type SessionStatus = "loading" | "anonymous" | "company-selection" | "branch-selection" | "authenticated";

type LoginInput = {
  email: string;
  password: string;
};

type SessionContextValue = {
  status: SessionStatus;
  session: SessionRecord | null;
  errorMessage: string | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  selectCompany: (tenantId: string) => Promise<boolean>;
  selectEmpresa: (empresaId: string) => Promise<boolean>;
  selectBranch: (branchId: string) => Promise<boolean>;
  reloadEmpresas: (preferredEmpresaId?: string | null) => Promise<void>;
  clearError: () => void;
  hasAnyPermission: (...permissions: string[]) => boolean;
  apiJson: <T>(path: string, init?: RequestInit, opts?: { allowRefresh?: boolean; branchId?: string | null }) => Promise<T>;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  tenantId: string;
  branchIds: string[];
  permissions: string[];
};

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  tenantId: string;
};

type MeResponse = {
  user: AuthenticatedUser | null;
  effectiveAccess: {
    branchIds: string[];
    permissions: string[];
    communities: string[];
  };
  context: {
    tenantId: string;
    branchId: string | null;
    companySelectionRequired: boolean;
    availableCompanies: CompanyOption[];
  };
};

type BranchResponse = {
  id?: string;
  code?: string;
  displayName?: string;
  legalName?: string;
  status?: string;
  companyId?: string | null;
};

type EmpresaResponse = {
  id?: string;
  legalName?: string;
  tradeName?: string | null;
  isDefault?: boolean;
  status?: string;
};

const STORAGE_KEY = "anexsys.frontend.session.v2";
const SESSION_EXPIRED_EVENT = "anexsys:session-expired";
const API_BASE = "/backend-api";

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const SessionContext = createContext<SessionContextValue | null>(null);

export { createIdleSessionState } from "@/components/providers/session-context";

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const candidates = [
    (payload as { message?: unknown }).message,
    (payload as { detail?: unknown }).detail,
    (payload as { error?: { message?: unknown } | unknown }).error,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.join(", ");
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    if (candidate && typeof candidate === "object") {
      const nestedMessage = (candidate as { message?: unknown }).message;
      if (Array.isArray(nestedMessage)) return nestedMessage.join(", ");
      if (typeof nestedMessage === "string" && nestedMessage.length > 0) return nestedMessage;
    }
  }

  return fallback;
}

function parsePayload(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw new HttpError(response.status, getErrorMessage(payload, "Não foi possível concluir a solicitação."));
  }

  return payload as T;
}

function readStoredSession(): SessionRecord | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    return {
      ...parsed,
      empresas: parsed.empresas ?? [],
      activeEmpresaId: parsed.activeEmpresaId ?? null,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: SessionRecord | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function refreshSession(session: SessionRecord): Promise<SessionRecord> {
  const refreshed = await requestJson<RefreshResponse>("/auth/token/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  return {
    ...session,
    tenantId: refreshed.tenantId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    sessionId: refreshed.sessionId,
  };
}

function broadcastSessionExpired(message: string) {
  writeStoredSession(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }));
  }
}

const SESSION_EXPIRED_MESSAGE = "A sessão expirou. Entre de novo.";
const SESSION_RESTORE_FAILED_MESSAGE = "Não foi possível restaurar a sessão. Entre de novo.";

function resolveSessionTenantId(session: SessionRecord): string | null {
  for (const candidate of [session.tenantId, session.user?.tenantId]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const lowered = trimmed.toLowerCase();
    if (lowered === "undefined" || lowered === "null") continue;
    return trimmed;
  }
  return null;
}

function buildHeaders(session: SessionRecord, branchId?: string | null): HeadersInit {
  const tenantId = resolveSessionTenantId(session);
  return {
    authorization: ["Bearer", session.accessToken].join(" "),
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    ...(branchId ? { "x-branch-id": branchId } : {}),
  };
}

function mapBranches(input: BranchResponse[] | null, fallbackIds: string[]): BranchOption[] {
  if (!input || input.length === 0) {
    return fallbackIds.map((branchId, index) => ({
      id: branchId,
      label: `Filial ${index + 1}`,
      hint: "Disponível no seu contexto de acesso.",
    }));
  }

  return input
    .filter((branch): branch is Required<Pick<BranchResponse, "id">> & BranchResponse => typeof branch.id === "string")
    .map((branch) => ({
      id: branch.id,
      label: branch.displayName ?? branch.code ?? branch.legalName ?? branch.id,
      hint: [branch.code, branch.status].filter(Boolean).join(" · ") || undefined,
      companyId: branch.companyId ?? null,
    }));
}

function mapEmpresas(input: EmpresaResponse[] | null): EmpresaOption[] {
  if (!input) return [];
  return input
    .filter((empresa): empresa is Required<Pick<EmpresaResponse, "id" | "legalName">> & EmpresaResponse => {
      return typeof empresa.id === "string" && typeof empresa.legalName === "string" && isEmpresaActiveForCombo(empresa.status);
    })
    .map((empresa) => ({
      id: empresa.id,
      legalName: empresa.legalName,
      tradeName: empresa.tradeName ?? null,
      isDefault: Boolean(empresa.isDefault),
    }));
}

function createPendingHydrationSession(input: {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  permissions: string[];
  branchIds: string[];
  communities?: string[];
  activeBranchId?: string | null;
  user?: AuthenticatedUser | null;
  branches?: BranchOption[];
  companies?: CompanyOption[];
  empresas?: EmpresaOption[];
  activeEmpresaId?: string | null;
  companySelectionRequired?: boolean;
}): SessionRecord {
  return {
    tenantId: input.tenantId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    sessionId: input.sessionId,
    permissions: input.permissions,
    communities: input.communities ?? [],
    branchIds: input.branchIds,
    activeBranchId: input.activeBranchId ?? null,
    user: input.user ?? null,
    branches: input.branches ?? [],
    companies: input.companies ?? [],
    empresas: input.empresas ?? [],
    activeEmpresaId: input.activeEmpresaId ?? null,
    companySelectionRequired: input.companySelectionRequired ?? false,
  };
}

async function authenticatedRequest<T>(
  session: SessionRecord,
  path: string,
  init: RequestInit,
  opts: { allowRefresh?: boolean; branchId?: string | null } = {},
): Promise<{ data: T; session: SessionRecord }> {
  let workingSession = session;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...buildHeaders(workingSession, opts.branchId ?? workingSession.activeBranchId),
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const payload = parsePayload(text);

    if (response.ok) {
      return { data: payload as T, session: workingSession };
    }

    if (response.status === 401 && opts.allowRefresh !== false && attempt === 0 && workingSession.refreshToken) {
      try {
        workingSession = await refreshSession(workingSession);
      } catch {
        broadcastSessionExpired(SESSION_EXPIRED_MESSAGE);
        throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
      }
      continue;
    }

    throw new HttpError(response.status, getErrorMessage(payload, "Não foi possível concluir a solicitação autenticada."));
  }

  throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
}

function resolveActiveBranchId(
  branchIds: string[],
  branches: BranchOption[],
  user: AuthenticatedUser | null,
  currentBranchId: string | null,
  preferredBranchId: string | null,
) {
  const allowed = new Set(branchIds);
  const branchCandidates = [preferredBranchId, currentBranchId, user?.defaultBranchId ?? null].filter(
    (value): value is string => Boolean(value),
  );

  for (const branchId of branchCandidates) {
    if (allowed.has(branchId)) return branchId;
  }

  if (branchIds.length === 1) return branchIds[0];
  if (branches.length === 1 && allowed.has(branches[0].id)) return branches[0].id;
  return null;
}

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionRef = useRef<SessionRecord | null>(null);
  const restoreAttemptedRef = useRef(false);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const hydrateSession = useCallback(async (
    candidate: SessionRecord,
    preferredBranchId?: string | null,
    preferredEmpresaId?: string | null,
  ) => {
    const meResult = await authenticatedRequest<MeResponse>(candidate, "/auth/me", { method: "GET" });
    const me = meResult.data;
    let workingSession = {
      ...candidate,
      tenantId: me.context.tenantId,
      accessToken: meResult.session.accessToken,
      refreshToken: meResult.session.refreshToken,
      sessionId: meResult.session.sessionId,
      permissions: me.effectiveAccess.permissions,
      communities: me.effectiveAccess.communities,
      branchIds: me.effectiveAccess.branchIds,
      companies: me.context.availableCompanies,
      companySelectionRequired: me.context.companySelectionRequired,
      user: me.user,
    };

    let branches: BranchOption[] = [];
    try {
      const branchResult = await authenticatedRequest<BranchResponse[]>(
        workingSession,
        "/branches",
        { method: "GET" },
        { branchId: null },
      );
      workingSession = {
        ...workingSession,
        accessToken: branchResult.session.accessToken,
        refreshToken: branchResult.session.refreshToken,
        sessionId: branchResult.session.sessionId,
      };
      branches = mapBranches(branchResult.data, me.effectiveAccess.branchIds);
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) {
        throw error;
      }
      branches = mapBranches(null, me.effectiveAccess.branchIds);
    }

    let empresas: EmpresaOption[] = candidate.empresas ?? [];
    try {
      const empresaResult = await authenticatedRequest<EmpresaResponse[]>(
        workingSession,
        "/companies",
        { method: "GET" },
        { branchId: null },
      );
      workingSession = {
        ...workingSession,
        accessToken: empresaResult.session.accessToken,
        refreshToken: empresaResult.session.refreshToken,
        sessionId: empresaResult.session.sessionId,
      };
      empresas = mapEmpresas(empresaResult.data);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        throw error;
      }
    }

    const activeEmpresaId = me.context.companySelectionRequired
      ? null
      : resolveActiveEmpresaId(
          empresas,
          branches,
          preferredBranchId ?? candidate.activeBranchId,
          preferredEmpresaId ?? candidate.activeEmpresaId,
        );
    const scopedBranches = branchesOfEmpresa(branches, activeEmpresaId);

    const activeBranchId = me.context.companySelectionRequired
      ? null
      : resolveActiveBranchId(
          me.effectiveAccess.branchIds,
          scopedBranches.length > 0 ? scopedBranches : branches,
          me.user,
          me.context.branchId,
          preferredBranchId ?? candidate.activeBranchId,
        );

    const resolved = {
      ...workingSession,
      activeBranchId,
      activeEmpresaId:
        activeEmpresaId ??
        resolveActiveEmpresaId(empresas, branches, activeBranchId, preferredEmpresaId ?? candidate.activeEmpresaId),
      branches,
      empresas,
    };

    setSession(resolved);
    setStatus(
      me.context.companySelectionRequired
        ? "company-selection"
        : !activeBranchId
          ? "branch-selection"
          : "authenticated",
    );
    setErrorMessage(null);
    return resolved;
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    if (status === "loading" && !restoreAttemptedRef.current) {
      return;
    }
    writeStoredSession(session);
  }, [session, status]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSessionExpired = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { message?: string } | undefined) : undefined;
      sessionRef.current = null;
      setSession(null);
      setStatus("anonymous");
      setErrorMessage(detail?.message ?? SESSION_EXPIRED_MESSAGE);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
  }, []);

  useEffect(() => {
    const existing = readStoredSession();
    restoreAttemptedRef.current = true;
    if (!existing) {
      // First paint is always "loading" so SSR and the client match; settle after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(null);
      setStatus("anonymous");
      return;
    }

    sessionRef.current = existing;
    setSession(existing);
    hydrateSession(existing).catch((error: unknown) => {
      writeStoredSession(null);
      sessionRef.current = null;
      setSession(null);
      setStatus("anonymous");
      setErrorMessage(error instanceof Error ? error.message : SESSION_RESTORE_FAILED_MESSAGE);
    });
  }, [hydrateSession]);

  const login = useCallback(
    async ({ email, password }: LoginInput) => {
      setErrorMessage(null);
      clearPersistedWorkspaceStore();
      const loginEmail = email.trim().toLowerCase();
      try {
        const result = await requestJson<AuthResponse>("/auth/login/password", {
          method: "POST",
          body: JSON.stringify({ email: loginEmail, password }),
        });

        const baseSession = createPendingHydrationSession({
          tenantId: result.tenantId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          sessionId: result.sessionId,
          permissions: result.permissions,
          branchIds: result.branchIds,
        });

        await hydrateSession(baseSession);
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        setStatus("anonymous");
        setErrorMessage(
          /getAllAndOverride|assertAllowed|internal server error/i.test(raw)
            ? "O servidor não concluiu o login. Pare o processo da porta 3000, rode npm run start:dev outra vez e tente entrar de novo."
            : raw || "Não foi possível entrar.",
        );
      }
    },
    [hydrateSession],
  );

  const logout = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (currentSession) {
      try {
        await authenticatedRequest(currentSession, "/auth/logout", { method: "POST", body: JSON.stringify({}) }, { allowRefresh: false });
      } catch {
        // ignore logout network errors during local session clearing
      }
    }

    writeStoredSession(null);
    clearPersistedWorkspaceStore();
    sessionRef.current = null;
    setSession(null);
    setStatus("anonymous");
    setErrorMessage(null);
  }, []);

  const selectCompany = useCallback(async (tenantId: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return false;

    const result = await authenticatedRequest<AuthResponse>(
      currentSession,
      "/auth/context/company",
      { method: "POST", body: JSON.stringify({ tenantId }) },
      { branchId: null },
    );

    const baseSession = createPendingHydrationSession({
      tenantId: result.data.tenantId,
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      sessionId: result.data.sessionId,
      permissions: result.data.permissions,
      communities: currentSession.communities,
      branchIds: result.data.branchIds,
      user: currentSession.user,
      companies: currentSession.companies,
    });

    sessionRef.current = baseSession;
    setSession(baseSession);

    const resolved = await hydrateSession(baseSession);
    return resolved.companySelectionRequired === false && resolved.activeBranchId !== null;
  }, [hydrateSession]);

  const selectBranch = useCallback(async (branchId: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return false;
    const allowedBranchIds = currentSession.branchIds.length > 0
      ? currentSession.branchIds
      : currentSession.branches.map((branch) => branch.id);
    if (allowedBranchIds.length > 0 && !allowedBranchIds.includes(branchId)) {
      setErrorMessage("A filial selecionada está fora do escopo de acesso autenticado.");
      return false;
    }

    const result = await authenticatedRequest(
      currentSession,
      "/auth/context/branch",
      { method: "POST", body: JSON.stringify({ branchId }) },
      { branchId: null },
    );

    const baseSession = createPendingHydrationSession({
      tenantId: currentSession.tenantId,
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
      sessionId: result.session.sessionId,
      permissions: currentSession.permissions,
      communities: currentSession.communities,
      branchIds: currentSession.branchIds,
      activeBranchId: branchId,
      user: currentSession.user,
      branches: currentSession.branches,
      companies: currentSession.companies,
      empresas: currentSession.empresas,
      activeEmpresaId: currentSession.activeEmpresaId,
    });

    sessionRef.current = baseSession;
    setSession(baseSession);

    const nextSession = await hydrateSession(baseSession, branchId, currentSession.activeEmpresaId);
    sessionRef.current = nextSession;
    setSession(nextSession);
    setStatus("authenticated");
    setErrorMessage(null);
    return true;
  }, [hydrateSession]);

  const selectEmpresa = useCallback(async (empresaId: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return false;
    if (!currentSession.empresas.some((empresa) => empresa.id === empresaId)) {
      setErrorMessage("A Empresa selecionada está fora da Conta ativa.");
      return false;
    }

    const scoped = branchesOfEmpresa(currentSession.branches, empresaId);
    const keepCurrent = scoped.some((branch) => branch.id === currentSession.activeBranchId);
    const nextSession = {
      ...currentSession,
      activeEmpresaId: empresaId,
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    setErrorMessage(null);

    if (!keepCurrent && scoped[0]) {
      return selectBranch(scoped[0].id);
    }
    return true;
  }, [selectBranch]);

  const reloadEmpresas = useCallback(async (preferredEmpresaId?: string | null) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    try {
      const resolved = await hydrateSession(
        currentSession,
        undefined,
        preferredEmpresaId ?? currentSession.activeEmpresaId,
      );
      sessionRef.current = resolved;
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) {
        throw error;
      }
    }
  }, [hydrateSession]);

  const hasAnyPermission = useCallback(
    (...permissions: string[]) => {
      const effectivePermissions = session?.permissions ?? [];
      return permissions.length === 0 || permissions.some((permission) => effectivePermissions.includes(permission));
    },
    [session?.permissions],
  );

  const apiJson = useCallback(
    async <T,>(path: string, init: RequestInit = {}, opts: { allowRefresh?: boolean; branchId?: string | null } = {}) => {
      const currentSession = sessionRef.current;
      if (!currentSession) {
        throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
      }

      const result = await authenticatedRequest<T>(currentSession, path, { method: "GET", ...init }, opts);
      if (
        result.session.accessToken !== currentSession.accessToken ||
        result.session.refreshToken !== currentSession.refreshToken ||
        result.session.sessionId !== currentSession.sessionId ||
        result.session.tenantId !== currentSession.tenantId
      ) {
        const nextSession = {
          ...currentSession,
          accessToken: result.session.accessToken,
          refreshToken: result.session.refreshToken,
          sessionId: result.session.sessionId,
          tenantId: result.session.tenantId,
        };
        sessionRef.current = nextSession;
        setSession(nextSession);
      }

      return result.data;
    },
    [],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      errorMessage,
      login,
      logout,
      selectCompany,
      selectEmpresa,
      selectBranch,
      reloadEmpresas,
      clearError,
      hasAnyPermission,
      apiJson,
    }),
    [apiJson, clearError, errorMessage, hasAnyPermission, login, logout, reloadEmpresas, selectBranch, selectCompany, selectEmpresa, session, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider.");
  return context;
}
