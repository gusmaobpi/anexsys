"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getWorkspaceBasePath } from "@/components/app-shell/workspace-manager-store";
import { useWorkspaceManager, useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type Settings = {
  privacyNotice: string;
  acceptanceText: string;
  operatorTerms: string;
  incidentPlan: string;
  linkMarginDays: number;
  retentionInactiveYears: number;
  addressRetentionDays: number;
  subjectResponseDays: number;
  dpoName: string;
  dpoEmail: string;
  history: Array<{ occurredAt: string; actorName: string; summary: string }>;
};

type SubjectRequest = {
  id: string;
  protocolNo: number;
  customerId: string | null;
  requesterName: string;
  requestType: string;
  requestTypeLabel: string;
  description: string;
  status: string;
  statusLabel: string;
  openedOn: string;
  dueOn: string;
  responseText: string;
};

type Activity = {
  id: string;
  code: string;
  title: string;
  dataCategories: string;
  purpose: string;
  legalBasis: string;
  storage: string;
  notes: string;
};

type Incident = {
  id: string;
  protocolNo: number;
  title: string;
  description: string;
  occurredOn: string;
  status: string;
  statusLabel: string;
  notifiedOn: string | null;
};

type CustomerHit = { id: string; legalName: string };

const TITLES: Record<string, string> = {
  "/settings/privacy": "Privacidade",
  "/settings/privacy/requests": "Pedidos do titular",
  "/settings/privacy/activities": "Tratamento de dados",
  "/settings/privacy/incidents": "Incidentes",
  "/settings/privacy/training": "Treinamento",
};

const REQUEST_TYPES = [
  { value: "access", label: "Acesso" },
  { value: "correction", label: "Correção" },
  { value: "anonymization", label: "Anonimização" },
  { value: "deletion", label: "Exclusão" },
  { value: "portability", label: "Portabilidade" },
];

function protocol(prefix: string, value: number) {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function PrivacyWorkspace() {
  const pane = useWorkspacePane();
  const searchParams = useWorkspaceSearchParams();
  const path = getWorkspaceBasePath(pane?.pathname ?? "/settings/privacy");
  const { apiJson, hasAnyPermission } = useSession();
  const canRead = hasAnyPermission("privacy.read");
  const canWrite = hasAnyPermission("privacy.write");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailLabel = searchParams.get("workspaceMode") === "new" ? "Novo" : searchParams.get("focusRecordId") ? "Detalhe" : null;

  useWorkspaceRegistration({ label: detailLabel ? `${TITLES[path] ?? "Privacidade"}: ${detailLabel}` : TITLES[path] ?? "Privacidade", subtitle: "LGPD" });

  if (!canRead && !canWrite) {
    return (
      <section className="mini-card">
        <h3>Privacidade indisponível</h3>
        <p>Você não possui acesso a esta função no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {message ? <WorkspaceFlash message={message} /> : null}
      {error ? <WorkspaceFlash message={error} /> : null}
      {path === "/settings/privacy/requests" ? (
        <RequestsScreen apiJson={apiJson} canWrite={canWrite} onError={setError} onMessage={setMessage} />
      ) : path === "/settings/privacy/activities" ? (
        <ActivitiesScreen apiJson={apiJson} canWrite={canWrite} onError={setError} onMessage={setMessage} />
      ) : path === "/settings/privacy/incidents" ? (
        <IncidentsScreen apiJson={apiJson} canWrite={canWrite} onError={setError} onMessage={setMessage} />
      ) : path === "/settings/privacy/training" ? (
        <TrainingScreen />
      ) : (
        <SettingsScreen apiJson={apiJson} canWrite={canWrite} onError={setError} onMessage={setMessage} />
      )}
    </>
  );
}

function SettingsScreen({
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForm(await apiJson<Settings>("/privacy/settings"));
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "A privacidade não pôde ser carregada."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, onError]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    onMessage(null);
    onError(null);
    try {
      const saved = await apiJson<Settings>("/privacy/settings", {
        method: "PATCH",
        body: JSON.stringify({
          privacyNotice: form.privacyNotice,
          acceptanceText: form.acceptanceText,
          operatorTerms: form.operatorTerms,
          incidentPlan: form.incidentPlan,
          linkMarginDays: form.linkMarginDays,
          retentionInactiveYears: form.retentionInactiveYears,
          addressRetentionDays: form.addressRetentionDays,
          subjectResponseDays: form.subjectResponseDays,
          dpoName: form.dpoName,
          dpoEmail: form.dpoEmail,
        }),
      });
      setForm(saved);
      onMessage("Textos e prazos gravados.");
    } catch (error) {
      onError(describeWorkspaceError(error, "A privacidade não pôde ser gravada."));
    }
  }

  if (loading || !form) return <div className="empty-state">Carregando privacidade…</div>;

  return (
    <section className="workspace-stack">
      <article className="mini-card cadastro-form">
        <div className="workspace-toolbar__copy">
          <h3>Privacidade</h3>
          <p>
            O aviso e o termo aparecem no formulário do celular. O link público vale até a retirada, mais a garantia de execução, mais a margem abaixo. A guarda de inativos fica registrada; o sistema ainda não apaga cadastro sozinho. O advogado revisa os textos antes da virada.
          </p>
        </div>
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Aviso de privacidade</span>
            <textarea rows={4} value={form.privacyNotice} onChange={(event) => setForm({ ...form, privacyNotice: event.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Termo de aceite no celular</span>
            <textarea rows={3} value={form.acceptanceText} onChange={(event) => setForm({ ...form, acceptanceText: event.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>ANEXSYS como operador</span>
            <textarea rows={3} value={form.operatorTerms} onChange={(event) => setForm({ ...form, operatorTerms: event.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Plano se houver vazamento</span>
            <textarea rows={4} value={form.incidentPlan} onChange={(event) => setForm({ ...form, incidentPlan: event.target.value })} />
          </label>
          <label className="field">
            <span>Margem do link (dias)</span>
            <input type="number" min={0} max={3650} value={form.linkMarginDays} onChange={(event) => setForm({ ...form, linkMarginDays: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Guarda de inativos (anos)</span>
            <input type="number" min={1} max={20} value={form.retentionInactiveYears} onChange={(event) => setForm({ ...form, retentionInactiveYears: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Endereço de entrega (dias)</span>
            <input type="number" min={1} max={3650} value={form.addressRetentionDays} onChange={(event) => setForm({ ...form, addressRetentionDays: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Prazo de resposta (dias)</span>
            <input type="number" min={1} max={90} value={form.subjectResponseDays} onChange={(event) => setForm({ ...form, subjectResponseDays: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Contato de privacidade</span>
            <input value={form.dpoName} onChange={(event) => setForm({ ...form, dpoName: event.target.value })} />
          </label>
          <label className="field">
            <span>E-mail do contato</span>
            <input value={form.dpoEmail} onChange={(event) => setForm({ ...form, dpoEmail: event.target.value })} />
          </label>
          {canWrite ? (
            <div className="button-row">
              <button className="button" type="submit">Gravar</button>
            </div>
          ) : null}
        </form>
        {form.history.length > 0 ? (
          <div>
            <h4>Histórico</h4>
            <ul>
              {form.history.map((item) => (
                <li key={`${item.occurredAt}-${item.summary}`}>
                  {formatDay(item.occurredAt)} · {item.actorName} · {item.summary}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </section>
  );
}

function AnswerRequestForm({
  request,
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  request: SubjectRequest;
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const [responseText, setResponseText] = useState(request.responseText);

  async function answer(event: FormEvent) {
    event.preventDefault();
    try {
      await apiJson(`/privacy/requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ responseText }) });
      onMessage("Resposta gravada.");
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "A resposta não pôde ser gravada."));
    }
  }

  async function fillAccessSummary() {
    try {
      const result = await apiJson<{ summary: string }>(`/privacy/requests/${request.id}/access-summary`, { method: "POST" });
      setResponseText(result.summary);
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "O resumo de acesso não pôde ser montado."));
    }
  }

  return (
    <section className="workspace-stack">
      <article className="mini-card cadastro-form">
        <h3>{protocol("PT", request.protocolNo)}</h3>
        <form className="form-grid" onSubmit={(event) => void answer(event)}>
          <label className="field">
            <span>Quem pediu</span>
            <input value={request.requesterName} readOnly />
          </label>
          <label className="field">
            <span>Prazo</span>
            <input value={`${formatDay(request.openedOn)} até ${formatDay(request.dueOn)} · ${request.statusLabel}`} readOnly />
          </label>
          <label className="field">
            <span>Tipo</span>
            <input value={request.requestTypeLabel} readOnly />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Pedido</span>
            <textarea rows={4} value={request.description} readOnly />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Resposta dada ao titular</span>
            <textarea rows={6} value={responseText} onChange={(event) => setResponseText(event.target.value)} />
          </label>
          {canWrite ? (
            <div className="button-row">
              <button className="button" type="submit">Gravar resposta</button>
              {request.requestType === "access" ? (
                <button className="button-secondary" type="button" onClick={() => void fillAccessSummary()}>
                  Montar resumo de acesso
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </article>
    </section>
  );
}

function RequestsScreen({
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const searchParams = useWorkspaceSearchParams();
  const { isMobile } = useWorkspaceViewportMode();
  const { navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceManager();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const [records, setRecords] = useState<SubjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesterName, setRequesterName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerHit[]>([]);
  const [requestType, setRequestType] = useState("access");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiJson<SubjectRequest[]>("/privacy/requests");
      setRecords(Array.isArray(rows) ? rows : []);
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "Os pedidos do titular não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, onError]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const active = useMemo(() => records.find((row) => row.id === focusRecordId) ?? null, [focusRecordId, records]);

  function openCreate() {
    const target = "/settings/privacy/requests?workspaceMode=new";
    if (isMobile) navigateWithinWorkspace(target);
    else openWorkspaceInNewTab(target, "Pedido do titular: Novo", { cloneCurrent: false, subtitle: "Novo pedido" });
  }

  function openEdit(row: SubjectRequest) {
    const target = `/settings/privacy/requests?focusRecordId=${encodeURIComponent(row.id)}`;
    if (isMobile) navigateWithinWorkspace(target);
    else openWorkspaceInNewTab(target, `Pedido ${protocol("PT", row.protocolNo)}`, { cloneCurrent: false, subtitle: row.requesterName });
  }

  async function searchCustomers(value: string) {
    setCustomerQuery(value);
    if (value.trim().length < 2) {
      setCustomers([]);
      return;
    }
    try {
      const rows = await apiJson<CustomerHit[]>(`/customers?q=${encodeURIComponent(value.trim())}`);
      setCustomers(Array.isArray(rows) ? rows.slice(0, 8) : []);
    } catch {
      setCustomers([]);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await apiJson("/privacy/requests", {
        method: "POST",
        body: JSON.stringify({ requesterName, customerId, requestType, description }),
      });
      onMessage("Pedido do titular registrado.");
      onError(null);
      if (isMobile) navigateWithinWorkspace("/settings/privacy/requests");
      else openWorkspaceInNewTab("/settings/privacy/requests", "Pedidos do titular", { cloneCurrent: false });
    } catch (error) {
      onError(describeWorkspaceError(error, "O pedido não pôde ser registrado."));
    }
  }

  if (focusRecordId) {
    if (!active) return <div className="empty-state">Carregando pedido…</div>;
    return (
      <AnswerRequestForm
        key={active.id}
        apiJson={apiJson}
        canWrite={canWrite}
        onError={onError}
        onMessage={onMessage}
        request={active}
      />
    );
  }

  if (workspaceMode === "new") {
    return (
      <section className="workspace-stack">
        <article className="mini-card cadastro-form">
          <h3>Novo pedido do titular</h3>
          <form className="form-grid" onSubmit={(event) => void create(event)}>
            <label className="field">
              <span>Quem pediu</span>
              <input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} />
            </label>
            <label className="field">
              <span>Cliente do cadastro</span>
              <input value={customerQuery} placeholder="Digite o nome" onChange={(event) => void searchCustomers(event.target.value)} />
              {customers.length > 0 ? (
                <div className="button-row">
                  {customers.map((customer) => (
                    <button
                      className="button-secondary"
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(customer.id);
                        setRequesterName(customer.legalName);
                        setCustomerQuery(customer.legalName);
                        setCustomers([]);
                      }}
                    >
                      {customer.legalName}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="field">
              <span>Tipo</span>
              <select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
                {REQUEST_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Pedido</span>
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            {canWrite ? (
              <div className="button-row">
                <button className="button" type="submit">Registrar pedido</button>
              </div>
            ) : null}
          </form>
        </article>
      </section>
    );
  }

  return (
    <CadastroListPanel
      title="Pedidos do titular"
      records={records}
      loading={loading}
      canWrite={canWrite}
      columns={[
        { id: "protocol", label: "Protocolo", locked: true, render: (row) => protocol("PT", row.protocolNo) },
        { id: "name", label: "Quem pediu", render: (row) => row.requesterName },
        { id: "type", label: "Tipo", render: (row) => row.requestTypeLabel },
        { id: "status", label: "Situação", render: (row) => row.statusLabel },
        { id: "due", label: "Prazo", render: (row) => formatDay(row.dueOn) },
      ]}
      defaultColumnIds={["protocol", "name", "type", "status", "due"]}
      columnStorageKey="anexsys.frontend.privacy-requests.grid-columns.v1"
      filterFields={[{ id: "status", label: "Situação", kind: "select", options: [{ value: "", label: "Todas" }, { value: "Aberto", label: "Aberto" }, { value: "Respondido", label: "Respondido" }] }]}
      emptyFilters={{ status: "" }}
      applyFilters={(rows, filters) => rows.filter((row) => !filters.status || row.statusLabel === filters.status)}
      searchKey="privacy-requests"
      searchPlaceholder="Buscar pedido"
      searchOptions={records.map((row) => ({ id: row.id, label: `${protocol("PT", row.protocolNo)} ${row.requesterName}` }))}
      onCreate={openCreate}
      onEdit={openEdit}
      editLabel="Responder"
      excelFileName="pedidos-do-titular.csv"
      buildExcelCsv={(rows) => ["Protocolo;Quem pediu;Tipo;Situação;Prazo", ...rows.map((row) => `${protocol("PT", row.protocolNo)};${row.requesterName};${row.requestTypeLabel};${row.statusLabel};${row.dueOn}`)].join("\n")}
      emptyMessage="Nenhum pedido do titular."
      rowLabel={(row) => row.requesterName}
    />
  );
}

function ActivityNotesForm({
  activity,
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  activity: Activity;
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const [notes, setNotes] = useState(activity.notes);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await apiJson(`/privacy/activities/${activity.id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
      onMessage("Observação gravada.");
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "A observação não pôde ser gravada."));
    }
  }

  return (
    <section className="workspace-stack">
      <article className="mini-card cadastro-form">
        <h3>{activity.title}</h3>
        <p>{activity.purpose}</p>
        <p className="table-subtle">Dados: {activity.dataCategories}</p>
        <p className="table-subtle">Base: {activity.legalBasis}</p>
        <p className="table-subtle">Onde fica: {activity.storage}</p>
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Observação da Conta</span>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {canWrite ? <div className="button-row"><button className="button" type="submit">Gravar</button></div> : null}
        </form>
      </article>
    </section>
  );
}

function IncidentStatusForm({
  incident,
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  incident: Incident;
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const [status, setStatus] = useState(incident.status);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await apiJson(`/privacy/incidents/${incident.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      onMessage("Situação do incidente gravada.");
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "O incidente não pôde ser atualizado."));
    }
  }

  return (
    <section className="workspace-stack">
      <article className="mini-card cadastro-form">
        <h3>{protocol("IN", incident.protocolNo)}</h3>
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <label className="field">
            <span>Título</span>
            <input value={incident.title} readOnly />
          </label>
          <label className="field">
            <span>Data</span>
            <input value={formatDay(incident.occurredOn)} readOnly />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>O que aconteceu</span>
            <textarea rows={4} value={incident.description} readOnly />
          </label>
          <label className="field">
            <span>Situação</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="open">Aberto</option>
              <option value="contained">Contido</option>
              <option value="notified">Comunicado</option>
            </select>
          </label>
          {canWrite ? <div className="button-row"><button className="button" type="submit">Gravar situação</button></div> : null}
        </form>
      </article>
    </section>
  );
}

function ActivitiesScreen({
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const searchParams = useWorkspaceSearchParams();
  const focusRecordId = searchParams.get("focusRecordId");
  const { isMobile } = useWorkspaceViewportMode();
  const { navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceManager();
  const [records, setRecords] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const active = records.find((row) => row.id === focusRecordId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await apiJson<Activity[]>("/privacy/activities"));
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "O registro de tratamento não pôde ser carregado."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, onError]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  if (focusRecordId && !active) return <div className="empty-state">Carregando registro…</div>;
  if (active) {
    return (
      <ActivityNotesForm
        key={active.id}
        activity={active}
        apiJson={apiJson}
        canWrite={canWrite}
        onError={onError}
        onMessage={onMessage}
      />
    );
  }

  return (
    <CadastroListPanel
      title="Tratamento de dados"
      records={records}
      loading={loading}
      canWrite={canWrite}
      hideCreate
      columns={[
        { id: "title", label: "Operação", locked: true, render: (row) => row.title },
        { id: "purpose", label: "Para quê", render: (row) => row.purpose },
        { id: "basis", label: "Base", render: (row) => row.legalBasis },
      ]}
      defaultColumnIds={["title", "purpose", "basis"]}
      columnStorageKey="anexsys.frontend.privacy-activities.grid-columns.v1"
      filterFields={[]}
      emptyFilters={{}}
      applyFilters={(rows) => rows}
      searchKey="privacy-activities"
      searchPlaceholder="Buscar operação"
      searchOptions={records.map((row) => ({ id: row.id, label: row.title }))}
      onCreate={() => undefined}
      onEdit={(row) => {
        const target = `/settings/privacy/activities?focusRecordId=${encodeURIComponent(row.id)}`;
        if (isMobile) navigateWithinWorkspace(target);
        else openWorkspaceInNewTab(target, row.title, { cloneCurrent: false, subtitle: "Tratamento" });
      }}
      editLabel="Observação"
      excelFileName="tratamento-de-dados.csv"
      buildExcelCsv={(rows) => ["Operação;Para quê;Base", ...rows.map((row) => `${row.title};${row.purpose};${row.legalBasis}`)].join("\n")}
      emptyMessage="Nenhum registro de tratamento."
      rowLabel={(row) => row.title}
    />
  );
}

function IncidentsScreen({
  apiJson,
  canWrite,
  onError,
  onMessage,
}: {
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  canWrite: boolean;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const searchParams = useWorkspaceSearchParams();
  const { isMobile } = useWorkspaceViewportMode();
  const { navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceManager();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const [records, setRecords] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await apiJson<Incident[]>("/privacy/incidents"));
      onError(null);
    } catch (error) {
      onError(describeWorkspaceError(error, "Os incidentes não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, onError]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const active = records.find((row) => row.id === focusRecordId) ?? null;

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await apiJson("/privacy/incidents", { method: "POST", body: JSON.stringify({ title, description, occurredOn }) });
      onMessage("Incidente registrado.");
      if (isMobile) navigateWithinWorkspace("/settings/privacy/incidents");
      else openWorkspaceInNewTab("/settings/privacy/incidents", "Incidentes", { cloneCurrent: false });
    } catch (error) {
      onError(describeWorkspaceError(error, "O incidente não pôde ser registrado."));
    }
  }

  if (focusRecordId) {
    if (!active) return <div className="empty-state">Carregando incidente…</div>;
    return (
      <IncidentStatusForm
        key={active.id}
        apiJson={apiJson}
        canWrite={canWrite}
        incident={active}
        onError={onError}
        onMessage={onMessage}
      />
    );
  }

  if (workspaceMode === "new") {
    return (
      <section className="workspace-stack">
        <article className="mini-card cadastro-form">
          <h3>Novo incidente</h3>
          <form className="form-grid" onSubmit={(event) => void create(event)}>
            <label className="field">
              <span>Título</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>Data</span>
              <input type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>O que aconteceu</span>
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            {canWrite ? <div className="button-row"><button className="button" type="submit">Registrar</button></div> : null}
          </form>
        </article>
      </section>
    );
  }

  return (
    <CadastroListPanel
      title="Incidentes"
      records={records}
      loading={loading}
      canWrite={canWrite}
      columns={[
        { id: "protocol", label: "Protocolo", locked: true, render: (row) => protocol("IN", row.protocolNo) },
        { id: "title", label: "Título", render: (row) => row.title },
        { id: "when", label: "Data", render: (row) => formatDay(row.occurredOn) },
        { id: "status", label: "Situação", render: (row) => row.statusLabel },
      ]}
      defaultColumnIds={["protocol", "title", "when", "status"]}
      columnStorageKey="anexsys.frontend.privacy-incidents.grid-columns.v1"
      filterFields={[]}
      emptyFilters={{}}
      applyFilters={(rows) => rows}
      searchKey="privacy-incidents"
      searchPlaceholder="Buscar incidente"
      searchOptions={records.map((row) => ({ id: row.id, label: row.title }))}
      onCreate={() => {
        const target = "/settings/privacy/incidents?workspaceMode=new";
        if (isMobile) navigateWithinWorkspace(target);
        else openWorkspaceInNewTab(target, "Incidente: Novo", { cloneCurrent: false, subtitle: "Novo incidente" });
      }}
      onEdit={(row) => {
        const target = `/settings/privacy/incidents?focusRecordId=${encodeURIComponent(row.id)}`;
        if (isMobile) navigateWithinWorkspace(target);
        else openWorkspaceInNewTab(target, protocol("IN", row.protocolNo), { cloneCurrent: false, subtitle: row.title });
      }}
      excelFileName="incidentes.csv"
      buildExcelCsv={(rows) => ["Protocolo;Título;Data;Situação", ...rows.map((row) => `${protocol("IN", row.protocolNo)};${row.title};${row.occurredOn};${row.statusLabel}`)].join("\n")}
      emptyMessage="Nenhum incidente registrado."
      rowLabel={(row) => row.title}
    />
  );
}

function TrainingScreen() {
  const pages = [
    ["Recepção", "Confere o cliente na chegada e não abre OS. Se alguém pedir os próprios dados, encaminha para o atendente registrar o pedido em Pedidos do titular."],
    ["Atendente", "No cadastro, registra o consentimento do WhatsApp. Na OS, copia o link. Se o cliente pedir acesso, correção ou exclusão, abre um pedido do titular e grava a resposta. Não apaga histórico de OS já movimentada por conta própria."],
    ["Produção", "Lê a sacola da própria OS. Não fotografa o cliente. A Ordem de Produção não leva endereço nem preço."],
    ["Qualidade", "Revisa a peça. Reprovação não aparece para o cliente no link: ele continua vendo Controle de qualidade."],
    ["Gerente", "Edita aviso, termo, prazo do link e plano de incidente em Privacidade. Responde pedidos no prazo configurado. Em vazamento, segue o plano e marca o incidente como comunicado quando avisar quem precisa."],
  ];
  return (
    <section className="workspace-stack">
      {pages.map(([title, text]) => (
        <article className="mini-card" key={title}>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </section>
  );
}
