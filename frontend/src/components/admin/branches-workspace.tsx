"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { applyFilialListFilters, buildFilialExcelCsv, filialStatusLabel } from "@/components/admin/filial-list";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { empresaLabel } from "@/components/providers/session-context";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash } from "@/components/ui/workspace-flash";
import { type SmartLookupOption } from "@/components/ui/smart-lookup";
import { DependencyGuardPanel, type DependencyValidationResult } from "@/components/ui/dependency-guard-panel";

type BranchRecord = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  status: "active" | "inactive";
  businessCalendarName: string | null;
  companyId?: string;
  timezone?: string;
  isDefault?: boolean;
};

type HoursDay = {
  weekday: number;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  cutoffAt: string | null;
};

type BranchForm = {
  code: string;
  legalName: string;
  displayName: string;
  businessCalendarName: string;
  companyId: string;
};

const emptyForm = (): BranchForm => ({
  code: "",
  legalName: "",
  displayName: "",
  businessCalendarName: "",
  companyId: "",
});

function mapBranchToForm(branch: BranchRecord): BranchForm {
  return {
    code: branch.code,
    legalName: branch.legalName,
    displayName: branch.displayName,
    businessCalendarName: branch.businessCalendarName ?? "",
    companyId: branch.companyId ?? "",
  };
}

export function BranchesWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { isMobile } = useWorkspaceViewportMode();
  const { hasAnyPermission, apiJson, session } = useSession();
  const activeEmpresaId = session?.activeEmpresaId ?? null;
  const empresas = session?.empresas ?? [];
  const activeEmpresa = empresas.find((empresa) => empresa.id === activeEmpresaId) ?? null;
  const canRead = hasAnyPermission("branches.read");
  const canWrite = hasAnyPermission("branches.write");
  const workspaceMode = searchParams.get("workspaceMode");
  const focusBranchId = searchParams.get("focusBranchId");
  const prefillName = searchParams.get("prefillName") ?? "";
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useWorkspaceScopedState<string | null>("branches.activeBranchId", null);
  const [showCreateForm, setShowCreateForm] = useWorkspaceScopedState("branches.showCreateForm", false);
  const [form, setForm] = useWorkspaceScopedState<BranchForm>("branches.form", emptyForm());
  const [dependencyValidation, setDependencyValidation] = useState<DependencyValidationResult | null>(null);
  const [hours, setHours] = useState<{ timezone: string; days: HoursDay[] } | null>(null);
  const [hoursSaving, setHoursSaving] = useState(false);

  const branchLookupOptions = useMemo<SmartLookupOption[]>(
    () =>
      branches.map((branch) => ({
        id: branch.id,
        label: branch.displayName,
        hint: `${branch.code} · ${filialStatusLabel(branch.status)}`,
      })),
    [branches],
  );

  const activeBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId) ?? null, [activeBranchId, branches]);
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusBranchId);
  const isListWorkspace = !isFormWorkspace;
  const { closeWorkspace } = useWorkspaceManager();
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: showCreateForm ? "Filial: Nova" : activeBranch ? `Filial: ${activeBranch.displayName}` : "Filiais",
    subtitle: showCreateForm ? "Novo cadastro" : activeBranch?.code ?? null,
  });

  const loadHours = useCallback(async (branchId: string) => {
    try {
      const record = await apiJson<{ timezone: string; days: HoursDay[] }>(`/branches/${branchId}/operating-hours`);
      setHours({
        timezone: record.timezone,
        days: record.days.map((day) => ({
          ...day,
          opensAt: day.opensAt?.slice(0, 5) ?? null,
          closesAt: day.closesAt?.slice(0, 5) ?? null,
          cutoffAt: day.cutoffAt?.slice(0, 5) ?? null,
        })),
      });
    } catch {
      setHours(null);
    }
  }, [apiJson, setHours]);

  const loadBranches = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const path = activeEmpresaId ? `/branches?companyId=${encodeURIComponent(activeEmpresaId)}` : "/branches";
      const records = await apiJson<BranchRecord[]>(path);
      setBranches(records);
      setMessage(null);
      setDependencyValidation(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "As filiais não puderam ser carregadas.");
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, apiJson, canRead, setBranches, setMessage]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadBranches();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadBranches]);

  useCadastroListRefresh("/admin/branches", isListWorkspace, loadBranches);

  const openCreateForm = useCallback(
    (name?: string) => {
      setShowCreateForm(true);
      setActiveBranchId(null);
      setHours(null);
      setForm({
        ...emptyForm(),
        companyId: activeEmpresaId ?? "",
        displayName: name?.trim() ?? "",
        legalName: name?.trim() ?? "",
      });
    },
    [activeEmpresaId, setActiveBranchId, setForm, setShowCreateForm],
  );

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `/admin/branches?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Filial: Nova", { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (branch: Pick<BranchRecord, "id" | "displayName" | "code">) => {
      const targetPath = `/admin/branches?focusBranchId=${encodeURIComponent(branch.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Filial: ${branch.displayName}`, {
        cloneCurrent: false,
        subtitle: branch.code,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/admin/branches");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/admin/branches", "Filiais", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishBranchSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/admin/branches",
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace("/admin/branches"),
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
    if (!focusBranchId || workspaceMode === "new") {
      return;
    }
    const branch = branches.find((item) => item.id === focusBranchId);
    if (!branch) {
      return;
    }
    setShowCreateForm(false);
    setActiveBranchId(branch.id);
    setForm(mapBranchToForm(branch));
    void loadHours(branch.id);
  }, [branches, focusBranchId, loadHours, setActiveBranchId, setForm, setShowCreateForm, workspaceMode]);

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }
    setShowCreateForm(false);
    setActiveBranchId(null);
  }, [isListWorkspace, setActiveBranchId, setShowCreateForm]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setMessage(null);
    setDependencyValidation(null);
    try {
      const created = await apiJson<BranchRecord>("/branches", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          legalName: form.legalName,
          displayName: form.displayName,
          businessCalendarName: form.businessCalendarName || undefined,
          companyId: form.companyId || activeEmpresaId || undefined,
        }),
      });
      setBranches((current) => [...current, created].sort((left, right) => left.displayName.localeCompare(right.displayName)));
      setMessage("Filial criada com sucesso.");
      finishBranchSave(intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A filial não pôde ser criada.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite || !activeBranch) return;
    setSaving(true);
    setMessage(null);
    setDependencyValidation(null);
    try {
      const updated = await apiJson<BranchRecord>(`/branches/${activeBranch.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          code: form.code,
          legalName: form.legalName,
          displayName: form.displayName,
          businessCalendarName: form.businessCalendarName || null,
          companyId: form.companyId || undefined,
        }),
      });
      setBranches((current) => current.map((branch) => (branch.id === updated.id ? updated : branch)));
      setMessage("Filial atualizada com sucesso.");
      finishBranchSave(intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A filial não pôde ser atualizada.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(action: "activate" | "deactivate") {
    if (!canWrite || !activeBranch) return;
    setSaving(true);
    setMessage(null);
    setDependencyValidation(null);
    try {
      if (action === "deactivate") {
        const validation = await apiJson<DependencyValidationResult>(`/branches/${activeBranch.id}/dependency-check?action=deactivate`);
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return;
        }
      }
      const updated = await apiJson<BranchRecord>(`/branches/${activeBranch.id}/${action}`, { method: "POST" });
      setBranches((current) => current.map((branch) => (branch.id === updated.id ? updated : branch)));
      setMessage(action === "activate" ? "Filial ativada." : "Filial desativada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O status da filial não pôde ser alterado.");
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateBranch = useCallback(
    async (branch: BranchRecord) => {
      if (branch.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar ${branch.displayName}? Ela some do combo, mas continua na lista.`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(`/branches/${branch.id}/dependency-check?action=deactivate`);
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return;
        }
        const updated = await apiJson<BranchRecord>(`/branches/${branch.id}/deactivate`, { method: "POST" });
        setBranches((current) => current.map((record) => (record.id === updated.id ? updated : record)));
        setMessage(`${branch.displayName} foi inativada.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "A filial não pôde ser inativada.");
      } finally {
        setSaving(false);
      }
    },
    [apiJson],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Filiais indisponíveis</h3>
        <p>Você não possui acesso ao cadastro de filiais no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Administração</div>
          <h1 className="title">{showCreateForm ? "Nova filial" : activeBranch ? activeBranch.displayName : "Filial"}</h1>
          <p>
            A Filial é filha da Empresa. Não existe Filial pai: unidades da mesma Empresa ficam no mesmo nível. Clientes
            e medidas são da Conta. Troque a Empresa no contexto ao lado para ver e cadastrar as filiais dela
            {activeEmpresa ? ` (${empresaLabel(activeEmpresa)})` : ""}.
          </p>
        </section>
      ) : null}

      {dependencyValidation && !dependencyValidation.allowed ? <DependencyGuardPanel validation={dependencyValidation} /> : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyFilialListFilters}
          buildExcelCsv={buildFilialExcelCsv}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.filiais.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Filial",
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
              render: (row) => <span className={`status-chip status-chip--${row.status}`}>{filialStatusLabel(row.status)}</span>,
            },
            { id: "calendar", label: "Calendário", render: (row) => row.businessCalendarName ?? "—" },
            { id: "default", label: "Padrão", render: (row) => (row.isDefault ? "Sim" : "Não") },
          ]}
          defaultColumnIds={["name", "code", "status", "calendar"]}
          emptyFilters={{ name: "", code: "", status: "" }}
          emptyMessage="Nenhuma filial encontrada para os filtros informados."
          excelFileName="filiais.csv"
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
          canInactivate={(row) => row.status !== "inactive"}
          onCreate={openCreateWorkspace}
          onEdit={openEditWorkspace}
          onInactivate={(row) => {
            void handleInactivateBranch(row);
          }}
          records={branches}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={branchLookupOptions}
          searchPlaceholder="Buscar por nome"
          title="Filiais"
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            {showCreateForm ? (
              <form className="form-grid" onSubmit={handleCreate}>
                <h3>Nova filial</h3>
                <BranchFormFields empresas={empresas} form={form} setForm={setForm} />
                <div className="button-row">
                  <button className="button" disabled={saving} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving}
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
            ) : activeBranch ? (
              <div className="detail-stack">
                <h3>{activeBranch.displayName}</h3>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span>Status</span>
                    <strong>{filialStatusLabel(activeBranch.status)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>Código</span>
                    <strong>{activeBranch.code}</strong>
                  </div>
                  <div className="detail-field">
                    <span>Empresa</span>
                    <strong>{activeEmpresa ? empresaLabel(activeEmpresa) : "—"}</strong>
                  </div>
                </div>

                <form className="form-grid" onSubmit={handleUpdate}>
                  <BranchFormFields empresas={empresas} form={form} setForm={setForm} />
                  <div className="button-row">
                    <button className="button" disabled={saving || !canWrite} type="submit">
                      {saving ? "Gravando…" : "Gravar"}
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || !canWrite}
                      onClick={(event) => {
                        requestCadastroContinue(event, handleUpdate);
                      }}
                      type="button"
                    >
                      {saving ? "Gravando…" : "Gravar e Continuar"}
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || !canWrite || activeBranch.status === "active"}
                      onClick={() => void handleStatus("activate")}
                      type="button"
                    >
                      Ativar
                    </button>
                    <button
                      className="button-secondary"
                      disabled={saving || !canWrite || activeBranch.status === "inactive"}
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

                <BranchHoursEditor
                  canWrite={canWrite}
                  hours={hours}
                  saving={hoursSaving}
                  onChange={setHours}
                  onSave={async () => {
                    if (!activeBranch || !hours) return;
                    setHoursSaving(true);
                    setMessage(null);
                    try {
                      const saved = await apiJson<{ timezone: string; days: HoursDay[] }>(
                        `/branches/${activeBranch.id}/operating-hours`,
                        {
                          method: "PUT",
                          body: JSON.stringify(hours),
                        },
                      );
                      setHours({
                        timezone: saved.timezone || hours.timezone,
                        days: saved.days.map((day) => ({
                          ...day,
                          opensAt: day.opensAt?.slice(0, 5) ?? null,
                          closesAt: day.closesAt?.slice(0, 5) ?? null,
                          cutoffAt: day.cutoffAt?.slice(0, 5) ?? null,
                        })),
                      });
                      setMessage("Horário e hora de corte da Filial atualizados.");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "O horário não pôde ser salvo.");
                    } finally {
                      setHoursSaving(false);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="empty-state">{loading ? "Carregando…" : "Filial não encontrada."}</div>
            )}
          </article>
        </section>
      )}
    </>
  );
}

function BranchFormFields({
  empresas,
  form,
  setForm,
}: {
  empresas: { id: string; legalName: string; tradeName: string | null; isDefault: boolean }[];
  form: BranchForm;
  setForm: Dispatch<SetStateAction<BranchForm>>;
}) {
  return (
    <>
      {empresas.length > 0 ? (
        <label className="field">
          <span>Empresa</span>
          <select
            required
            value={form.companyId}
            onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}
          >
            <option value="">Selecione a Empresa</option>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>
                {empresaLabel(empresa)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>Código</span>
        <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
      </label>
      <label className="field">
        <span>Razão social</span>
        <input required value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Nome exibido</span>
        <input required value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
      </label>
      <label className="field">
        <span>Calendário operacional</span>
        <input value={form.businessCalendarName} onChange={(event) => setForm((current) => ({ ...current, businessCalendarName: event.target.value }))} />
      </label>
    </>
  );
}

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function BranchHoursEditor({
  hours,
  canWrite,
  saving,
  onChange,
  onSave,
}: {
  hours: { timezone: string; days: HoursDay[] } | null;
  canWrite: boolean;
  saving: boolean;
  onChange: (value: { timezone: string; days: HoursDay[] }) => void;
  onSave: () => void;
}) {
  if (!hours) {
    return (
      <div className="mini-section">
        <h4>Horário de funcionamento</h4>
        <p>Carregando horário…</p>
      </div>
    );
  }

  return (
    <div className="mini-section">
      <h4>Horário de funcionamento e hora de corte</h4>
      <p>Fuso: {hours.timezone}. A hora de corte é o fechamento, salvo se você alterar.</p>
      {hours.days
        .slice()
        .sort((left, right) => left.weekday - right.weekday)
        .map((day) => (
          <div className="filters-grid" key={day.weekday}>
            <label className="field">
              <span>{WEEKDAY_LABELS[day.weekday]}</span>
              <select
                disabled={!canWrite}
                value={day.isOpen ? "open" : "closed"}
                onChange={(event) => {
                  const isOpen = event.target.value === "open";
                  onChange({
                    ...hours,
                    days: hours.days.map((item) =>
                      item.weekday === day.weekday
                        ? {
                            ...item,
                            isOpen,
                            opensAt: isOpen ? item.opensAt ?? "09:30" : null,
                            closesAt: isOpen ? item.closesAt ?? "18:00" : null,
                            cutoffAt: isOpen ? item.cutoffAt ?? item.closesAt ?? "18:00" : null,
                          }
                        : item,
                    ),
                  });
                }}
              >
                <option value="open">Aberta</option>
                <option value="closed">Fechada</option>
              </select>
            </label>
            <label className="field">
              <span>Abre</span>
              <input
                disabled={!canWrite || !day.isOpen}
                type="time"
                value={day.opensAt ?? ""}
                onChange={(event) =>
                  onChange({
                    ...hours,
                    days: hours.days.map((item) =>
                      item.weekday === day.weekday ? { ...item, opensAt: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Fecha / corte</span>
              <input
                disabled={!canWrite || !day.isOpen}
                type="time"
                value={day.closesAt ?? ""}
                onChange={(event) =>
                  onChange({
                    ...hours,
                    days: hours.days.map((item) =>
                      item.weekday === day.weekday
                        ? { ...item, closesAt: event.target.value, cutoffAt: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
      {canWrite ? (
        <div className="button-row">
          <button className="button-secondary" disabled={saving} onClick={() => void onSave()} type="button">
            {saving ? "Salvando…" : "Salvar horário"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

