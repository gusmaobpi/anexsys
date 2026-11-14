"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActiveContextCombos } from "@/components/app-shell/active-context-combos";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { RoleAwareNav } from "@/components/app-shell/role-aware-nav";
import {
  readSidebarCollapsed,
  subscribeSidebarTree,
  writeSidebarCollapsed,
} from "@/components/app-shell/sidebar-tree";
import { TopbarChipTray, WorkspaceTabsBar } from "@/components/app-shell/workspace-manager";
import { WorkspaceKeepAlive } from "@/components/app-shell/workspace-screens";
import { empresaLabel } from "@/components/providers/session-context";
import { useSession } from "@/components/providers/session-provider";

function initialsFromLabel(value: string | null | undefined, fallback: string): string {
  const words = (value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();
}

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const { session, logout, errorMessage, clearError } = useSession();
  const pathname = usePathname();
  const { isDesktop, isMobile } = useWorkspaceViewportMode();
  const userId = session?.user?.id ?? null;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const desktopCollapsed = useSyncExternalStore(
    subscribeSidebarTree,
    () => readSidebarCollapsed(userId),
    () => false,
  );
  const [hoverPeekOpen, setHoverPeekOpen] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (pathname.startsWith("/floor/")) {
    return <main className="floor-phone">{children}</main>;
  }

  const sidebarVisible = isDesktop ? !desktopCollapsed || hoverPeekOpen : sidebarOpen;
  const activeEmpresa =
    session?.empresas.find((item) => item.id === session.activeEmpresaId) ??
    session?.empresas[0] ??
    null;
  const activeBranch =
    session?.branches.find((item) => item.id === session.activeBranchId) ??
    null;
  const companyDisplayName = activeEmpresa ? empresaLabel(activeEmpresa) : "ANEXSYS";
  const branchDisplayName = activeBranch?.label ?? "Selecione a filial";
  const companyLogoUrl =
    activeEmpresa?.logoMimeType && activeEmpresa?.logoBase64
      ? `data:${activeEmpresa.logoMimeType};base64,${activeEmpresa.logoBase64}`
      : null;

  const userDisplayName = session?.user?.displayName ?? "Usuário autenticado";
  const userPortraitUrl =
    session?.user?.portraitMimeType && session?.user?.portraitBase64
      ? `data:${session.user.portraitMimeType};base64,${session.user.portraitBase64}`
      : null;

  function clearPeekTimers() {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleEdgeEnter() {
    if (!isDesktop || !desktopCollapsed) return;
    clearPeekTimers();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setHoverPeekOpen(true);
    }, 110);
  }

  function handleSidebarMouseEnter() {
    if (!isDesktop || !desktopCollapsed) return;
    clearPeekTimers();
    setHoverPeekOpen(true);
  }

  function handleSidebarMouseLeave() {
    if (!isDesktop || !desktopCollapsed) return;
    clearPeekTimers();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setHoverPeekOpen(false);
    }, 180);
  }

  function handleToggleSidebar() {
    if (isDesktop) {
      clearPeekTimers();
      setHoverPeekOpen(false);
      writeSidebarCollapsed(userId, !desktopCollapsed);
    } else {
      setSidebarOpen((current) => !current);
    }
  }

  return (
    <div
      className={`app-shell${isDesktop && desktopCollapsed ? " app-shell--sidebar-collapsed" : ""}${
        isDesktop && desktopCollapsed && hoverPeekOpen ? " app-shell--sidebar-peek" : ""
      }`}
    >
      {isDesktop && desktopCollapsed ? (
        <div
          aria-hidden="true"
          className="sidebar-hover-edge"
          onMouseEnter={handleEdgeEnter}
          onMouseLeave={() => {
            if (openTimerRef.current !== null) {
              window.clearTimeout(openTimerRef.current);
              openTimerRef.current = null;
            }
          }}
        />
      ) : null}

      <aside
        className={`sidebar${sidebarVisible ? " sidebar--open" : ""}`}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <div className="sidebar__pinned">
          <div className="sidebar__brand">
            <div className="topbar__brand-badge">
              <div className="topbar__brand-logo" aria-hidden="true">
                {companyLogoUrl ? (
                  <img alt={companyDisplayName} src={companyLogoUrl} />
                ) : (
                  initialsFromLabel(companyDisplayName, "AX")
                )}
              </div>
              <div className="topbar__brand-copy">
                <strong>{companyDisplayName}</strong>
                <span>{branchDisplayName}</span>
              </div>
            </div>
          </div>

          <ActiveContextCombos />
        </div>

        <div className="sidebar__nav">
          <RoleAwareNav
            onNavigate={() => {
              setSidebarOpen(false);
              setHoverPeekOpen(false);
            }}
          />
        </div>
      </aside>

      {!isDesktop && sidebarVisible ? (
        <button
          aria-label="Fechar menu"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar__identity">
            <button
              aria-label={sidebarVisible ? "Recolher menu lateral" : "Expandir menu lateral"}
              className="topbar__sidebar-toggle"
              onClick={handleToggleSidebar}
              title={sidebarVisible ? "Recolher menu lateral" : "Expandir menu lateral"}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>

            <div className="topbar__brand-badge">
              <div className="topbar__brand-logo" aria-hidden="true">
                {companyLogoUrl ? (
                  <img alt={companyDisplayName} src={companyLogoUrl} />
                ) : (
                  initialsFromLabel(companyDisplayName, "AX")
                )}
              </div>
              <div className="topbar__brand-copy">
                <strong>{companyDisplayName}</strong>
                <span>{branchDisplayName}</span>
              </div>
            </div>
          </div>

          <TopbarChipTray />

          <div className="topbar__actions">
            <Link
              className="topbar-chip"
              href="/credenciamento"
              title="Abrir página pública de Credenciamento de novas Contas SaaS"
            >
              Credenciamento
            </Link>

            <div className="topbar__user-profile" title={session?.user?.email ?? userDisplayName}>
              <div className="topbar__user-avatar" aria-hidden="true">
                {userPortraitUrl ? (
                  <img alt={userDisplayName} src={userPortraitUrl} />
                ) : (
                  initialsFromLabel(userDisplayName, "US")
                )}
              </div>
              <div className="topbar__user-info">
                <strong>{userDisplayName}</strong>
                <span>{`${session?.permissions.length ?? 0} permissões`}</span>
              </div>
            </div>

            <button className="button-secondary" onClick={() => void logout()} type="button">
              Sair
            </button>
          </div>
        </header>

        {!isMobile ? <WorkspaceTabsBar /> : null}

        <main className="workspace__content">
          {errorMessage ? (
            <div className="error-banner">
              <strong>Aviso da sessão</strong>
              <span>{errorMessage}</span>
              <button className="button-ghost" onClick={clearError} type="button">
                Fechar
              </button>
            </div>
          ) : null}
          <WorkspaceKeepAlive>{children}</WorkspaceKeepAlive>
        </main>
      </div>
    </div>
  );
}
