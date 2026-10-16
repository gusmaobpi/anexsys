"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import {
  applyPaymentProviderConfigFilters,
  buildPaymentProviderConfigExcelCsv,
  PAYMENT_PROVIDER_ENVIRONMENT_OPTIONS,
  PAYMENT_PROVIDER_OPTIONS,
  paymentProviderConfigStatusLabel,
  paymentProviderEnvironmentLabel,
  paymentProviderLabel,
  type PaymentProviderConfigRecord,
} from "@/components/settings/payment-provider-list";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type CredentialEntry = {
  key: string;
  value: string;
};

type ProviderConfigForm = {
  provider: string;
  environment: string;
  credentials: CredentialEntry[];
  active: boolean;
};

const emptyForm = (): ProviderConfigForm => ({
  provider: "cielo",
  environment: "sandbox",
  credentials: [],
  active: true,
});

function credentialsToEntries(credentials: Record<string, string>): CredentialEntry[] {
  return Object.entries(credentials ?? {}).map(([key, value]) => ({ key, value: String(value) }));
}

function entriesToCredentials(entries: CredentialEntry[]): Record<string, string> {
  const credentials: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key) {
      credentials[key] = entry.value;
    }
  }
  return credentials;
}

export function PaymentProvidersWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { hasAnyPermission, apiJson, session } = useSession();
  const pane = useWorkspacePane();
  const { isMobile } = useWorkspaceViewportMode();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const activeEmpresaId = session?.activeEmpresaId ?? null;
  const canRead = hasAnyPermission("finance.read");
  const canWrite = hasAnyPermission("finance.write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<PaymentProviderConfigRecord[]>([]);
  const [form, setForm] = useWorkspaceScopedState<ProviderConfigForm>("settings.payment-providers.form", emptyForm());
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
        ? "Pagamentos: Nova operadora"
        : activeRecord
          ? `Pagamentos: ${paymentProviderLabel(activeRecord.provider)}`
          : "Pagamentos",
    subtitle: workspaceMode === "new" ? "Nova configuração" : activeRecord?.companyName ?? null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const searchOptions = useMemo(
    () => records.map((record) => ({ id: record.id, label: `${record.companyName} · ${paymentProviderLabel(record.provider)}` })),
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
      const response = await apiJson<PaymentProviderConfigRecord[]>(
        `/payment-provider-configs?companyId=${encodeURIComponent(activeEmpresaId)}`,
      );
      setRecords(Array.isArray(response) ? response : []);
      setMessage(null);
    } catch (error) {
      setRecords([]);
      setMessage(describeWorkspaceError(error, "As configurações de pagamento não puderam ser carregadas."));
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

  const openCreateWorkspace = useCallback(() => {
    const targetPath = "/settings/payments?workspaceMode=new";
    if (isMobile) {
      navigateWithinWorkspace(targetPath);
      return;
    }
    openWorkspaceInNewTab(targetPath, "Pagamentos: Nova operadora", { cloneCurrent: false, subtitle: "Nova configuração" });
  }, [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openEditWorkspace = useCallback(
    (record: PaymentProviderConfigRecord) => {
      const targetPath = `/settings/payments?focusRecordId=${encodeURIComponent(record.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Pagamentos: ${paymentProviderLabel(record.provider)}`, {
        cloneCurrent: false,
        subtitle: record.companyName,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/settings/payments");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/settings/payments", "Pagamentos", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const goToTerminals = useCallback(() => {
    navigateWithinWorkspace("/settings/payments/terminals");
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
      provider: record.provider,
      environment: record.environment,
      credentials: credentialsToEntries(record.credentials),
      active: record.status === "active",
    });
  }, [focusRecordId, records, setForm, workspaceMode]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!activeEmpresaId) {
      setMessage("Selecione uma empresa no contexto para configurar a operadora.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const hadActive = records.some((record) => record.provider === form.provider && record.status === "active");
      await apiJson<PaymentProviderConfigRecord>("/payment-provider-configs", {
        method: "POST",
        body: JSON.stringify({
          companyId: activeEmpresaId,
          provider: form.provider,
          environment: form.environment,
          credentials: entriesToCredentials(form.credentials),
        }),
      });
      setMessage(
        hadActive
          ? "Configuração salva e ativada. A configuração anterior desta operadora foi inativada automaticamente."
          : "Configuração da operadora cadastrada e ativada.",
      );
      await loadRecords();
      closeFormWorkspace();
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A configuração da operadora não pôde ser cadastrada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent) {
    event.preventDefault();
    if (!activeRecord) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const body: {
        environment: string;
        credentials: Record<string, string>;
        status?: "active" | "inactive";
      } = {
        environment: form.environment,
        credentials: entriesToCredentials(form.credentials),
      };
      if (form.active !== (activeRecord.status === "active")) {
        body.status = form.active ? "active" : "inactive";
      }
      await apiJson<PaymentProviderConfigRecord>(`/payment-provider-configs/${activeRecord.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMessage("Configuração da operadora atualizada.");
      await loadRecords();
      closeFormWorkspace();
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A configuração da operadora não pôde ser atualizada."));
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateRecord = useCallback(
    async (record: PaymentProviderConfigRecord) => {
      if (record.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar a configuração da ${paymentProviderLabel(record.provider)}?`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson<PaymentProviderConfigRecord>(`/payment-provider-configs/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setMessage("Configuração inativada.");
        await loadRecords();
      } catch (error) {
        setMessage(describeWorkspaceError(error, "A configuração não pôde ser inativada."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, loadRecords],
  );

  const updateCredentialEntry = useCallback(
    (index: number, patch: Partial<CredentialEntry>) => {
      setForm((current) => ({
        ...current,
        credentials: current.credentials.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, ...patch } : entry,
        ),
      }));
    },
    [setForm],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Pagamentos indisponíveis</h3>
        <p>Você não possui acesso às configurações financeiras no contexto atual.</p>
      </section>
    );
  }

  if (!activeEmpresaId) {
    return (
      <section className="mini-card">
        <h3>Selecione uma empresa</h3>
        <p>As operadoras são configuradas por empresa. Escolha a empresa no contexto no topo da tela.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Configurações</div>
          <h1 className="title">
            {workspaceMode === "new"
              ? "Pagamentos: Nova operadora"
              : activeRecord
                ? `Pagamentos: ${paymentProviderLabel(activeRecord.provider)}`
                : "Pagamentos"}
          </h1>
          <p>
            Uma configuração ativa por empresa para cada operadora. Guarde aqui as credenciais (sandbox ou produção)
            que a integração com a maquininha vai usar depois.
          </p>
        </section>
      ) : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <>
          <div className="button-row" style={{ marginBottom: 12 }}>
            <button className="button" type="button">
              Operadoras
            </button>
            <button className="button-secondary" onClick={goToTerminals} type="button">
              Terminais
            </button>
          </div>
          <CadastroListPanel
          applyFilters={applyPaymentProviderConfigFilters}
          buildExcelCsv={buildPaymentProviderConfigExcelCsv}
          canInactivate={(row) => row.status !== "inactive"}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.payment-providers.grid-columns.v1"
          columns={[
            { id: "company", label: "Empresa", locked: true, render: (row) => <strong>{row.companyName}</strong> },
            { id: "provider", label: "Operadora", render: (row) => paymentProviderLabel(row.provider) },
            {
              id: "environment",
              label: "Ambiente",
              render: (row) => paymentProviderEnvironmentLabel(row.environment),
            },
            {
              id: "credentials",
              label: "Credenciais",
              render: (row) => {
                const keys = Object.keys(row.credentials ?? {});
                return keys.length > 0 ? keys.join(", ") : "—";
              },
            },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {paymentProviderConfigStatusLabel(row.status)}
                </span>
              ),
            },
          ]}
          defaultColumnIds={["company", "provider", "environment", "status"]}
          emptyFilters={{ provider: "", status: "" }}
          emptyMessage="Nenhuma operadora configurada para esta empresa."
          excelFileName="pagamentos-operadoras.csv"
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
          rowLabel={(row) => `${row.companyName} ${paymentProviderLabel(row.provider)}`}
          searchKey="company"
          searchOptions={searchOptions}
          searchPlaceholder="Buscar por empresa"
          title="Pagamentos"
          />
        </>
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <form className="form-grid" onSubmit={workspaceMode === "new" ? handleCreate : handleUpdate}>
              <h3>{workspaceMode === "new" ? "Nova configuração" : "Alterar configuração"}</h3>
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
              <label className="field">
                <span>Ambiente</span>
                <select
                  disabled={saving}
                  value={form.environment}
                  onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))}
                >
                  {PAYMENT_PROVIDER_ENVIRONMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>Credenciais</span>
                {form.credentials.map((entry, index) => (
                  <div className="credential-row" key={index}>
                    <input
                      placeholder="chave (ex.: clientId)"
                      value={entry.key}
                      onChange={(event) => updateCredentialEntry(index, { key: event.target.value })}
                    />
                    <input
                      placeholder="valor"
                      value={entry.value}
                      onChange={(event) => updateCredentialEntry(index, { value: event.target.value })}
                    />
                    <button
                      className="button-ghost"
                      disabled={saving}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          credentials: current.credentials.filter((_, entryIndex) => entryIndex !== index),
                        }))
                      }
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  className="button-secondary"
                  disabled={saving}
                  onClick={() =>
                    setForm((current) => ({ ...current, credentials: [...current.credentials, { key: "", value: "" }] }))
                  }
                  type="button"
                >
                  + Adicionar credencial
                </button>
                <small className="table-subtle">
                  As chaves variam por operadora. Ex.: clientId, clientSecret, merchantId.
                </small>
              </div>
              {workspaceMode !== "new" ? (
                <label className="field field--checkbox">
                  <input
                    checked={form.active}
                    disabled={saving}
                    type="checkbox"
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Configuração ativa desta operadora</span>
                </label>
              ) : null}
              <p className="table-subtle">
                {workspaceMode === "new"
                  ? "A nova configuração já nasce ativa. Se esta operadora já tiver uma configuração ativa nesta empresa, ela será inativada automaticamente."
                  : "Ao ativar esta configuração, a configuração ativa atual desta operadora na empresa é inativada automaticamente."}
              </p>
              <div className="button-row">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Salvando…" : "Salvar"}
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
