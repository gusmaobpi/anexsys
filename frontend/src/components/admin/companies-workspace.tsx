"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { applyContaListFilters, buildContaExcelCsv, contaStatusLabel } from "@/components/admin/conta-list";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import {
  normalizeCompanyListRecords,
  normalizeCompanyRecord,
  type CompanyApiRecord,
  type CompanyRecord,
} from "@/components/admin/company-list-records";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash } from "@/components/ui/workspace-flash";
import {
  MasterDataDuplicateGuard,
  normalizeCodeValue,
} from "@/components/ui/master-data-duplicate-guard";
import { DependencyGuardPanel, type DependencyValidationResult } from "@/components/ui/dependency-guard-panel";

type CompanyForm = {
  code: string;
  legalName: string;
  displayName: string;
  warrantyAdjustmentPeriodDays: string;
  warrantyExecutionPeriodDays: string;
  blockDeliveryWithOutstandingBalance: boolean;
  delayAlertLeadHours: string;
  grade1Minutes: string;
  grade2Minutes: string;
  grade3Minutes: string;
  grade4Minutes: string;
};

const emptyForm = (): CompanyForm => ({
  code: "",
  legalName: "",
  displayName: "",
  warrantyAdjustmentPeriodDays: "7",
  warrantyExecutionPeriodDays: "90",
  blockDeliveryWithOutstandingBalance: true,
  delayAlertLeadHours: "2",
  grade1Minutes: "30",
  grade2Minutes: "60",
  grade3Minutes: "90",
  grade4Minutes: "180",
});

function mapCompanyToForm(company: CompanyRecord): CompanyForm {
  return {
    code: company.code,
    legalName: company.legalName,
    displayName: company.displayName,
    warrantyAdjustmentPeriodDays: String(company.warrantyAdjustmentPeriodDays ?? 7),
    warrantyExecutionPeriodDays: String(company.warrantyExecutionPeriodDays ?? 90),
    blockDeliveryWithOutstandingBalance: company.blockDeliveryWithOutstandingBalance,
    delayAlertLeadHours: String(company.delayAlertLeadHours ?? 2),
    grade1Minutes: String(company.grade1Minutes ?? 30),
    grade2Minutes: String(company.grade2Minutes ?? 60),
    grade3Minutes: String(company.grade3Minutes ?? 90),
    grade4Minutes: String(company.grade4Minutes ?? 180),
  };
}

export function CompaniesWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { isMobile } = useWorkspaceViewportMode();
  const { session, hasAnyPermission, apiJson } = useSession();
  const canRead = hasAnyPermission("tenants.read");
  const canWrite = hasAnyPermission("tenants.write");
  const canCreate = hasAnyPermission("platform.tenants.create");
  const workspaceMode = searchParams.get("workspaceMode");
  const focusTenantId = searchParams.get("focusTenantId");
  const prefillName = searchParams.get("prefillName") ?? "";
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useWorkspaceScopedState<string | null>("companies.activeCompanyId", null);
  const [showCreateForm, setShowCreateForm] = useWorkspaceScopedState("companies.showCreateForm", false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useWorkspaceScopedState<CompanyForm>("companies.form", emptyForm());
  const [companyDuplicateStatus, setCompanyDuplicateStatus] = useState<"idle" | "checking" | "duplicate">("idle");
  const [companyDuplicateMatch, setCompanyDuplicateMatch] = useState<CompanyRecord | null>(null);
  const [dependencyValidation, setDependencyValidation] = useState<DependencyValidationResult | null>(null);

  const companyLookupOptions = useMemo(
    () =>
      companies.map((company) => ({
        id: company.id,
        label: company.displayName,
        hint: [company.code, company.legalName].filter(Boolean).join(" · ") || undefined,
      })),
    [companies],
  );

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusTenantId);
  const isListWorkspace = !isFormWorkspace;
  const { closeWorkspace } = useWorkspaceManager();
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: showCreateForm ? "Conta: Nova" : activeCompany ? `Conta: ${activeCompany.displayName}` : "Contas",
    subtitle: showCreateForm ? "Novo cadastro" : activeCompany?.code ?? null,
  });

  const loadCompanies = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiJson<CompanyApiRecord[]>("/tenants");
      const records = normalizeCompanyListRecords(response);
      setCompanies(records);
      setMessage(null);
      setDependencyValidation(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "As empresas não puderam ser carregadas.");
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead]);

  const clearCompanyDuplicate = useCallback(() => {
    setCompanyDuplicateStatus("idle");
    setCompanyDuplicateMatch(null);
  }, []);

  const handleSelectCompany = useCallback((company: CompanyRecord) => {
    setActiveCompanyId(company.id);
    setShowCreateForm(false);
    setForm(mapCompanyToForm(company));
    clearCompanyDuplicate();
  }, [clearCompanyDuplicate, setActiveCompanyId, setForm, setShowCreateForm]);

  const handleCompanyCodeBlur = useCallback(() => {
    const normalizedCode = normalizeCodeValue(form.code);
    const currentCompanyId = showCreateForm ? null : activeCompany?.id ?? null;
    if (!normalizedCode) {
      clearCompanyDuplicate();
      return;
    }

    setCompanyDuplicateStatus("checking");
    const duplicate =
      companies.find((company) => normalizeCodeValue(company.code) === normalizedCode && company.id !== currentCompanyId) ?? null;
    setCompanyDuplicateMatch(duplicate);
    setCompanyDuplicateStatus(duplicate ? "duplicate" : "idle");
  }, [activeCompany?.id, clearCompanyDuplicate, companies, form.code, showCreateForm]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCompanies();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCompanies]);

  useCadastroListRefresh("/admin/tenants", isListWorkspace, loadCompanies);

  const openCreateForm = useCallback(
    (name?: string) => {
      setShowCreateForm(true);
      setActiveCompanyId(null);
      setForm({ ...emptyForm(), displayName: name?.trim() ?? "", legalName: name?.trim() ?? "" });
      clearCompanyDuplicate();
    },
    [clearCompanyDuplicate, setActiveCompanyId, setForm, setShowCreateForm],
  );

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `/admin/tenants?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Conta: Nova", { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (company: Pick<CompanyRecord, "id" | "displayName" | "code">) => {
      const targetPath = `/admin/tenants?focusTenantId=${encodeURIComponent(company.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Conta: ${company.displayName}`, {
        cloneCurrent: false,
        subtitle: company.code,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/admin/tenants");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/admin/tenants", "Contas", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishCompanySave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/admin/tenants",
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace("/admin/tenants"),
    });
  }

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      openCreateForm(prefillName);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [openCreateForm, prefillName, workspaceMode]);

  useEffect(() => {
    if (!focusTenantId || workspaceMode === "new") {
      return;
    }
    const company = companies.find((item) => item.id === focusTenantId);
    if (!company) {
      return;
    }
    handleSelectCompany(company);
  }, [companies, focusTenantId, handleSelectCompany, workspaceMode]);

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }
    setShowCreateForm(false);
    setActiveCompanyId(null);
  }, [isListWorkspace, setActiveCompanyId, setShowCreateForm]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canCreate) return;
    if (companyDuplicateStatus !== "idle") {
      setMessage("Revise a duplicidade detectada antes de salvar a empresa.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setDependencyValidation(null);
    try {
      const createdResponse = await apiJson<CompanyApiRecord>("/tenants", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          legalName: form.legalName,
          displayName: form.displayName,
          warrantyAdjustmentPeriodDays: Number(form.warrantyAdjustmentPeriodDays || 7),
          warrantyExecutionPeriodDays: Number(form.warrantyExecutionPeriodDays || 90),
          blockDeliveryWithOutstandingBalance: form.blockDeliveryWithOutstandingBalance,
          delayAlertLeadHours: Number(form.delayAlertLeadHours || 2),
          grade1Minutes: Number(form.grade1Minutes || 30),
          grade2Minutes: Number(form.grade2Minutes || 60),
          grade3Minutes: Number(form.grade3Minutes || 90),
          grade4Minutes: Number(form.grade4Minutes || 180),
        }),
      });
      const created = normalizeCompanyRecord(createdResponse, companies.length);
      setCompanies((current) => [created, ...current]);
      setMessage("Conta criada. Empresa e Filial padrão nasceram juntas, com horário de funcionamento.");
      finishCompanySave(intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A empresa não pôde ser criada.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite || !activeCompany || activeCompany.id !== session?.tenantId) return;
    if (companyDuplicateStatus !== "idle") {
      setMessage("Revise a duplicidade detectada antes de salvar a empresa.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updatedResponse = await apiJson<CompanyApiRecord>(`/tenants/${activeCompany.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          code: form.code,
          legalName: form.legalName,
          displayName: form.displayName,
          warrantyAdjustmentPeriodDays: Number(form.warrantyAdjustmentPeriodDays || 7),
          warrantyExecutionPeriodDays: Number(form.warrantyExecutionPeriodDays || 90),
          blockDeliveryWithOutstandingBalance: form.blockDeliveryWithOutstandingBalance,
          delayAlertLeadHours: Number(form.delayAlertLeadHours || 2),
          grade1Minutes: Number(form.grade1Minutes || 30),
          grade2Minutes: Number(form.grade2Minutes || 60),
          grade3Minutes: Number(form.grade3Minutes || 90),
          grade4Minutes: Number(form.grade4Minutes || 180),
        }),
      });
      const updated = normalizeCompanyRecord(updatedResponse, 0, { fallbackId: activeCompany.id });
      setCompanies((current) => current.map((company) => (company.id === activeCompany.id ? updated : company)));
      setMessage("Empresa atualizada com sucesso.");
      finishCompanySave(intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A empresa não pôde ser atualizada.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(action: "activate" | "deactivate") {
    if (!canWrite || !activeCompany || activeCompany.id !== session?.tenantId) return;
    setSaving(true);
    setMessage(null);
    setDependencyValidation(null);
    try {
      if (action === "deactivate") {
        const validation = await apiJson<DependencyValidationResult>(`/tenants/${activeCompany.id}/dependency-check?action=deactivate`);
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return;
        }
      }
      const updatedResponse = await apiJson<CompanyApiRecord>(`/tenants/${activeCompany.id}/${action}`, {
        method: "POST",
      });
      const updated = normalizeCompanyRecord(updatedResponse, 0, { fallbackId: activeCompany.id });
      setCompanies((current) => current.map((company) => (company.id === activeCompany.id ? updated : company)));
      setActiveCompanyId(activeCompany.id);
      setMessage(action === "activate" ? "Empresa reativada." : "Empresa desativada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O status da empresa não pôde ser alterado.");
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateConta = useCallback(
    async (company: Pick<CompanyRecord, "id" | "displayName" | "status">) => {
      if (company.status === "inactive") {
        return;
      }
      if (company.id !== session?.tenantId) {
        setMessage("Só é possível inativar a Conta do contexto ativo.");
        return;
      }
      if (!window.confirm(`Inativar ${company.displayName}? Ela some do combo, mas continua na lista.`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(`/tenants/${company.id}/dependency-check?action=deactivate`);
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return;
        }
        const updatedResponse = await apiJson<CompanyApiRecord>(`/tenants/${company.id}/deactivate`, { method: "POST" });
        const updated = normalizeCompanyRecord(updatedResponse, 0, { fallbackId: company.id });
        setCompanies((current) => current.map((record) => (record.id === company.id ? updated : record)));
        setMessage(`${company.displayName} foi inativada.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "A conta não pôde ser inativada.");
      } finally {
        setSaving(false);
      }
    },
    [apiJson, session?.tenantId],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Contas indisponíveis</h3>
        <p>Você não possui acesso ao cadastro de empresas no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Administração</div>
          <h1 className="title">{showCreateForm ? "Nova conta" : activeCompany ? activeCompany.displayName : "Conta"}</h1>
          <p>Só o André cria Contas. Cada Conta nasce com Empresa e Filial padrão.</p>
        </section>
      ) : null}

      {dependencyValidation && !dependencyValidation.allowed ? <DependencyGuardPanel validation={dependencyValidation} /> : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyContaListFilters}
          buildExcelCsv={buildContaExcelCsv}
          canWrite={canCreate || canWrite}
          columnStorageKey="anexsys.frontend.contas.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Conta",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.displayName}</strong>
                  <div className="table-subtle">
                    {row.code} · {row.legalName}
                  </div>
                </>
              ),
            },
            { id: "code", label: "Código", render: (row) => row.code },
            {
              id: "status",
              label: "Status",
              render: (row) => <span className={`status-chip status-chip--${row.status}`}>{contaStatusLabel(row.status)}</span>,
            },
            {
              id: "rules",
              label: "Regras",
              render: (row) => `Ajuste ${row.warrantyAdjustmentPeriodDays}d · Execução ${row.warrantyExecutionPeriodDays}d`,
            },
          ]}
          defaultColumnIds={["name", "code", "status", "rules"]}
          emptyFilters={{ name: "", code: "", status: "" }}
          emptyMessage="Nenhuma conta encontrada para os filtros informados."
          excelFileName="contas.csv"
          filterFields={[
            { id: "name", label: "Nome", lookup: true, placeholder: "Nome já cadastrado" },
            { id: "code", label: "Código" },
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "active", label: "Ativas" },
                { value: "inactive", label: "Inativas" },
              ],
            },
          ]}
          loading={loading}
          canInactivate={(row) => row.status !== "inactive" && row.id === session?.tenantId}
          onCreate={openCreateWorkspace}
          onEdit={openEditWorkspace}
          onInactivate={(row) => {
            void handleInactivateConta(row);
          }}
          records={companies}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={companyLookupOptions}
          searchPlaceholder="Buscar por nome"
          title="Contas"
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            {showCreateForm ? (
              <form className="form-grid" onSubmit={handleCreate}>
                <h3>Nova conta</h3>
                <CompanyFormFields
                  duplicateGuard={
                    <MasterDataDuplicateGuard
                      entityLabel="conta"
                      match={
                        companyDuplicateMatch
                          ? {
                              id: companyDuplicateMatch.id,
                              title: companyDuplicateMatch.displayName,
                              subtitle: `${companyDuplicateMatch.code} · ${companyDuplicateMatch.legalName}`,
                            }
                          : null
                      }
                      onCancel={() => {
                        setForm((current) => ({ ...current, code: "" }));
                        clearCompanyDuplicate();
                      }}
                      onEdit={companyDuplicateMatch ? () => handleSelectCompany(companyDuplicateMatch) : undefined}
                      onView={companyDuplicateMatch ? () => handleSelectCompany(companyDuplicateMatch) : undefined}
                      status={companyDuplicateStatus}
                    />
                  }
                  form={form}
                  onCodeBlur={handleCompanyCodeBlur}
                  onCodeChange={() => clearCompanyDuplicate()}
                  setForm={setForm}
                />
                <div className="button-row">
                  <button className="button" disabled={saving || companyDuplicateStatus !== "idle"} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving || companyDuplicateStatus !== "idle"}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleCreate);
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
            ) : activeCompany ? (
              <div className="detail-stack">
                <h3>{activeCompany.displayName}</h3>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span>Status</span>
                    <strong>{contaStatusLabel(activeCompany.status)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>Código</span>
                    <strong>{activeCompany.code}</strong>
                  </div>
                  <div className="detail-field">
                    <span>Escopo atual</span>
                    <strong>{activeCompany.id === session?.tenantId ? "Conta ativa" : "Nova conta criada"}</strong>
                  </div>
                </div>

                <form className="form-grid" onSubmit={handleUpdate}>
                  <CompanyFormFields
                    duplicateGuard={
                      <MasterDataDuplicateGuard
                        entityLabel="conta"
                        match={
                          companyDuplicateMatch
                            ? {
                                id: companyDuplicateMatch.id,
                                title: companyDuplicateMatch.displayName,
                                subtitle: `${companyDuplicateMatch.code} · ${companyDuplicateMatch.legalName}`,
                              }
                            : null
                        }
                        onCancel={() => {
                          setForm((current) => ({ ...current, code: activeCompany.code }));
                          clearCompanyDuplicate();
                        }}
                        onEdit={companyDuplicateMatch ? () => handleSelectCompany(companyDuplicateMatch) : undefined}
                        onView={companyDuplicateMatch ? () => handleSelectCompany(companyDuplicateMatch) : undefined}
                        status={companyDuplicateStatus}
                      />
                    }
                    form={form}
                    onCodeBlur={handleCompanyCodeBlur}
                    onCodeChange={() => clearCompanyDuplicate()}
                    setForm={setForm}
                  />
                  <div className="button-row">
                    <button
                      className="button"
                      disabled={saving || activeCompany.id !== session?.tenantId || !canWrite || companyDuplicateStatus !== "idle"}
                      type="submit"
                    >
                      {saving ? "Gravando…" : "Gravar"}
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || activeCompany.id !== session?.tenantId || !canWrite || companyDuplicateStatus !== "idle"}
                      onClick={(event) => {
                        requestCadastroContinue(event, handleUpdate);
                      }}
                      type="button"
                    >
                      {saving ? "Gravando…" : "Gravar e Continuar"}
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || !canWrite || activeCompany.id !== session?.tenantId || activeCompany.status === "active"}
                      onClick={() => void handleStatus("activate")}
                      type="button"
                    >
                      Ativar
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || !canWrite || activeCompany.id !== session?.tenantId || activeCompany.status === "inactive"}
                      onClick={() => void handleStatus("deactivate")}
                      type="button"
                    >
                      Desativar
                    </button>
                    <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                      Voltar para a lista
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="empty-state">{loading ? "Carregando…" : "Conta não encontrada."}</div>
            )}
          </article>
        </section>
      )}
    </>
  );
}

function CompanyFormFields({
  duplicateGuard,
  form,
  onCodeBlur,
  onCodeChange,
  setForm,
}: {
  duplicateGuard?: ReactNode;
  form: CompanyForm;
  onCodeBlur?: () => void;
  onCodeChange?: () => void;
  setForm: Dispatch<SetStateAction<CompanyForm>>;
}) {
  return (
    <>
      <label className="field">
        <span>Código</span>
        <input
          required
          value={form.code}
          onBlur={onCodeBlur}
          onChange={(event) => {
            onCodeChange?.();
            setForm((current) => ({ ...current, code: event.target.value }));
          }}
        />
      </label>
      {duplicateGuard}
      <label className="field">
        <span>Razão social</span>
        <input required value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Nome exibido</span>
        <input required value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Prazo de ajuste em garantia (dias)</span>
        <input
          inputMode="numeric"
          value={form.warrantyAdjustmentPeriodDays}
          onChange={(event) => setForm((current) => ({ ...current, warrantyAdjustmentPeriodDays: event.target.value }))}
        />
      </label>
      <label className="field">
        <span>Prazo de defeito de execução (dias)</span>
        <input
          inputMode="numeric"
          value={form.warrantyExecutionPeriodDays}
          onChange={(event) => setForm((current) => ({ ...current, warrantyExecutionPeriodDays: event.target.value }))}
        />
      </label>
      <label className="field field--checkbox">
        <span>Bloquear entrega com saldo</span>
        <input
          checked={form.blockDeliveryWithOutstandingBalance}
          onChange={(event) => setForm((current) => ({ ...current, blockDeliveryWithOutstandingBalance: event.target.checked }))}
          type="checkbox"
        />
      </label>
      <label className="field">
        <span>Alerta de atraso (horas antes do prazo)</span>
        <input
          inputMode="numeric"
          value={form.delayAlertLeadHours}
          onChange={(event) => setForm((current) => ({ ...current, delayAlertLeadHours: event.target.value.replace(/\D/g, "") }))}
        />
      </label>
      <label className="field">
        <span>Grau 1 (minutos)</span>
        <input inputMode="numeric" value={form.grade1Minutes} onChange={(event) => setForm((current) => ({ ...current, grade1Minutes: event.target.value.replace(/\D/g, "") }))} />
      </label>
      <label className="field">
        <span>Grau 2 (minutos)</span>
        <input inputMode="numeric" value={form.grade2Minutes} onChange={(event) => setForm((current) => ({ ...current, grade2Minutes: event.target.value.replace(/\D/g, "") }))} />
      </label>
      <label className="field">
        <span>Grau 3 (minutos)</span>
        <input inputMode="numeric" value={form.grade3Minutes} onChange={(event) => setForm((current) => ({ ...current, grade3Minutes: event.target.value.replace(/\D/g, "") }))} />
      </label>
      <label className="field">
        <span>Grau 4 (minutos)</span>
        <input inputMode="numeric" value={form.grade4Minutes} onChange={(event) => setForm((current) => ({ ...current, grade4Minutes: event.target.value.replace(/\D/g, "") }))} />
      </label>
      <p className="field__hint">O padrão é 30, 60, 90 e 180 minutos. O alerta avisa a OS que ainda não está pronta para retirada.</p>
    </>
  );
}
