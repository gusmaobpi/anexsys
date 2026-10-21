"use client";

import { useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { DashboardAlertLists, useDashboardHome } from "@/components/app-shell/dashboard-alerts";
import { useSession } from "@/components/providers/session-provider";

export function DashboardWorkspace() {
  useWorkspaceRegistration({ label: "Dashboard" });
  const { session } = useSession();
  const { home, error } = useDashboardHome();
  const branchName = session?.branches.find((branch) => branch.id === session.activeBranchId)?.label ?? "Filial";

  return (
    <>
      <section className="hero-card">
        <div className="eyebrow">Produção de hoje</div>
        <h1 className="title">{branchName}</h1>
        <p>Quem terminou sacola hoje, o que está perto do prazo e o que ainda não tem assinatura do cliente.</p>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {!home && !error ? <p className="field__hint">Carregando…</p> : null}
      {home ? (
        <section className="card-grid">
          <article className="mini-card">
            <h3>Tempos por grau</h3>
            <ul className="placeholder-list">
              {home.grades.map((grade) => (
                <li key={grade.grade}>
                  Grau {grade.grade}: {grade.minutes} min
                </li>
              ))}
            </ul>
            <p className="field__hint">Estes minutos vêm da Conta e estimam a OS pelo grau. O bônus por produtividade ainda não tem regra de cálculo.</p>
          </article>
          <article className="mini-card">
            <h3>Quem produziu</h3>
            {home.produced.length === 0 ? <p className="field__hint">Ninguém clicou Terminei hoje nesta filial.</p> : null}
            {home.produced.length > 0 ? (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Peças</th>
                      <th>OS</th>
                      <th>Graus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {home.produced.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.displayName}</td>
                        <td>{row.pieces}</td>
                        <td>{row.orderNos.join(", ")}</td>
                        <td>{row.grades.length === 0 ? "Sem grau" : row.grades.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>
          <article className="mini-card">
            <DashboardAlertLists home={home} />
          </article>
        </section>
      ) : null}
    </>
  );
}
