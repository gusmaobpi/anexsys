"use client";

import { usePathname } from "next/navigation";
import { useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { getWorkspaceBasePath } from "@/components/app-shell/workspace-manager-store";
import { useWorkspacePane } from "@/components/app-shell/workspace-pane";
import { downloadMigrationWorkbook } from "@/components/integration/excel-workbook";
import { IntegrationHistoryWorkspace } from "@/components/integration/integration-history-workspace";
import { findIntegrationLayout } from "@/components/integration/migration-layouts";
import { useSession } from "@/components/providers/session-provider";

export function IntegrationLayoutWorkspace() {
  const pane = useWorkspacePane();
  const browserPath = usePathname();
  const pathname = getWorkspaceBasePath(pane?.pathname ?? browserPath ?? "/integration");
  const layout = findIntegrationLayout(pathname);
  const { hasAnyPermission } = useSession();
  const canOpen = hasAnyPermission("users.write");

  if (!canOpen) {
    return (
      <section className="workspace-stack">
        <article className="mini-card cadastro-form">
          <h3>Integração</h3>
          <p>Os layouts de migração ficam com quem administra os usuários.</p>
        </article>
      </section>
    );
  }

  if (!layout) {
    return <IntegrationHistoryWorkspace />;
  }

  return <IntegrationLayoutDetail layout={layout} />;
}

function IntegrationLayoutDetail({ layout }: Readonly<{ layout: NonNullable<ReturnType<typeof findIntegrationLayout>> }>) {
  useWorkspaceRegistration({
    label: layout.menuLabel,
    subtitle: "Layout de migração",
  });

  return (
    <section className="workspace-stack">
      <div className="workspace-toolbar">
        <div className="workspace-toolbar__copy">
          <h3>{layout.title}</h3>
          <p>{layout.summary}</p>
        </div>
        <button className="button" onClick={() => downloadMigrationWorkbook(layout)} type="button">
          Baixar layout Excel
        </button>
      </div>
      <article className="mini-card">
        <p className="table-subtle">
          A aba Layout do Excel traz o cabeçalho e a linha cinza de exemplo. Apague o exemplo e preencha uma linha por
          registro. A aba Instruções repete esta tabela.
        </p>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Coluna</th>
                <th>Obrigatório</th>
                <th>Exemplo</th>
                <th>Como preencher</th>
              </tr>
            </thead>
            <tbody>
              {layout.columns.map((column) => (
                <tr key={column.header}>
                  <td>{column.header}</td>
                  <td>{column.required}</td>
                  <td>{column.example || "—"}</td>
                  <td>{column.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
