"use client";

import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useWorkspaceManager } from "@/components/app-shell/workspace-manager";

export type DependencyValidationBlocker = {
  code: string;
  label: string;
  count: number;
  workspacePath: string;
};

export type DependencyValidationResult = {
  allowed: boolean;
  entityLabel: string;
  actionLabel: string;
  message: string;
  blockers: DependencyValidationBlocker[];
};

type Props = {
  validation: DependencyValidationResult;
};

export function DependencyGuardPanel({ validation }: Props) {
  const { isMobile } = useWorkspaceViewportMode();
  const { navigateWithinWorkspace, openWorkspaceInBrowserTab, openWorkspaceInNewTab } = useWorkspaceManager();

  return (
    <section className="dependency-guard-panel">
      <div className="dependency-guard-panel__header">
        <div>
          <div className="eyebrow">Validação obrigatória</div>
          <h3>
            Não foi possível {validation.actionLabel.toLowerCase()} {validation.entityLabel.toLowerCase()}.
          </h3>
          <p>{validation.message}</p>
        </div>
      </div>

      <div className="dependency-guard-panel__list">
        {validation.blockers.map((blocker) => (
          <div className="dependency-guard-panel__item" key={blocker.code}>
            <div>
              <strong>{blocker.label}</strong>
              <p>{blocker.count} registro(s) relacionado(s).</p>
            </div>
            <div className="button-row">
              <button
                className="button-secondary"
                onClick={() =>
                  isMobile
                    ? navigateWithinWorkspace(blocker.workspacePath)
                    : openWorkspaceInNewTab(blocker.workspacePath, blocker.label, { cloneCurrent: false })
                }
                type="button"
              >
                {isMobile ? "Ver registro" : "Abrir cadastro"}
              </button>
              {!isMobile ? (
                <button className="button-secondary" onClick={() => openWorkspaceInBrowserTab(blocker.workspacePath, blocker.label, { cloneCurrent: false })} type="button">
                  Abrir no navegador
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
