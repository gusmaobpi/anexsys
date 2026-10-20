"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import { PAYMENT_PROVIDER_OPTIONS, paymentProviderLabel } from "@/components/settings/payment-provider-list";
import {
  applyPaymentTerminalFilters,
  buildPaymentTerminalExcelCsv,
  paymentTerminalStatusLabel,
  type PaymentTerminalRecord,
} from "@/components/settings/payment-terminal-list";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type TerminalForm = {
  name: string;
  terminalCode: string;
  provider: string;
  isDefault: boolean;
  active: boolean;
};

const emptyForm = (): TerminalForm => ({
  name: "",
  terminalCode: "",
  provider: "cielo",
  isDefault: false,
  active: true,
});

export function PaymentTerminalsWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { hasAnyPermission, apiJson, session } = useSession();
  const pane = useWorkspacePane();
  const { isMobile } = useWorkspaceViewportMode();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const activeBranchId = session?.activeBranchId ?? null;
  const canRead = hasAnyPermission("finance.read");
  const canWrite = hasAnyPermission("finance.write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<PaymentTerminalRecord[]>([]);
  const [form, setForm] = useWorkspaceScopedState<TerminalForm>("settings.payment-terminals.form", emptyForm());
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
        ? "Terminais: Novo"
        : activeRecord
          ? `Terminais: ${activeRecord.name}`
          : "Terminais",
    subtitle: workspaceMode === "new" ? "Novo cadastro" : activeRecord ? paymentProviderLabel(activeRecord.provider) : null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const searchOptions = useMemo(
    () => records.map((record) => ({ id: record.id, label: `${record.name} · ${record.terminalCode}` })),
    [records],
  );

  const loadRecords = useCallback(async () => {
    if (!canRead || !activeBranchId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiJson<PaymentTerminalRecord[]>(
        `/payment-terminals?branchId=${encodeURIComponent(activeBranchId)}`,
      );
      setRecords(Array.isArray(response) ? response : []);
      setMessage(null);
    } catch (error) {
      setRecords([]);
      setMessage(describeWorkspaceError(error, "Os terminais não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead, activeBranchId]);

  useEffect(() => {
    if (!isActivePane) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadRecords();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isActivePane, loadRecords, session?.tenantId, activeBranchId]);

  useCadastroListRefresh("/settings/payments/terminals", isListWorkspace, loadRecords);

  const openCreateWorkspace = useCallback(() => {
    const targetPath = "/settings/payments/terminals?workspaceMode=new";
    if (isMobile) {
      navigateWithinWorkspace(targetPath);
      return;
    }
    openWorkspaceInNewTab(targetPath, "Terminais: Novo", { cloneCurrent: false, subtitle: "Novo cadastro" });
  }, [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openEditWorkspace = useCallback(
    (record: PaymentTerminalRecord) => {
      const targetPath = `/settings/payments/terminals?focusRecordId=${encodeURIComponent(record.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Terminais: ${record.name}`, {
        cloneCurrent: false,
        subtitle: paymentProviderLabel(record.provider),
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/settings/payments/terminals");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/settings/payments/terminals", "Terminais", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishTerminalSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/settings/payments/terminals",
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace("/settings/payments/terminals"),
    });
  }

  const goToProviders = useCallback(() => {
    navigateWithinWorkspace("/settings/payments");
  }, [navigateWithinWorkspace]);

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
      name: record.name,
      terminalCode: record.terminalCode,
      provider: record.provider,
      isDefault: record.isDefault,
      active: record.status === "active",
    });
  }, [focusRecordId, records, setForm, workspaceMode]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!activeBranchId) {
      setMessage("Selecione uma filial no contexto para cadastrar o terminal.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiJson<PaymentTerminalRecord>("/payment-terminals", {
        method: "POST",
        body: JSON.stringify({
          branchId: activeBranchId,
          provider: form.provider,
          name: form.name.trim(),
          terminalCode: form.terminalCode.trim(),
          isDefault: form.isDefault,
        }),
      });
      setMessage("Terminal cadastrado.");
      await loadRecords();
      finishTerminalSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O terminal não pôde ser cadastrado."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!activeRecord) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiJson<PaymentTerminalRecord>(`/payment-terminals/${activeRecord.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          terminalCode: form.terminalCode.trim(),
          isDefault: form.isDefault,
          status: form.active ? "active" : "inactive",
        }),
      });
      setMessage("Terminal atualizado.");
      await loadRecords();
      finishTerminalSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O terminal não pôde ser atualizado."));
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateRecord = useCallback(
    async (record: PaymentTerminalRecord) => {
      if (record.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar o terminal ${record.name}?`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson<PaymentTerminalRecord>(`/payment-terminals/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setMessage("Terminal inativado.");
        await loadRecords();
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O terminal não pôde ser inativado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, loadRecords],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Terminais indisponíveis</h3>
        <p>Você não possui acesso às configurações financeiras no contexto atual.</p>
      </section>
    );
  }

  if (!activeBranchId) {
    return (
      <section className="mini-card">
        <h3>Selecione uma filial</h3>
        <p>Os terminais são cadastrados por filial. Escolha a filial no contexto no topo da tela.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Configurações → Pagamentos</div>
          <h1 className="title">
            {workspaceMode === "new" ? "Terminais: Novo" : activeRecord ? `Terminais: ${activeRecord.name}` : "Terminais"}
          </h1>
          <p>
            Terminais da filial ativa. O terminal padrão é usado automaticamente na cobrança pela maquininha na OS.
          </p>
        </section>
      ) : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <>
          <div className="button-row" style={{ marginBottom: 12 }}>
            <button className="button-secondary" onClick={goToProviders} type="button">
              Operadoras
            </button>
            <button className="button" type="button">
              Terminais
            </button>
          </div>
          <CadastroListPanel
            applyFilters={applyPaymentTerminalFilters}
            buildExcelCsv={buildPaymentTerminalExcelCsv}
            canInactivate={(row) => row.status !== "inactive"}
            canWrite={canWrite}
            columnStorageKey="anexsys.frontend.payment-terminals.grid-columns.v1"
            columns={[
              { id: "name", label: "Nome", locked: true, render: (row) => <strong>{row.name}</strong> },
              { id: "code", label: "Identificação", render: (row) => row.terminalCode },
              { id: "provider", label: "Operadora", render: (row) => paymentProviderLabel(row.provider) },
              { id: "default", label: "Padrão", render: (row) => (row.isDefault ? "Sim" : "—") },
              {
                id: "status",
                label: "Status",
                render: (row) => (
                  <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                    {paymentTerminalStatusLabel(row.status)}
                  </span>
                ),
              },
            ]}
            defaultColumnIds={["name", "code", "provider", "default", "status"]}
            emptyFilters={{ provider: "", status: "" }}
            emptyMessage="Nenhum terminal cadastrado nesta filial."
            excelFileName="pagamentos-terminais.csv"
            filterFields={[
              {
                id: "provider",
                kind: "select",
                label: "Operadora",
                options: [{ value: "", label: "Todas" }, ...PAYMENT_PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))],
              },
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
            rowLabel={(row) => row.name}
            searchKey="name"
            searchOptions={searchOptions}
            searchPlaceholder="Buscar por nome ou identificação"
            title="Terminais"
          />
        </>
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <form className="form-grid" onSubmit={workspaceMode === "new" ? handleCreate : handleUpdate}>
              <h3>{workspaceMode === "new" ? "Novo terminal" : "Alterar terminal"}</h3>
              <label className="field">
                <span>Nome</span>
                <input
                  placeholder="Balcão 1"
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Identificação / código</span>
                <input
                  placeholder="Número de série ou código da operadora"
                  required
                  value={form.terminalCode}
                  onChange={(event) => setForm((current) => ({ ...current, terminalCode: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Operadora</span>
                <select
                  disabled={workspaceMode !== "new" || saving}
                  value={form.provider}
                  onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                >
                  {PAYMENT_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field--checkbox">
                <input
                  checked={form.isDefault}
                  disabled={saving}
                  type="checkbox"
                  onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                />
                <span>Terminal padrão da filial</span>
              </label>
              {workspaceMode !== "new" ? (
                <label className="field field--checkbox">
                  <input
                    checked={form.active}
                    disabled={saving}
                    type="checkbox"
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Terminal ativo</span>
                </label>
              ) : null}
              <p className="table-subtle">
                Ao marcar este terminal como padrão, o padrão atual da filial é desmarcado automaticamente.
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
