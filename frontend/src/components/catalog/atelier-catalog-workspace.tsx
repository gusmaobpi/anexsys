"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import {
  applyAtelierCatalogFilters,
  atelierCatalogStatusLabel,
  buildAtelierCatalogExcelCsv,
  type AtelierCatalogRecord,
} from "@/components/catalog/atelier-catalog-list";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { DependencyGuardPanel, type DependencyValidationResult } from "@/components/ui/dependency-guard-panel";
import { MasterDataDuplicateGuard, normalizeBodyPartCodeValue } from "@/components/ui/master-data-duplicate-guard";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type WorkspaceMode = "products" | "services";

type CatalogForm = {
  displayName: string;
  defaultPrice: string;
  sortOrder: string;
  difficultyGrade: string;
};

type Props = {
  mode: WorkspaceMode;
};

const emptyForm = (): CatalogForm => ({
  displayName: "",
  defaultPrice: "",
  sortOrder: "0",
  difficultyGrade: "",
});

function toListRecord(record: {
  id: string;
  code?: string;
  displayName: string;
  defaultPrice?: string | null;
  sortOrder: number;
  status?: "active" | "inactive";
  difficultyGrade?: number | null;
}): AtelierCatalogRecord {
  return {
    id: record.id,
    code: record.code ?? "",
    displayName: record.displayName,
    defaultPrice: record.defaultPrice ?? null,
    sortOrder: record.sortOrder,
    status: record.status === "inactive" ? "inactive" : "active",
    difficultyGrade: record.difficultyGrade ?? null,
  };
}

export function AtelierCatalogWorkspace({ mode }: Props) {
  const searchParams = useWorkspaceSearchParams();
  const { hasAnyPermission, apiJson } = useSession();
  const { isMobile } = useWorkspaceViewportMode();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const prefillName = searchParams.get("prefillName") ?? "";
  const canRead = hasAnyPermission("service_orders.read");
  const canWrite = hasAnyPermission("service_orders.write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<AtelierCatalogRecord[]>([]);
  const [form, setForm] = useWorkspaceScopedState<CatalogForm>(`atelier-catalog.${mode}.form`, emptyForm());
  const [duplicateStatus, setDuplicateStatus] = useState<"idle" | "checking" | "duplicate">("idle");
  const [duplicateMatch, setDuplicateMatch] = useState<AtelierCatalogRecord | null>(null);
  const [dependencyValidation, setDependencyValidation] = useState<DependencyValidationResult | null>(null);

  const config = useMemo(
    () =>
      mode === "products"
        ? {
            title: "Produtos",
            description: "Tipos de peça usados na OS: calça, saia, vestido, terno e os demais.",
            endpoint: "/garment-products",
            entityLabel: "produto",
            createLabel: "Produto: Novo",
          }
        : {
            title: "Serviços",
            description: "O que se faz na peça. O preço fica no cadastro Preços, no par produto + serviço.",
            endpoint: "/atelier-services",
            entityLabel: "serviço",
            createLabel: "Serviço: Novo",
          },
    [mode],
  );
  const basePath = mode === "products" ? "/products" : "/services";
  const { closeWorkspace } = useWorkspaceManager();
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusRecordId);
  const isListWorkspace = !isFormWorkspace;
  const activeRecord = useMemo(
    () => records.find((record) => record.id === focusRecordId) ?? null,
    [focusRecordId, records],
  );
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: workspaceMode === "new" ? config.createLabel : activeRecord ? `${config.title}: ${activeRecord.displayName}` : config.title,
    subtitle: workspaceMode === "new" ? "Novo cadastro" : activeRecord?.code || null,
  });

  const recordLookupOptions = useMemo(
    () =>
      records.map((record) => ({
        id: record.id,
        label: record.displayName,
        hint: record.code || undefined,
      })),
    [records],
  );

  const loadRecords = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiJson<Array<{
        id: string;
        code?: string;
        displayName: string;
        defaultPrice?: string | null;
        sortOrder: number;
        status?: "active" | "inactive";
      }>>(config.endpoint);
      setRecords(response.map(toListRecord));
      setMessage(null);
    } catch (error) {
      setRecords([]);
      setMessage(describeWorkspaceError(error, `Os ${config.title.toLowerCase()} não puderam ser carregados.`));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead, config.endpoint, config.title]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRecords();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRecords]);

  useCadastroListRefresh(basePath, isListWorkspace, loadRecords);

  const clearDuplicate = useCallback(() => {
    setDuplicateStatus("idle");
    setDuplicateMatch(null);
  }, []);

  const checkDuplicate = useCallback(() => {
    setDuplicateStatus("checking");
    const duplicate =
      records.find((record) => {
        if (record.id === focusRecordId) {
          return false;
        }
        return normalizeBodyPartCodeValue(record.displayName) === normalizeBodyPartCodeValue(form.displayName);
      }) ?? null;
    setDuplicateMatch(duplicate);
    setDuplicateStatus(duplicate ? "duplicate" : "idle");
  }, [focusRecordId, form.displayName, records]);

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `${basePath}?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, config.createLabel, { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [basePath, config.createLabel, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (record: Pick<AtelierCatalogRecord, "id" | "displayName" | "code">) => {
      const targetPath = `${basePath}?focusRecordId=${encodeURIComponent(record.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `${config.title}: ${record.displayName}`, {
        cloneCurrent: false,
        subtitle: record.code || null,
      });
    },
    [basePath, config.title, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace(basePath);
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab(basePath, config.title, { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [basePath, closeWorkspace, config.title, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishCatalogSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: basePath,
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace(basePath),
    });
  }

  const handleInactivateRecord = useCallback(
    async (record: AtelierCatalogRecord) => {
      if (record.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar ${record.displayName}? Some das OS novas, mas continua nesta lista.`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(
          `${config.endpoint}/${record.id}/dependency-check?action=inactivate`,
        );
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return;
        }
        const updated = await apiJson<{
          id: string;
          code?: string;
          displayName: string;
          defaultPrice?: string | null;
          sortOrder: number;
          status?: "active" | "inactive";
        }>(`${config.endpoint}/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setRecords((current) => current.map((item) => (item.id === updated.id ? toListRecord(updated) : item)));
        setMessage(`${record.displayName} foi inativado.`);
      } catch (error) {
        setMessage(describeWorkspaceError(error, `O ${config.entityLabel} não pôde ser inativado.`));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, config.endpoint, config.entityLabel],
  );

  const handleDeleteRecord = useCallback(
    async (record: AtelierCatalogRecord, options: { skipConfirm?: boolean } = {}) => {
      if (
        !options.skipConfirm &&
        !window.confirm(`Excluir ${record.displayName}? Só é possível se nenhuma OS usar este cadastro.`)
      ) {
        return false;
      }
      setSaving(true);
      setMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(
          `${config.endpoint}/${record.id}/dependency-check?action=delete`,
        );
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return false;
        }
        await apiJson(`${config.endpoint}/${record.id}`, { method: "DELETE" });
        setRecords((current) => current.filter((item) => item.id !== record.id));
        setMessage(`${record.displayName} foi excluído da lista.`);
        return true;
      } catch (error) {
        setMessage(describeWorkspaceError(error, `O ${config.entityLabel} não pôde ser excluído.`));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [apiJson, config.endpoint, config.entityLabel],
  );

  const handleDeleteRecords = useCallback(
    async (selected: AtelierCatalogRecord[]) => {
      if (selected.length === 0) {
        return;
      }
      if (!window.confirm(`Excluir ${selected.length} registro(s) selecionado(s)? Só é possível se nenhuma OS usar.`)) {
        return;
      }
      let deleted = 0;
      for (const record of selected) {
        const ok = await handleDeleteRecord(record, { skipConfirm: true });
        if (ok) {
          deleted += 1;
        } else {
          break;
        }
      }
      if (deleted > 1) {
        setMessage(`${deleted} registro(s) foram excluídos da lista.`);
      }
    },
    [handleDeleteRecord],
  );

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setForm({ ...emptyForm(), displayName: prefillName.trim() });
      clearDuplicate();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [clearDuplicate, prefillName, setForm, workspaceMode]);

  useEffect(() => {
    if (!focusRecordId || workspaceMode === "new") {
      return;
    }
    const record = records.find((item) => item.id === focusRecordId);
    if (!record) {
      return;
    }
    setForm({
      displayName: record.displayName,
      defaultPrice: record.defaultPrice ?? "",
      sortOrder: String(record.sortOrder ?? 0),
      difficultyGrade: record.difficultyGrade ? String(record.difficultyGrade) : "",
    });
    clearDuplicate();
  }, [clearDuplicate, focusRecordId, records, setForm, workspaceMode]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite) return;
    if (duplicateStatus !== "idle") {
      setMessage("Revise a duplicidade detectada antes de salvar o cadastro.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<{
        id: string;
        code?: string;
        displayName: string;
        defaultPrice?: string | null;
        sortOrder: number;
      }>(config.endpoint, {
        method: "POST",
        body: JSON.stringify({
          displayName: form.displayName,
          sortOrder: Number(form.sortOrder || 0),
          ...(mode === "services" ? { difficultyGrade: form.difficultyGrade ? Number(form.difficultyGrade) : null } : {}),
        }),
      });
      const mapped = toListRecord(created);
      setRecords((current) =>
        [...current, mapped].sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName)),
      );
      setMessage(mode === "products" ? "Produto criado." : "Serviço criado.");
      finishCatalogSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, `O ${config.entityLabel} não pôde ser criado.`));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite || !activeRecord) return;
    if (duplicateStatus !== "idle") {
      setMessage("Revise a duplicidade detectada antes de salvar o cadastro.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<{
        id: string;
        code?: string;
        displayName: string;
        defaultPrice?: string | null;
        sortOrder: number;
      }>(`${config.endpoint}/${activeRecord.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.displayName,
          sortOrder: Number(form.sortOrder || 0),
          ...(mode === "services" ? { difficultyGrade: form.difficultyGrade ? Number(form.difficultyGrade) : null } : {}),
        }),
      });
      const mapped = toListRecord(updated);
      setRecords((current) => current.map((record) => (record.id === mapped.id ? mapped : record)));
      setMessage(mode === "products" ? "Produto atualizado." : "Serviço atualizado.");
      finishCatalogSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, `O ${config.entityLabel} não pôde ser atualizado.`));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>{config.title} indisponíveis</h3>
        <p>Você não possui acesso ao cadastro de {config.title.toLowerCase()} no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Cadastros</div>
          <h1 className="title">{workspaceMode === "new" ? config.createLabel : activeRecord?.displayName ?? config.title}</h1>
          <p>{config.description}</p>
        </section>
      ) : null}

      {dependencyValidation && !dependencyValidation.allowed ? <DependencyGuardPanel validation={dependencyValidation} /> : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyAtelierCatalogFilters}
          importActions={[{ kind: mode === "products" ? "products" : "services" }]}
          onImported={async (message) => {
            setMessage(message);
            await loadRecords();
          }}
          buildExcelCsv={(rows) => buildAtelierCatalogExcelCsv(rows)}
          canInactivate={(row) => row.status !== "inactive"}
          canWrite={canWrite}
          columnStorageKey={`anexsys.frontend.${mode}.grid-columns.v1`}
          columns={[
            {
              id: "name",
              label: "Nome",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.displayName}</strong>
                  {row.code ? <div className="table-subtle">{row.code}</div> : null}
                </>
              ),
            },
            { id: "code", label: "Código", render: (row) => row.code || "—" },
            { id: "sortOrder", label: "Ordem", render: (row) => String(row.sortOrder) },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {atelierCatalogStatusLabel(row.status)}
                </span>
              ),
            },
          ]}
          defaultColumnIds={["name", "status"]}
          emptyFilters={{ name: "", code: "", status: "" }}
          emptyMessage="Nenhum registro encontrado para os filtros informados."
          excelFileName={mode === "products" ? "produtos.csv" : "servicos.csv"}
          filterFields={[
            { id: "name", label: "Nome", lookup: true, placeholder: "Nome já cadastrado" },
            { id: "code", label: "Código" },
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
          onDelete={(row) => {
            void handleDeleteRecord(row);
          }}
          onDeleteMany={(rows) => {
            void handleDeleteRecords(rows);
          }}
          onEdit={openEditWorkspace}
          onInactivate={(row) => {
            void handleInactivateRecord(row);
          }}
          records={records}
          rowLabel={(row) => row.displayName}
          searchKey="name"
          searchOptions={recordLookupOptions}
          searchPlaceholder="Buscar por nome"
          title={config.title}
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <form className="form-grid" onSubmit={workspaceMode === "new" ? handleCreate : handleUpdate}>
              <h3>{workspaceMode === "new" ? "Novo cadastro" : activeRecord?.displayName ?? "Alterar"}</h3>
              <label className="field">
                <span>{mode === "products" ? "Nome do produto" : "Nome do serviço"}</span>
                <input
                  required
                  placeholder={mode === "products" ? "Calça" : "Bainha"}
                  value={form.displayName}
                  onBlur={checkDuplicate}
                  onChange={(event) => {
                    clearDuplicate();
                    setForm((current) => ({ ...current, displayName: event.target.value }));
                  }}
                />
              </label>
              <MasterDataDuplicateGuard
                entityLabel={config.entityLabel}
                match={
                  duplicateMatch
                    ? {
                        id: duplicateMatch.id,
                        title: duplicateMatch.displayName,
                        subtitle: duplicateMatch.code,
                      }
                    : null
                }
                onCancel={() => {
                  clearDuplicate();
                  setForm((current) => ({ ...current, displayName: "" }));
                }}
                status={duplicateStatus}
                variant="warning"
              />
              <label className="field">
                <span>Ordem</span>
                <input
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                />
              </label>
              {mode === "services" ? (
                <label className="field">
                  <span>Grau de dificuldade</span>
                  <select
                    value={form.difficultyGrade}
                    onChange={(event) => setForm((current) => ({ ...current, difficultyGrade: event.target.value }))}
                  >
                    <option value="">Sem grau</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </label>
              ) : null}
              <div className="button-row">
                <button className="button" disabled={saving || duplicateStatus !== "idle"} type="submit">
                  {saving ? "Gravando…" : "Gravar"}
                </button>
                <button
                  className="button-secondary"
                  disabled={saving || duplicateStatus !== "idle"}
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
