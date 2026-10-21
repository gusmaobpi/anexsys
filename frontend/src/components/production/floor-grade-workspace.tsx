"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyCadastroChanged, useCadastroListRefresh } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { balanceProduction } from "@/components/production/floor-balance";
import {
  applyFloorGradeFilters,
  buildFloorGradeExcelCsv,
  gradeCollaboratorLines,
  gradeCollaboratorText,
  gradePeriodLabel,
  type GradePeriod,
} from "@/components/production/floor-grade-list";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { describeWorkspaceError, WorkspaceFlash, type FlashTone } from "@/components/ui/workspace-flash";

type Technician = {
  id: string;
  userId: string;
  status: string;
  displayName: string;
  profile: string | null;
  dailyRate: number;
  piecesPerDay: number;
};
type CheckinCode = { purpose: "production" | "quality"; codeValue: string };
type OutlookDay = { workDate: string; orderValue: number; pieces: number };
type GradeDraft = {
  periodId: string | null;
  from: string;
  to: string;
  marks: Record<string, string[]>;
  includedIds: string[];
};

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function eachDate(from: string, to: string) {
  if (!from || !to || to < from) {
    return [];
  }
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function weekdayLabel(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function emptyDraft(): GradeDraft {
  const today = isoDate(new Date());
  return { periodId: null, from: today, to: today, marks: {}, includedIds: [] };
}

function periodErrorOf(from: string, to: string) {
  if (!from || !to || to < from) {
    return "A data fim precisa ser igual ou posterior à data início.";
  }
  const count = eachDate(from, to).length;
  if (count > 31) {
    return "O período da grade vai até um mês.";
  }
  return null;
}

function periodToDraft(period: GradePeriod): GradeDraft {
  const marks: Record<string, string[]> = {};
  for (const day of period.days) {
    for (const person of day.collaborators) {
      marks[person.technicianId] = [...(marks[person.technicianId] ?? []), day.workDate.slice(0, 10)];
    }
  }
  return {
    periodId: period.id,
    from: period.from.slice(0, 10),
    to: period.to.slice(0, 10),
    marks,
    includedIds: Object.keys(marks),
  };
}

export function FloorGradeWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const pane = useWorkspacePane();
  const { isMobile } = useWorkspaceViewportMode();
  const { apiJson, session, hasAnyPermission } = useSession();
  const { closeWorkspace } = useWorkspaceManager();
  const branchId = session?.activeBranchId ?? "";
  const canWrite = hasAnyPermission("floor_schedule.write");
  const workspaceMode = searchParams.get("workspaceMode");
  const focusPeriodId = searchParams.get("focusPeriodId");
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusPeriodId);
  const isListWorkspace = !isFormWorkspace;
  const [periods, setPeriods] = useState<GradePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ message: string; tone: FlashTone } | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [outlook, setOutlook] = useState<Record<string, OutlookDay>>({});
  const [pickId, setPickId] = useState("");
  const [draft, setDraft, hydrated] = useWorkspaceScopedState<GradeDraft>("floor-grade.draft", emptyDraft());
  const [formReady, setFormReady] = useState(false);
  const fetchedId = useRef<string | null>(null);
  const periodError = periodErrorOf(draft.from, draft.to);
  const dates = useMemo(() => (periodError ? [] : eachDate(draft.from, draft.to)), [draft.from, draft.to, periodError]);
  const activeTechnicians = technicians.filter((person) => person.status === "active" && person.profile === "tecnico");
  const visibleTechnicians = activeTechnicians.filter((person) => draft.includedIds.includes(person.id));
  const availableTechnicians = activeTechnicians.filter((person) => !draft.includedIds.includes(person.id));
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: isFormWorkspace ? (workspaceMode === "new" ? "Nova grade" : "Alterar grade") : "Grade de planejamento",
    subtitle: isFormWorkspace ? gradePeriodLabel(draft) : null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const returnToList = useCallback(() => {
    notifyCadastroChanged("/floor-schedule");
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/floor-schedule");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/floor-schedule", "Grade de planejamento", { cloneCurrent: false });
    window.setTimeout(() => closeWorkspace(closingTabId), 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openCreateWorkspace = useCallback(() => {
    const targetPath = "/floor-schedule?workspaceMode=new";
    if (isMobile) {
      navigateWithinWorkspace(targetPath);
      return;
    }
    openWorkspaceInNewTab(targetPath, "Nova grade", { cloneCurrent: false, subtitle: "Grade de planejamento" });
  }, [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openEditWorkspace = useCallback(
    (period: GradePeriod) => {
      const targetPath = `/floor-schedule?focusPeriodId=${encodeURIComponent(period.id)}`;
      const label = gradePeriodLabel(period);
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, label, { cloneCurrent: false, subtitle: "Alterar grade" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const loadPeriods = useCallback(async () => {
    if (!canWrite || !branchId) {
      setPeriods([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await apiJson<GradePeriod[]>(`/floor-schedule/periods?branchId=${branchId}`);
      setPeriods(Array.isArray(records) ? records : []);
    } catch (reason) {
      setPeriods([]);
      setFlash({ message: describeWorkspaceError(reason, "A grade não abriu."), tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [apiJson, branchId, canWrite]);

  useEffect(() => {
    if (!isListWorkspace || !isActivePane) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadPeriods();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isActivePane, isListWorkspace, loadPeriods]);

  useCadastroListRefresh("/floor-schedule", isListWorkspace && isActivePane, loadPeriods);

  useEffect(() => {
    if (!isFormWorkspace || !hydrated || !isActivePane) {
      return;
    }
    if (workspaceMode === "new") {
      setFormReady(true);
      return;
    }
    if (!focusPeriodId || !branchId) {
      return;
    }
    if (draft.periodId === focusPeriodId || fetchedId.current === focusPeriodId) {
      setFormReady(true);
      return;
    }
    let cancelled = false;
    setFormReady(false);
    void apiJson<GradePeriod>(`/floor-schedule/periods/${focusPeriodId}?branchId=${branchId}`)
      .then((period) => {
        if (cancelled) {
          return;
        }
        fetchedId.current = focusPeriodId;
        setDraft(periodToDraft(period));
        setFormReady(true);
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }
        setFlash({ message: describeWorkspaceError(reason, "A grade não abriu."), tone: "error" });
        setFormReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, draft.periodId, focusPeriodId, hydrated, isActivePane, isFormWorkspace, setDraft, workspaceMode]);

  useEffect(() => {
    if (!isFormWorkspace || !isActivePane) {
      return;
    }
    const refreshPeople = () => {
      void apiJson<Technician[]>("/floor-schedule/technicians")
        .then(setTechnicians)
        .catch((reason) => setFlash({ message: describeWorkspaceError(reason, "A grade não abriu."), tone: "error" }));
    };
    refreshPeople();
    window.addEventListener("anexsys:collaborators-changed", refreshPeople);
    return () => window.removeEventListener("anexsys:collaborators-changed", refreshPeople);
  }, [apiJson, isActivePane, isFormWorkspace]);

  useEffect(() => {
    if (!isFormWorkspace || !isActivePane || !formReady || !branchId || periodError) {
      return;
    }
    let cancelled = false;
    void apiJson<{ days: OutlookDay[] }>(`/floor-schedule/outlook?branchId=${branchId}&from=${draft.from}&to=${draft.to}`)
      .then((forecast) => {
        if (cancelled) {
          return;
        }
        const byDay: Record<string, OutlookDay> = {};
        for (const day of forecast.days) {
          byDay[day.workDate.slice(0, 10)] = { ...day, workDate: day.workDate.slice(0, 10) };
        }
        setOutlook(byDay);
      })
      .catch((reason) => {
        if (!cancelled) {
          setFlash({ message: describeWorkspaceError(reason, "A previsão não abriu."), tone: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiJson, branchId, draft.from, draft.to, formReady, isActivePane, isFormWorkspace, periodError]);

  function changeRange(next: { from?: string; to?: string }) {
    setDraft((current) => {
      const from = next.from ?? current.from;
      const to = next.to ?? current.to;
      if (to < from) {
        return { ...current, from, to };
      }
      const allowed = new Set(eachDate(from, to));
      const marks: Record<string, string[]> = {};
      for (const [id, marked] of Object.entries(current.marks)) {
        const kept = marked.filter((date) => allowed.has(date));
        if (kept.length > 0) {
          marks[id] = kept;
        }
      }
      return { ...current, from, to, marks };
    });
  }

  function includeTechnician() {
    if (!pickId) {
      return;
    }
    setDraft((current) => ({
      ...current,
      includedIds: current.includedIds.includes(pickId) ? current.includedIds : [...current.includedIds, pickId],
    }));
    setPickId("");
  }

  function toggle(technicianId: string, date: string) {
    setDraft((current) => {
      const datesForPerson = new Set(current.marks[technicianId] ?? []);
      if (datesForPerson.has(date)) {
        datesForPerson.delete(date);
      } else {
        datesForPerson.add(date);
      }
      return { ...current, marks: { ...current.marks, [technicianId]: [...datesForPerson] } };
    });
  }

  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!branchId || periodError || !formReady) {
      return;
    }
    setSaving(true);
    setFlash(null);
    try {
      await apiJson("/floor-schedule/periods", {
        method: "PUT",
        body: JSON.stringify({
          id: workspaceMode === "new" ? undefined : draft.periodId ?? focusPeriodId ?? undefined,
          branchId,
          from: draft.from,
          to: draft.to,
          marks: visibleTechnicians
            .map((person) => ({
              technicianId: person.id,
              dates: (draft.marks[person.id] ?? []).filter((date) => dates.includes(date)),
            }))
            .filter((mark) => mark.dates.length > 0),
        }),
      });
      returnToList();
    } catch (reason) {
      setFlash({ message: describeWorkspaceError(reason, "A escala não foi gravada."), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function removePeriod(period: GradePeriod) {
    const label = gradePeriodLabel(period);
    if (!window.confirm(`Excluir a grade de ${label}? Os dias saem da escala.`)) {
      return;
    }
    setFlash(null);
    try {
      await apiJson(`/floor-schedule/periods/${period.id}?branchId=${branchId}`, { method: "DELETE" });
      setPeriods((current) => current.filter((item) => item.id !== period.id));
      setFlash({ message: "Grade excluída.", tone: "ok" });
    } catch (reason) {
      setFlash({ message: describeWorkspaceError(reason, "A grade não pôde ser excluída."), tone: "error" });
    }
  }

  async function removePeriods(selected: GradePeriod[]) {
    if (selected.length === 0) {
      return;
    }
    if (!window.confirm(`Excluir ${selected.length} grade(s)? Os dias saem da escala.`)) {
      return;
    }
    setFlash(null);
    try {
      for (const period of selected) {
        await apiJson(`/floor-schedule/periods/${period.id}?branchId=${branchId}`, { method: "DELETE" });
      }
      const removed = new Set(selected.map((period) => period.id));
      setPeriods((current) => current.filter((item) => !removed.has(item.id)));
      setFlash({ message: "Grades excluídas.", tone: "ok" });
    } catch (reason) {
      setFlash({ message: describeWorkspaceError(reason, "A grade não pôde ser excluída."), tone: "error" });
      void loadPeriods();
    }
  }

  async function printSheet(purpose: "production" | "quality") {
    setFlash(null);
    try {
      const codes = await apiJson<CheckinCode[]>(`/floor-schedule/checkin-codes?branchId=${branchId}`);
      const code = codes.find((item) => item.purpose === purpose);
      if (!code) {
        return;
      }
      const branchName = session?.branches.find((branch) => branch.id === branchId)?.label ?? "Filial";
      const url = `${window.location.origin}/floor/${code.codeValue}`;
      const title = purpose === "production" ? "Check-in da produção" : "Check-in da qualidade";
      const instruction = purpose === "production" ? "Leia para informar seu nome" : "Leia para revisar";
      const popup = window.open("", "_blank", "width=900,height=1100");
      if (!popup) {
        setFlash({ message: "O navegador bloqueou a impressão.", tone: "error" });
        return;
      }
      popup.document.write(`<!doctype html><html><head><title>${title}</title>
        <style>
          @page { size: A5; margin: 12mm; }
          body { font-family: Arial, sans-serif; text-align: center; color: #162033; }
          h1 { font-size: 28px; margin-bottom: 8px; }
          p { font-size: 18px; }
          img { width: 78mm; height: 78mm; }
        </style></head><body>
        <p>ANEXSYS</p>
        <h1>${title}</h1>
        <p>${instruction}</p>
        <img alt="${title}" src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(url)}" />
        <p>${branchName}</p>
      </body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (reason) {
      setFlash({ message: describeWorkspaceError(reason, "O QR não foi impresso."), tone: "error" });
    }
  }

  const searchOptions = useMemo(
    () => periods.map((period) => ({ id: period.id, label: gradePeriodLabel(period), hint: gradeCollaboratorText(period) })),
    [periods],
  );
  const costByDay = dates.map((date) =>
    visibleTechnicians.reduce((sum, person) => sum + ((draft.marks[person.id] ?? []).includes(date) ? person.dailyRate : 0), 0),
  );
  const orderByDay = dates.map((date) => outlook[date]?.orderValue ?? 0);
  const dueByDay = dates.map((date) => outlook[date]?.pieces ?? 0);
  const capacityByDay = dates.map((date) =>
    visibleTechnicians.reduce((sum, person) => sum + ((draft.marks[person.id] ?? []).includes(date) ? person.piecesPerDay : 0), 0),
  );
  const produceByDay = balanceProduction(dueByDay, capacityByDay);

  if (!canWrite) {
    return (
      <section className="mini-card">
        <h3>Grade de planejamento</h3>
        <p>Você não possui acesso à grade no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {isFormWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Operações</div>
          <h1 className="title">{workspaceMode === "new" ? "Nova grade" : "Alterar grade"}</h1>
          <p>O período é a chave da grade. Marque os colaboradores em cada dia e grave para voltar à lista.</p>
        </section>
      ) : null}

      {flash ? <WorkspaceFlash message={flash.message} tone={flash.tone} /> : null}

      {isListWorkspace ? (
        <>
          {!branchId ? <p className="error-text">Selecione a filial para ver a grade.</p> : null}
          <CadastroListPanel
            applyFilters={applyFloorGradeFilters}
            buildExcelCsv={buildFloorGradeExcelCsv}
            canWrite={canWrite && Boolean(branchId)}
            columnStorageKey="anexsys.frontend.floor-grade.grid-columns.v1"
            columns={[
              {
                id: "period",
                label: "Período",
                locked: true,
                render: (row) => <strong>{gradePeriodLabel(row)}</strong>,
              },
              {
                id: "collaborators",
                label: "Colaboradores",
                render: (row) =>
                  gradeCollaboratorLines(row).length === 0 ? (
                    "Nenhum colaborador marcado."
                  ) : (
                    <div>
                      {gradeCollaboratorLines(row).map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  ),
              },
            ]}
            defaultColumnIds={["period", "collaborators"]}
            emptyFilters={{ q: "", collaborator: "" }}
            emptyMessage="Nenhuma grade gravada."
            excelFileName="grade-de-planejamento.csv"
            filterFields={[{ id: "collaborator", label: "Colaborador", placeholder: "Nome do técnico" }]}
            loading={loading}
            onCreate={() => openCreateWorkspace()}
            onDelete={(row) => void removePeriod(row)}
            onDeleteMany={(rows) => void removePeriods(rows)}
            onEdit={openEditWorkspace}
            records={periods}
            rowLabel={gradePeriodLabel}
            searchKey="q"
            searchOptions={searchOptions}
            searchPlaceholder="19/10/2026 ou nome"
            title="Grade de planejamento"
          />
          <section className="mini-card">
            <div className="button-row">
              <button className="button-secondary" disabled={!branchId} onClick={() => void printSheet("production")} type="button">
                Imprimir check-in da produção
              </button>
              <button className="button-secondary" disabled={!branchId} onClick={() => void printSheet("quality")} type="button">
                Imprimir check-in da qualidade
              </button>
            </div>
          </section>
        </>
      ) : (
        <section className="mini-card">
          <form onSubmit={(event) => void save(event)}>
            <div className="button-row">
              <label className="field floor-until">
                Data início
                <input
                  className="input"
                  onChange={(event) => changeRange({ from: event.target.value })}
                  required
                  type="date"
                  value={draft.from}
                />
              </label>
              <label className="field floor-until">
                Data fim
                <input
                  className="input"
                  onChange={(event) => changeRange({ to: event.target.value })}
                  required
                  type="date"
                  value={draft.to}
                />
              </label>
            </div>
            {periodError ? <p className="error-text">{periodError}</p> : null}
            <div className="button-row">
              <select className="input" onChange={(event) => setPickId(event.target.value)} value={pickId}>
                <option value="">Incluir técnico</option>
                {availableTechnicians.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
              <button className="button-secondary" disabled={!pickId || !formReady} onClick={includeTechnician} type="button">
                Incluir
              </button>
            </div>
            {periodError ? null : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Técnico</th>
                      {dates.map((date) => (
                        <th key={date}>{weekdayLabel(date)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTechnicians.length === 0 ? (
                      <tr>
                        <td colSpan={dates.length + 1}>Inclua um técnico para montar a grade.</td>
                      </tr>
                    ) : null}
                    {visibleTechnicians.map((person) => (
                      <tr key={person.id}>
                        <td>
                          {person.displayName}
                          <span className="field__hint">
                            {" "}
                            {money(person.dailyRate)} · {person.piecesPerDay} peças/dia
                          </span>
                        </td>
                        {dates.map((date) => {
                          const marked = (draft.marks[person.id] ?? []).includes(date);
                          return (
                            <td key={date}>
                              <button
                                aria-pressed={marked}
                                className={`floor-day${marked ? " button" : " button-secondary"}`}
                                onClick={() => toggle(person.id, date)}
                                type="button"
                              >
                                {marked ? money(person.dailyRate) : "Não"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="floor-band">
                      <td colSpan={dates.length + 1}>Resultado financeiro</td>
                    </tr>
                    <tr>
                      <td>Custo da diária</td>
                      {costByDay.map((value, index) => (
                        <td key={dates[index]}>{money(value)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Valor da OS</td>
                      {orderByDay.map((value, index) => (
                        <td key={dates[index]}>{money(value)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Resultado</td>
                      {dates.map((date, index) => {
                        const result = orderByDay[index] - costByDay[index];
                        return (
                          <td className={result < 0 ? "floor-negative" : undefined} key={date}>
                            {money(result)}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="floor-band">
                      <td colSpan={dates.length + 1}>Esteira de produtividade</td>
                    </tr>
                    <tr>
                      <td>Capacidade</td>
                      {capacityByDay.map((value, index) => (
                        <td key={dates[index]}>{value}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Peças na previsão</td>
                      {dueByDay.map((value, index) => (
                        <td key={dates[index]}>{value}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>A produzir</td>
                      {produceByDay.map((value, index) => (
                        <td key={dates[index]}>{value}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <div className="button-row">
              <button className="button" disabled={saving || !branchId || Boolean(periodError) || !formReady} type="submit">
                {saving ? "Gravando…" : "Gravar"}
              </button>
              <button className="button-secondary" onClick={returnToList} type="button">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
