"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import {
  applyCollaboratorFilters,
  buildCollaboratorExcelCsv,
  COLLABORATOR_PROFILES,
  collaboratorProfileLabel,
  collaboratorProfileText,
  collaboratorStatusLabel,
  formatCollaboratorMoney,
  type CollaboratorProfile,
  type CollaboratorRecord,
} from "@/components/production/floor-collaborator-list";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { describeWorkspaceError, WorkspaceFlash } from "@/components/ui/workspace-flash";

type UserOption = { id: string; displayName: string; status: string };

type CollaboratorForm = {
  userId: string;
  profile: CollaboratorProfile | "";
  dailyRate: string;
  piecesPerDay: string;
  active: boolean;
};

const LIST_PATH = "/floor-collaborators";

function emptyForm(): CollaboratorForm {
  return { userId: "", profile: "tecnico", dailyRate: "0", piecesPerDay: "0", active: true };
}

function notifyCollaboratorsChanged() {
  window.dispatchEvent(new Event("anexsys:collaborators-changed"));
}

export function FloorCollaboratorsWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const pane = useWorkspacePane();
  const { isMobile } = useWorkspaceViewportMode();
  const { apiJson, hasAnyPermission } = useSession();
  const { closeWorkspace } = useWorkspaceManager();
  const canWrite = hasAnyPermission("floor_schedule.write");
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const prefillName = searchParams.get("prefillName") ?? "";
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusRecordId);
  const isListWorkspace = !isFormWorkspace;
  const [users, setUsers] = useState<UserOption[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm, hydrated] = useWorkspaceScopedState<CollaboratorForm>("floor-collaborators.form", emptyForm());
  const hydratedId = useRef<string | null>(null);
  const newSession = useRef<string | null>(null);
  const activeRecord = useMemo(
    () => collaborators.find((record) => record.id === focusRecordId) ?? null,
    [collaborators, focusRecordId],
  );
  const linkedUserIds = useMemo(() => new Set(collaborators.map((record) => record.userId)), [collaborators]);
  const availableUsers = useMemo(
    () => users.filter((person) => !linkedUserIds.has(person.id)),
    [linkedUserIds, users],
  );
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: workspaceMode === "new" ? "Colaboradores: Novo" : activeRecord ? `Colaboradores: ${activeRecord.displayName}` : "Colaboradores",
    subtitle: workspaceMode === "new" ? "Novo vínculo" : activeRecord ? collaboratorProfileText(activeRecord.profile) : null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const searchOptions = useMemo(
    () => collaborators.map((record) => ({ id: record.id, label: record.displayName, hint: collaboratorProfileText(record.profile) })),
    [collaborators],
  );

  const load = useCallback(async () => {
    if (!canWrite) {
      setUsers([]);
      setCollaborators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [people, registered] = await Promise.all([
        apiJson<UserOption[]>("/floor-schedule/candidates"),
        apiJson<CollaboratorRecord[]>("/floor-schedule/technicians"),
      ]);
      setUsers((Array.isArray(people) ? people : []).filter((person) => person.status === "active"));
      setCollaborators(Array.isArray(registered) ? registered : []);
    } catch (reason) {
      setUsers([]);
      setCollaborators([]);
      setFlash(describeWorkspaceError(reason, "O cadastro não abriu."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canWrite]);

  useEffect(() => {
    if (!isActivePane) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isActivePane, load]);

  useCadastroListRefresh(LIST_PATH, isListWorkspace && isActivePane, load);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (workspaceMode !== "new") {
      newSession.current = null;
      return;
    }
    const session = prefillName.trim();
    const match = availableUsers.find((person) => person.displayName.localeCompare(session, "pt-BR", { sensitivity: "base" }) === 0);
    if (newSession.current === session) {
      if (match) {
        setForm((current) => (current.userId ? current : { ...current, userId: match.id }));
      }
      return;
    }
    newSession.current = session;
    setForm({ ...emptyForm(), userId: match?.id ?? "" });
  }, [availableUsers, hydrated, prefillName, setForm, workspaceMode]);

  useEffect(() => {
    if (!hydrated || !focusRecordId || workspaceMode === "new") {
      hydratedId.current = null;
      return;
    }
    if (hydratedId.current === focusRecordId) {
      return;
    }
    const record = collaborators.find((item) => item.id === focusRecordId);
    if (!record) {
      return;
    }
    hydratedId.current = focusRecordId;
    setForm({
      userId: record.userId,
      profile: record.profile ?? "",
      dailyRate: String(record.dailyRate),
      piecesPerDay: String(record.piecesPerDay),
      active: record.status === "active",
    });
  }, [collaborators, focusRecordId, hydrated, setForm, workspaceMode]);

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams({ workspaceMode: "new" });
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `${LIST_PATH}?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Colaboradores: Novo", { cloneCurrent: false, subtitle: "Novo vínculo" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (record: CollaboratorRecord) => {
      const targetPath = `${LIST_PATH}?focusRecordId=${encodeURIComponent(record.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Colaboradores: ${record.displayName}`, {
        cloneCurrent: false,
        subtitle: collaboratorProfileText(record.profile),
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace(LIST_PATH);
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab(LIST_PATH, "Colaboradores", { cloneCurrent: false });
    window.setTimeout(() => closeWorkspace(closingTabId), 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishSave(intent: CadastroSaveIntent) {
    notifyCollaboratorsChanged();
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: LIST_PATH,
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace(LIST_PATH),
    });
  }

  async function handleSave(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!form.userId) {
      return;
    }
    if (!form.profile) {
      setFlash("Informe o perfil.");
      return;
    }
    const dailyRate = Number(form.dailyRate.replace(",", "."));
    const piecesPerDay = Number(form.piecesPerDay);
    if (!Number.isFinite(dailyRate) || dailyRate < 0 || dailyRate > 999999.99) {
      setFlash("Informe o valor da diária.");
      return;
    }
    if (!Number.isInteger(piecesPerDay) || piecesPerDay < 0 || piecesPerDay > 999) {
      setFlash("Informe a média de peças por dia.");
      return;
    }
    setSaving(true);
    setFlash(null);
    try {
      await apiJson<CollaboratorRecord[]>("/floor-schedule/collaborators", {
        method: "PUT",
        body: JSON.stringify({
          userId: form.userId,
          profile: form.profile,
          dailyRate,
          piecesPerDay,
          status: form.active ? "active" : "inactive",
        }),
      });
      setFlash(workspaceMode === "new" ? "Colaborador vinculado." : "Colaborador atualizado.");
      finishSave(intent);
    } catch (reason) {
      setFlash(describeWorkspaceError(reason, "O colaborador não foi gravado."));
    } finally {
      setSaving(false);
    }
  }

  const handleInactivate = useCallback(
    async (record: CollaboratorRecord) => {
      if (record.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar o vínculo de ${record.displayName}? A pessoa sai da grade.`)) {
        return;
      }
      setSaving(true);
      setFlash(null);
      try {
        await apiJson<CollaboratorRecord[]>(`/floor-schedule/technicians/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        notifyCollaboratorsChanged();
        setFlash("Colaborador foi inativado.");
        await load();
      } catch (reason) {
        setFlash(describeWorkspaceError(reason, "O vínculo não foi inativado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, load],
  );

  if (!canWrite) {
    return (
      <section className="mini-card">
        <h3>Colaboradores</h3>
        <p>Você não possui acesso aos colaboradores no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {isFormWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Operações</div>
          <h1 className="title">{workspaceMode === "new" ? "Novo colaborador" : "Alterar colaborador"}</h1>
          <p>
            O vínculo guarda o perfil, o valor da diária e a média de peças. A diária e as peças entram na grade só para o Técnico. Ao gravar, o perfil passa a valer no acesso dessa pessoa.
          </p>
        </section>
      ) : null}

      {flash ? <WorkspaceFlash message={flash} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyCollaboratorFilters}
          buildExcelCsv={buildCollaboratorExcelCsv}
          canInactivate={(row) => row.status !== "inactive"}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.floor-collaborators.grid-columns.v1"
          columns={[
            { id: "name", label: "Pessoa", locked: true, render: (row) => <strong>{row.displayName}</strong> },
            { id: "profile", label: "Perfil", render: (row) => collaboratorProfileText(row.profile) },
            { id: "dailyRate", label: "Diária", render: (row) => formatCollaboratorMoney(row.dailyRate) },
            { id: "pieces", label: "Peças por dia", render: (row) => row.piecesPerDay },
            {
              id: "status",
              label: "Situação",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {collaboratorStatusLabel(row.status)}
                </span>
              ),
            },
          ]}
          defaultColumnIds={["name", "profile", "dailyRate", "pieces", "status"]}
          emptyFilters={{ q: "", profile: "", status: "" }}
          emptyMessage="Nenhum colaborador vinculado."
          excelFileName="colaboradores.csv"
          filterFields={[
            {
              id: "profile",
              kind: "select",
              label: "Perfil",
              options: [
                { value: "", label: "Todos" },
                ...COLLABORATOR_PROFILES.map((profile) => ({ value: profile, label: collaboratorProfileLabel[profile] })),
                { value: "none", label: "Sem perfil" },
              ],
            },
            {
              id: "status",
              kind: "select",
              label: "Situação",
              options: [
                { value: "", label: "Todas" },
                { value: "active", label: "Ativo" },
                { value: "inactive", label: "Inativo" },
              ],
            },
          ]}
          loading={loading}
          onCreate={openCreateWorkspace}
          onEdit={openEditWorkspace}
          onInactivate={(row) => void handleInactivate(row)}
          records={collaborators}
          rowLabel={(row) => row.displayName}
          searchKey="q"
          searchOptions={searchOptions}
          searchPlaceholder="Nome do colaborador"
          title="Colaboradores"
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <form className="form-grid" onSubmit={(event) => void handleSave(event)}>
              <h3>{workspaceMode === "new" ? "Novo vínculo" : "Alterar vínculo"}</h3>
              {workspaceMode === "new" ? (
                <label className="field">
                  <span>Pessoa</span>
                  <select
                    onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
                    required
                    value={form.userId}
                  >
                    <option value="">Escolher</option>
                    {availableUsers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field">
                  <span>Pessoa</span>
                  <input readOnly value={activeRecord?.displayName ?? ""} />
                </label>
              )}
              {workspaceMode === "new" && !loading && availableUsers.length === 0 ? (
                <p>Todos os usuários ativos já estão vinculados. Use Alterar na grade para mudar a diária ou o perfil.</p>
              ) : null}
              <label className="field">
                <span>Perfil</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, profile: event.target.value as CollaboratorProfile | "" }))}
                  required
                  value={form.profile}
                >
                  <option value="">Escolher</option>
                  {COLLABORATOR_PROFILES.map((profile) => (
                    <option key={profile} value={profile}>
                      {collaboratorProfileLabel[profile]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor da diária</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setForm((current) => ({ ...current, dailyRate: event.target.value }))}
                  required
                  value={form.dailyRate}
                />
              </label>
              <label className="field">
                <span>Média de peças por dia</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setForm((current) => ({ ...current, piecesPerDay: event.target.value }))}
                  required
                  value={form.piecesPerDay}
                />
              </label>
              <label className="field field--checkbox">
                <input
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  type="checkbox"
                />
                <span>Ativo</span>
              </label>
              <p>A diária e a média de peças entram na grade de planejamento só quando o perfil é Técnico.</p>
              <div className="button-row">
                <button className="button" disabled={saving || !form.userId || !form.profile} type="submit">
                  {saving ? "Gravando…" : "Gravar"}
                </button>
                <button
                  className="button-secondary"
                  disabled={saving || !form.userId || !form.profile}
                  onClick={(event) => requestCadastroContinue(event, handleSave)}
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
