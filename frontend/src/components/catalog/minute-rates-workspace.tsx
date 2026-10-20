"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import {
  applyMinuteRateFilters,
  buildMinuteRateExcelCsv,
  minuteRateStatusLabel,
  type MinuteRateRecord,
} from "@/components/catalog/minute-rate-list";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";
import { applyOsMoneyTyping, formatOsMoney } from "@/components/service-orders/service-order-workspace-view-model";

type MinuteRateForm = {
  valuePerMinute: string;
  active: boolean;
};

const emptyForm = (): MinuteRateForm => ({
  valuePerMinute: "",
  active: true,
});

function parseMinuteRateValue(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

export function MinuteRatesWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { hasAnyPermission, apiJson, session } = useSession();
  const pane = useWorkspacePane();
  const { isMobile } = useWorkspaceViewportMode();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const activeEmpresaId = session?.activeEmpresaId ?? null;
  const canRead = hasAnyPermission("service_orders.read");
  const canWrite = hasAnyPermission("service_orders.write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<MinuteRateRecord[]>([]);
  const [form, setForm] = useWorkspaceScopedState<MinuteRateForm>("atelier-catalog.minute-rates.form", emptyForm());
  const { closeWorkspace } = useWorkspaceManager();
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusRecordId);
  const isListWorkspace = !isFormWorkspace;
  const activeRecord = useMemo(
    () => records.find((record) => record.id === focusRecordId) ?? null,
    [focusRecordId, records],
  );
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label:
      workspaceMode === "new"
        ? "Valor por Minuto: Nova"
        : activeRecord
          ? `Valor por Minuto: ${formatOsMoney(Number(activeRecord.valuePerMinute))}`
          : "Valor por Minuto",
    subtitle: workspaceMode === "new" ? "Novo cadastro" : activeRecord?.companyName ?? null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const searchOptions = useMemo(
    () => records.map((record) => ({ id: record.id, label: record.companyName })),
    [records],
  );

  const loadRecords = useCallback(async () => {
    if (!canRead || !activeEmpresaId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiJson<MinuteRateRecord[]>(
        `/minute-rates?companyId=${encodeURIComponent(activeEmpresaId)}`,
      );
      setRecords(Array.isArray(response) ? response : []);
      setMessage(null);
    } catch (error) {
      setRecords([]);
      setMessage(describeWorkspaceError(error, "As tabelas de valor por minuto não puderam ser carregadas."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead, activeEmpresaId]);

  useEffect(() => {
    if (!isActivePane) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadRecords();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isActivePane, loadRecords, session?.tenantId, activeEmpresaId]);

  useCadastroListRefresh("/minute-rates", isListWorkspace, loadRecords);

  const openCreateWorkspace = useCallback(() => {
    const targetPath = "/minute-rates?workspaceMode=new";
    if (isMobile) {
      navigateWithinWorkspace(targetPath);
      return;
    }
    openWorkspaceInNewTab(targetPath, "Valor por Minuto: Nova", { cloneCurrent: false, subtitle: "Novo cadastro" });
  }, [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openEditWorkspace = useCallback(
    (record: MinuteRateRecord) => {
      const targetPath = `/minute-rates?focusRecordId=${encodeURIComponent(record.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Valor por Minuto: ${formatOsMoney(Number(record.valuePerMinute))}`, {
        cloneCurrent: false,
        subtitle: record.companyName,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/minute-rates");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/minute-rates", "Valor por Minuto", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishMinuteRateSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/minute-rates",
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace("/minute-rates"),
    });
  }

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setForm(emptyForm());
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [setForm, workspaceMode]);

  useEffect(() => {
    if (!focusRecordId || workspaceMode === "new") {
      return;
    }
    const record = records.find((item) => item.id === focusRecordId);
    if (!record) {
      return;
    }
    setForm({
      valuePerMinute: record.valuePerMinute.replace(".", ","),
      active: record.status === "active",
    });
  }, [focusRecordId, records, setForm, workspaceMode]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!activeEmpresaId) {
      setMessage("Selecione uma empresa no contexto para cadastrar o valor por minuto.");
      return;
    }
    const value = parseMinuteRateValue(form.valuePerMinute);
    setSaving(true);
    setMessage(null);
    try {
      const hadActive = records.some((record) => record.status === "active");
      await apiJson<MinuteRateRecord>("/minute-rates", {
        method: "POST",
        body: JSON.stringify({ companyId: activeEmpresaId, valuePerMinute: value }),
      });
      setMessage(
        hadActive
          ? "Tabela ativa salva. A tabela anterior foi inativada automaticamente."
          : "Tabela de valor por minuto cadastrada e ativada.",
      );
      await loadRecords();
      finishMinuteRateSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A tabela de valor por minuto não pôde ser cadastrada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!activeRecord) {
      return;
    }
    const value = parseMinuteRateValue(form.valuePerMinute);
    setSaving(true);
    setMessage(null);
    try {
      const body: { valuePerMinute: number; status?: "active" | "inactive" } = { valuePerMinute: value };
      if (form.active !== (activeRecord.status === "active")) {
        body.status = form.active ? "active" : "inactive";
      }
      await apiJson<MinuteRateRecord>(`/minute-rates/${activeRecord.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMessage("Tabela de valor por minuto atualizada.");
      await loadRecords();
      finishMinuteRateSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A tabela de valor por minuto não pôde ser atualizada."));
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateRecord = useCallback(
    async (record: MinuteRateRecord) => {
      if (record.status === "inactive") {
        return;
      }
      if (!window.confirm("Inativar esta tabela de valor por minuto? A empresa ficará sem tabela ativa.")) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson<MinuteRateRecord>(`/minute-rates/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setMessage("Tabela inativada.");
        await loadRecords();
      } catch (error) {
        setMessage(describeWorkspaceError(error, "A tabela não pôde ser inativada."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, loadRecords],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Valor por minuto indisponível</h3>
        <p>Você não possui acesso ao catálogo no contexto atual.</p>
      </section>
    );
  }

  if (!activeEmpresaId) {
    return (
      <section className="mini-card">
        <h3>Selecione uma empresa</h3>
        <p>O valor por minuto é cadastrado por empresa. Escolha a empresa no contexto no topo da tela.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Cadastros</div>
          <h1 className="title">
            {workspaceMode === "new"
              ? "Valor por Minuto: Nova"
              : activeRecord
                ? `Valor por Minuto: ${formatOsMoney(Number(activeRecord.valuePerMinute))}`
                : "Valor por Minuto"}
          </h1>
          <p>
            Uma tabela ativa por empresa. Na OS, o valor do serviço será Tempo (min) × Valor por minuto da tabela ativa.
          </p>
        </section>
      ) : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyMinuteRateFilters}
          buildExcelCsv={buildMinuteRateExcelCsv}
          canInactivate={(row) => row.status !== "inactive"}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.minute-rates.grid-columns.v1"
          columns={[
            { id: "company", label: "Empresa", locked: true, render: (row) => <strong>{row.companyName}</strong> },
            {
              id: "value",
              label: "Valor por minuto",
              render: (row) => `${formatOsMoney(Number(row.valuePerMinute))}/min`,
            },
            {
              id: "createdAt",
              label: "Cadastrada em",
              render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleDateString("pt-BR") : ""),
            },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {minuteRateStatusLabel(row.status)}
                </span>
              ),
            },
          ]}
          defaultColumnIds={["company", "value", "status"]}
          emptyFilters={{ status: "" }}
          emptyMessage="Nenhuma tabela cadastrada para esta empresa."
          excelFileName="valor-por-minuto.csv"
          filterFields={[
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "active", label: "Ativo" },
                { value: "inactive", label: "Inativo" },
              ],
            },
          ]}
          loading={loading}
          onCreate={openCreateWorkspace}
          onEdit={openEditWorkspace}
          onInactivate={handleInactivateRecord}
          records={records}
          rowLabel={(row) => `${row.companyName} ${row.valuePerMinute}`}
          searchKey="company"
          searchOptions={searchOptions}
          searchPlaceholder="Buscar por empresa"
          title="Valor por Minuto"
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <form className="form-grid" onSubmit={workspaceMode === "new" ? handleCreate : handleUpdate}>
              <h3>{workspaceMode === "new" ? "Nova tabela" : "Alterar tabela"}</h3>
              <label className="field">
                <span>Valor por minuto (R$)</span>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  required
                  value={form.valuePerMinute}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, valuePerMinute: applyOsMoneyTyping(event.target.value) }))
                  }
                />
              </label>
              {workspaceMode !== "new" ? (
                <label className="field field--checkbox">
                  <input
                    checked={form.active}
                    disabled={saving}
                    type="checkbox"
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Tabela ativa desta empresa</span>
                </label>
              ) : null}
              <p className="table-subtle">
                {workspaceMode === "new"
                  ? "A nova tabela já nasce ativa. Se existir outra tabela ativa nesta empresa, ela será inativada automaticamente."
                  : "Ao ativar esta tabela, a tabela ativa atual da empresa é inativada automaticamente."}
              </p>
              <div className="button-row">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Gravando…" : "Gravar"}
                </button>
                <button
                  className="button-secondary"
                  disabled={saving}
                  onClick={(event) => {
                    requestCadastroContinue(event, workspaceMode === "new" ? handleCreate : handleUpdate);
                  }}
                  type="button"
                >
                  {saving ? "Gravando…" : "Gravar e Continuar"}
                </button>
                <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          </article>
        </section>
      )}
    </>
  );
}
