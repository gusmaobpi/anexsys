"use client";

import { useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { DashboardAlertLists, useDashboardHome } from "@/components/app-shell/dashboard-alerts";
import { osStatusLabel } from "@/components/service-orders/os-list";
import { formatOsMoney } from "@/components/service-orders/service-order-workspace-view-model";
import { useSession } from "@/components/providers/session-provider";

function formatSignedBrl(amount: number): string {
  const prefix = amount < 0 ? "-R$ " : "R$ ";
  return `${prefix}${formatOsMoney(Math.abs(amount))}`;
}

export function DashboardWorkspace() {
  useWorkspaceRegistration({ label: "Dashboard" });
  const { session } = useSession();
  const { home, error } = useDashboardHome();
  const branchName = session?.branches.find((branch) => branch.id === session.activeBranchId)?.label ?? "Filial";

  const statusBreakdown = home?.statusBreakdown ?? [];
  const techPlanning = home?.technicianPlanning ?? [];
  const totalOrdersBranch = statusBreakdown.reduce((sum, s) => sum + s.ordersCount, 0);
  const totalPiecesBranch = statusBreakdown.reduce((sum, s) => sum + s.piecesCount, 0);
  const totalValueBranch = statusBreakdown.reduce((sum, s) => sum + s.totalValue, 0);

  return (
    <>
      <section className="hero-card">
        <div className="eyebrow">Painel Operacional & Resultado do Planejamento</div>
        <h1 className="title">{branchName}</h1>
        <p>
          Resumo de OS, peças e valores por status, resultado financeiro produzido por cada técnico versus diária planejada e radar de prazos da esteira.
        </p>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {!home && !error ? <p className="field__hint">Carregando…</p> : null}

      {home ? (
        <div className="workspace-stack">
          {/* 1. RESUMO POR STATUS DA FILIAL */}
          {statusBreakdown.length > 0 ? (
            <article className="mini-card">
              <h3>Resumo de Ordens de Serviço por Status ({branchName})</h3>
              <p className="table-subtle" style={{ marginBottom: 12 }}>
                Quantidade de OS, quantidade de peças e valor financeiro em cada etapa ativa da filial.
              </p>
              <div className="grid-status-strip" style={{ marginBottom: 14 }}>
                <div className="grid-status-card grid-status-card--active">
                  <span className="grid-status-card__title">Total Ativo na Filial</span>
                  <span className="grid-status-card__value">{`R$ ${formatOsMoney(totalValueBranch)}`}</span>
                  <span className="grid-status-card__meta">{`${totalOrdersBranch} OS · ${totalPiecesBranch} peças`}</span>
                </div>
                {statusBreakdown.map((item) => (
                  <div className="grid-status-card" key={item.status}>
                    <span className="grid-status-card__title">{osStatusLabel(item.status)}</span>
                    <span className="grid-status-card__value">{`R$ ${formatOsMoney(item.totalValue)}`}</span>
                    <span className="grid-status-card__meta">
                      {`${item.ordersCount} OS · ${item.piecesCount} ${item.piecesCount === 1 ? "peça" : "peças"}`}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {/* 2. RESULTADO DO PLANEJAMENTO POR TÉCNICO (OS MÃE vs FILHA/REFAÇÃO × PEÇAS × VALOR FINANCEIRO vs DIÁRIA) */}
          <article className="mini-card">
            <h3>Resultado do Planejamento por Técnico (Hoje)</h3>
            <p className="table-subtle" style={{ marginBottom: 12 }}>
              Cruza quantas OS normais (mãe) e OS filhas (refação/reconserto) cada técnico concluiu hoje com a meta de peças e o valor financeiro produzido frente à diária planejada.
            </p>
            {techPlanning.length === 0 && home.produced.length === 0 ? (
              <p className="field__hint">Nenhum técnico cadastrado ou com produção finalizada hoje nesta filial.</p>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Técnico / Colaborador</th>
                      <th>OS Finalizadas (Mãe)</th>
                      <th>OS Filha (Refação / Reconserto)</th>
                      <th>Peças (Real × Meta/dia)</th>
                      <th>Diária Planejada</th>
                      <th>Valor Produzido (OS)</th>
                      <th>Resultado Líquido</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techPlanning.map((row) => {
                      const statusTone =
                        row.producedValue >= row.dailyRate * 1.2 && row.producedValue > 0
                          ? "active"
                          : row.producedValue >= row.dailyRate && row.dailyRate > 0
                            ? "inactive"
                            : row.parentOrdersCount === 0 && row.scheduledDaysToday === 0
                              ? "inactive"
                              : "blocked";
                      return (
                        <tr key={row.userId}>
                          <td>
                            <strong>{row.displayName}</strong>
                            <div className="table-subtle">
                              {row.scheduledDaysToday > 0 ? "Escalado hoje" : "Fora da escala de hoje"}
                            </div>
                          </td>
                          <td>
                            <strong>{`${row.parentOrdersCount} OS`}</strong>
                          </td>
                          <td>
                            {row.reworkOrdersCount > 0 ? (
                              <span className="status-chip status-chip--blocked">{`${row.reworkOrdersCount} refação`}</span>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td>
                            <strong>{`${row.piecesProduced} pç`}</strong>
                            {row.piecesPerDayTarget > 0 ? (
                              <span className="table-subtle">{` / meta ${row.piecesPerDayTarget} pç`}</span>
                            ) : null}
                          </td>
                          <td>{`R$ ${formatOsMoney(row.dailyRate)}`}</td>
                          <td>
                            <strong>{`R$ ${formatOsMoney(row.producedValue)}`}</strong>
                          </td>
                          <td>
                            <strong
                              style={{
                                color: row.netPlanningResult >= 0 ? "var(--success)" : "var(--danger)",
                              }}
                            >
                              {formatSignedBrl(row.netPlanningResult)}
                            </strong>
                          </td>
                          <td>
                            <span className={`status-chip status-chip--${statusTone}`}>
                              {row.producedValue >= row.dailyRate && row.producedValue > 0
                                ? "🟢 Meta atingida"
                                : row.parentOrdersCount === 0 && row.scheduledDaysToday === 0
                                  ? "Sem turno hoje"
                                  : "🟡 Em andamento"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {/* 3. QUEM PRODUZIU HOJE + RADAR DA ESTEIRA E TEMPOS POR GRAU */}
          <section className="card-grid">
            <article className="mini-card">
              <h3>Quem produziu hoje (Detalhe por OS e Grau)</h3>
              {home.produced.length === 0 ? (
                <p className="field__hint">Ninguém clicou Terminei hoje nesta filial.</p>
              ) : (
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
                          <td><strong>{row.displayName}</strong></td>
                          <td>{row.pieces}</td>
                          <td>{row.orderNos.join(", ")}</td>
                          <td>{row.grades.length === 0 ? "Sem grau" : row.grades.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="mini-card">
              <DashboardAlertLists home={home} />
            </article>

            <article className="mini-card">
              <h3>Tempos estimados por grau</h3>
              <ul className="placeholder-list">
                {home.grades.map((grade) => (
                  <li key={grade.grade}>
                    <strong>Grau {grade.grade}:</strong> {grade.minutes} min
                  </li>
                ))}
              </ul>
              <p className="field__hint" style={{ marginTop: 10 }}>
                Estes minutos vêm da Conta e estimam a carga da esteira pelo grau da OS.
              </p>
            </article>
          </section>
        </div>
      ) : null}
    </>
  );
}
