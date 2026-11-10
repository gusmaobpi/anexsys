"use client";

import { useEffect, useId, useState } from "react";
import { osStatusLabel } from "@/components/service-orders/os-list";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

export type TechnicianPlanningSummary = {
  userId: string;
  displayName: string;
  profile: string | null;
  dailyRate: number;
  piecesPerDayTarget: number;
  scheduledDaysToday: number;
  parentOrdersCount: number;
  reworkOrdersCount: number;
  piecesProduced: number;
  producedValue: number;
  netPlanningResult: number;
};

export type DashboardStatusSummary = {
  status: string;
  ordersCount: number;
  piecesCount: number;
  totalValue: number;
};

export type DashboardHome = {
  leadHours: number;
  grades: Array<{ grade: number; minutes: number }>;
  produced: Array<{
    userId: string;
    displayName: string;
    pieces: number;
    orders: number;
    orderNos: string[];
    grades: number[];
    reworkOrders?: number;
    producedValue?: number;
    dailyRate?: number;
  }>;
  technicianPlanning?: TechnicianPlanningSummary[];
  statusBreakdown?: DashboardStatusSummary[];
  delays: Array<{
    id: string;
    orderNo: string;
    status: string;
    promisedAt: string;
    kind: "soon" | "late";
    difficultyGrade: number | null;
    estimatedMinutes: number | null;
  }>;
  pendingApprovals: Array<{ id: string; orderNo: string; status: string; openedAt: string }>;
};

export function useDashboardHome() {
  const { apiJson, session } = useSession();
  const branchId = session?.activeBranchId ?? "";
  const [home, setHome] = useState<DashboardHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) {
      setHome(null);
      setError("Selecione a filial para ver o painel.");
      return;
    }
    let cancelled = false;
    setError(null);
    void apiJson<DashboardHome>(`/dashboard/home?branchId=${branchId}`)
      .then((next) => {
        if (!cancelled) setHome(next);
      })
      .catch((reason) => {
        if (!cancelled) {
          setHome(null);
          setError(describeWorkspaceError(reason, "O painel não abriu."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiJson, branchId]);

  return { home, error, branchId };
}

export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function resolveAlertsSemaphore(home: DashboardHome | null): {
  level: "green" | "yellow" | "red";
  metric: string;
} {
  if (!home) {
    return { level: "green", metric: "Em dia" };
  }
  const lateCount = home.delays.filter((d) => d.kind === "late").length;
  const soonCount = home.delays.filter((d) => d.kind === "soon").length;
  const approvalsCount = home.pendingApprovals.length;
  const nowMs = Date.now();
  const staleApprovalCount = home.pendingApprovals.filter((a) => {
    const openedMs = new Date(a.openedAt).getTime();
    return Number.isFinite(openedMs) && nowMs - openedMs > 24 * 60 * 60 * 1000;
  }).length;

  if (lateCount > 0 || staleApprovalCount > 0) {
    const totalRed = lateCount + staleApprovalCount;
    return {
      level: "red",
      metric: lateCount > 0 ? `${lateCount} em atraso` : `${totalRed} crítica(s)`,
    };
  }
  if (soonCount > 0 || approvalsCount > 0) {
    const totalYellow = soonCount + approvalsCount;
    return {
      level: "yellow",
      metric: `${totalYellow} em atenção`,
    };
  }
  return { level: "green", metric: "Em dia" };
}

export function DashboardAlertsChip() {
  const { home, error } = useDashboardHome();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const semaphore = resolveAlertsSemaphore(home);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        className={`topbar-chip topbar-chip--${semaphore.level}${open ? " topbar-chip--active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title="Semáforo da Esteira de Produção e Aprovações Pendentes"
        type="button"
      >
        <span aria-hidden="true" className="topbar-chip__dot" />
        <span>Esteira & Alertas</span>
        <span className="topbar-chip__metric">{semaphore.metric}</span>
      </button>
      {open ? (
        <div aria-labelledby={titleId} aria-modal="true" className="day-board-lightbox" role="dialog">
          <button aria-label="Fechar alertas" className="day-board-lightbox__backdrop" onClick={() => setOpen(false)} type="button" />
          <section className="day-board-card">
            <div className="day-board-card__head">
              <div>
                <h2 id={titleId}>Radar da Esteira de Produção & Alertas</h2>
                <p>Verde = em dia · Amarelo = perto do prazo ou aguardando assinatura · Vermelho = atrasada.</p>
              </div>
              <button className="button-secondary" onClick={() => setOpen(false)} type="button">
                Fechar
              </button>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            {!home && !error ? <p className="field__hint">Carregando…</p> : null}
            {home ? <DashboardAlertLists home={home} /> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function DashboardAlertLists({ home }: { home: DashboardHome }) {
  return (
    <>
      <h3>Esteira de Produção (Prazos)</h3>
      {home.delays.length === 0 ? (
        <p className="field__hint">🟢 Nenhuma OS atrasada ou dentro do alerta de {home.leadHours} horas.</p>
      ) : null}
      {home.delays.length > 0 ? (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>OS</th>
                <th>Prazo</th>
                <th>Semáforo</th>
                <th>Situação</th>
                <th>Grau</th>
                <th>Estimativa</th>
              </tr>
            </thead>
            <tbody>
              {home.delays.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.orderNo}</strong></td>
                  <td>{formatWhen(row.promisedAt)}</td>
                  <td>
                    <span className={`status-chip ${row.kind === "late" ? "status-chip--blocked" : "status-chip--inactive"}`}>
                      {row.kind === "late" ? "🔴 Atrasada" : "🟡 Perto do prazo"}
                    </span>
                  </td>
                  <td>{osStatusLabel(row.status)}</td>
                  <td>{row.difficultyGrade ?? "Sem grau"}</td>
                  <td>{row.estimatedMinutes === null ? "—" : `${row.estimatedMinutes} min`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <h3 style={{ marginTop: 18 }}>Aprovação pendente</h3>
      {home.pendingApprovals.length === 0 ? (
        <p className="field__hint">🟢 Nenhuma OS desta filial está sem assinatura.</p>
      ) : null}
      {home.pendingApprovals.length > 0 ? (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>OS</th>
                <th>Aberta</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {home.pendingApprovals.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.orderNo}</strong></td>
                  <td>{formatWhen(row.openedAt)}</td>
                  <td>{osStatusLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
