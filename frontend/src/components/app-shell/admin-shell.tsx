"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ActiveContextCombos } from "@/components/app-shell/active-context-combos";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { RoleAwareNav } from "@/components/app-shell/role-aware-nav";
import { TopbarChipTray, WorkspaceTabsBar } from "@/components/app-shell/workspace-manager";
import { WorkspaceKeepAlive } from "@/components/app-shell/workspace-screens";
import { useSession } from "@/components/providers/session-provider";

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const { session, logout, errorMessage, clearError } = useSession();
  const pathname = usePathname();
  const { isDesktop, isMobile } = useWorkspaceViewportMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (pathname.startsWith("/floor/")) {
    return <main className="floor-phone">{children}</main>;
  }
  const sidebarVisible = isDesktop || sidebarOpen;

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarVisible ? " sidebar--open" : ""}`}>
        <div className="sidebar__pinned">
          <div className="sidebar__brand">
            <div className="eyebrow">ANEXSYS</div>
            <h1>Administrative Portal</h1>
            <p>Fast access to your company, filial, and daily administrative work.</p>
          </div>

          <ActiveContextCombos />
        </div>

        <div className="sidebar__nav">
          <RoleAwareNav onNavigate={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {!isDesktop && sidebarVisible ? <button aria-label="Fechar menu" className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} type="button" /> : null}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar__identity">
            {!isDesktop ? (
              <button className="button-secondary topbar__menu-button" onClick={() => setSidebarOpen((current) => !current)} type="button">
                {sidebarVisible ? "Fechar menu" : "Abrir menu"}
              </button>
            ) : null}
            <div className="eyebrow">Authenticated session</div>
            <h2>{session?.user?.displayName ?? "Authenticated user"}</h2>
            <div className="topbar__meta">
              <span className="pill">
                Permissions <strong>{session?.permissions.length ?? 0}</strong>
              </span>
            </div>
          </div>

          <TopbarChipTray />

          <div className="topbar__actions">
            <button className="button-secondary" onClick={() => void logout()} type="button">
              Logout
            </button>
          </div>
        </header>

        {!isMobile ? <WorkspaceTabsBar /> : null}

        <main className="workspace__content">
          {errorMessage ? (
            <div className="error-banner">
              <strong>Session notice</strong>
              <span>{errorMessage}</span>
              <button className="button-ghost" onClick={clearError} type="button">
                Dismiss
              </button>
            </div>
          ) : null}
          <WorkspaceKeepAlive>{children}</WorkspaceKeepAlive>
        </main>
      </div>
    </div>
  );
}
