"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getWorkspaceBasePath } from "@/components/app-shell/workspace-manager-store";
import { useWorkspacePane } from "@/components/app-shell/workspace-pane";
import { useWorkspaceManager, useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type BranchOption = { id: string; displayName: string; companyId: string; companyName: string };
type Settings = {
  companyId: string; legalName: string; tradeName: string | null; cnpj: string | null;
  municipalRegistration: string | null; stateRegistration: string | null; city: string | null; state: string | null;
  branchName: string; taxRegime: string | null; mainCnae: string | null; defaultServiceCode: string | null;
  defaultIssRate: string | null; fiscalEmail: string | null; fiscalResponsible: string | null;
};
type Certificate = { id: string; name: string; issuedAt: string | null; expiresAt: string; status: string; alertDays: number | null };
type Eligible = {
  id: string; orderNo: string; customerName: string; customerId: string; city: string | null; state: string | null;
  amount: number; paymentStatus: string; status: string; openedAt: string; services: string; blockedReason: string | null;
};

const TITLES: Record<string, string> = {
  "/fiscal/settings": "Configuração Fiscal",
  "/fiscal/certificates": "Certificados Digitais",
  "/fiscal/environments": "Ambientes",
  "/fiscal/batch": "Emissão em Lote",
  "/fiscal/history": "Histórico Fiscal",
  "/fiscal/cancellations": "Cancelamento Fiscal",
  "/fiscal/pending": "Pendências Fiscais",
  "/fiscal/audit": "Auditoria Fiscal",
};

function downloadBase64(fileName: string, mime: string, contentBase64: string) {
  const bytes = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function FiscalWorkspace() {
  const pane = useWorkspacePane();
  const path = getWorkspaceBasePath(pane?.pathname ?? "/fiscal/settings");
  const { apiJson, hasAnyPermission, session } = useSession();
  const canAdmin = hasAnyPermission("fiscal.admin");
  const canWrite = hasAnyPermission("fiscal.write");
  const canRead = hasAnyPermission("fiscal.read");
  const canAudit = hasAnyPermission("fiscal.audit");
  const [branchId, setBranchId] = useState(session?.activeBranchId ?? "");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useWorkspaceRegistration({ label: TITLES[path] ?? "Fiscal", subtitle: "NFS-e" });

  useEffect(() => {
    if (!canAdmin && !canRead && !canWrite) return;
    void apiJson<BranchOption[]>("/fiscal/branches").then(setBranches).catch(() => setBranches([]));
  }, [apiJson, canAdmin, canRead, canWrite]);

  const allowed = path === "/fiscal/audit" ? canAudit : path === "/fiscal/settings" || path === "/fiscal/certificates" || path === "/fiscal/environments" ? canAdmin : path === "/fiscal/batch" || path === "/fiscal/cancellations" ? canWrite : canRead;

  return (
    <>
      {message ? <WorkspaceFlash message={message} /> : null}
      {error ? <WorkspaceFlash message={error} /> : null}
      {!allowed ? (
        <section className="mini-card"><h3>Fiscal indisponível</h3><p>Você não possui acesso a esta função no contexto atual.</p></section>
      ) : path === "/fiscal/settings" ? (
        <SettingsScreen apiJson={apiJson} branchId={branchId} branches={branches} onBranch={setBranchId} onError={setError} onMessage={setMessage} />
      ) : path === "/fiscal/certificates" ? (
        <CertificatesScreen apiJson={apiJson} branchId={branchId} branches={branches} onBranch={setBranchId} onError={setError} onMessage={setMessage} />
      ) : path === "/fiscal/environments" ? (
        <EnvironmentsScreen apiJson={apiJson} branchId={branchId} branches={branches} onBranch={setBranchId} onError={setError} onMessage={setMessage} />
      ) : path === "/fiscal/batch" ? (
        <BatchScreen apiJson={apiJson} branchId={branchId} branches={branches} onBranch={setBranchId} onError={setError} onMessage={setMessage} />
      ) : path === "/fiscal/history" ? (
        <HistoryScreen apiJson={apiJson} onError={setError} />
      ) : path === "/fiscal/cancellations" ? (
        <CancelScreen apiJson={apiJson} canWrite={canWrite} onError={setError} onMessage={setMessage} />
      ) : path === "/fiscal/pending" ? (
        <PendingScreen apiJson={apiJson} canWrite={canWrite} onError={setError} onMessage={setMessage} />
      ) : (
        <AuditScreen apiJson={apiJson} onError={setError} />
      )}
    </>
  );
}

function BranchField({ branches, branchId, onBranch }: { branches: BranchOption[]; branchId: string; onBranch: (id: string) => void }) {
  return (
    <label className="field">
      <span>Filial</span>
      <select value={branchId} onChange={(event) => onBranch(event.target.value)}>
        <option value="">Escolha</option>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.companyName} · {branch.displayName}</option>)}
      </select>
    </label>
  );
}

function SettingsScreen({ apiJson, branchId, branches, onBranch, onError, onMessage }: FiscalScreenProps) {
  const [form, setForm] = useState<Settings | null>(null);
  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setForm(await apiJson<Settings>(`/fiscal/settings?branchId=${branchId}`));
      onError(null);
    } catch (reason) {
      onError(describeWorkspaceError(reason, "A configuração fiscal não abriu."));
    }
  }, [apiJson, branchId, onError]);
  useEffect(() => { void load(); }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      setForm(await apiJson<Settings>("/fiscal/settings", { method: "PUT", body: JSON.stringify({
        branchId,
        legalName: form.legalName,
        tradeName: form.tradeName ?? "",
        cnpj: form.cnpj ?? "",
        municipalRegistration: form.municipalRegistration ?? "",
        stateRegistration: form.stateRegistration ?? "",
        city: form.city ?? "",
        state: form.state ?? "",
        taxRegime: form.taxRegime ?? "",
        mainCnae: form.mainCnae ?? "",
        defaultServiceCode: form.defaultServiceCode ?? "",
        defaultIssRate: form.defaultIssRate ?? "",
        fiscalEmail: form.fiscalEmail ?? "",
        fiscalResponsible: form.fiscalResponsible ?? "",
      }) }));
      onMessage("Configuração fiscal gravada na empresa e na filial.");
    } catch (reason) {
      onError(describeWorkspaceError(reason, "A configuração fiscal não foi gravada."));
    }
  }
  const field = (key: keyof Settings, label: string) => (
    <label className="field" key={key}><span>{label}</span><input value={String(form?.[key] ?? "")} onChange={(event) => setForm((current) => current ? { ...current, [key]: event.target.value } : current)} /></label>
  );
  return (
    <section className="mini-card cadastro-form">
      <h2 className="cadastro-list__title">Configuração Fiscal</h2>
      <form className="form-grid" onSubmit={save}>
        <BranchField branches={branches} branchId={branchId} onBranch={onBranch} />
        {field("legalName", "Razão Social")}
        {field("tradeName", "Nome Fantasia")}
        {field("cnpj", "CNPJ")}
        {field("municipalRegistration", "Inscrição Municipal")}
        {field("stateRegistration", "Inscrição Estadual")}
        {field("taxRegime", "Regime Tributário")}
        {field("mainCnae", "CNAE Principal")}
        {field("city", "Município")}
        {field("state", "UF")}
        {field("defaultServiceCode", "Código Padrão de Serviço")}
        {field("defaultIssRate", "Alíquota Padrão")}
        {field("fiscalEmail", "Email Fiscal")}
        {field("fiscalResponsible", "Responsável Fiscal")}
        <div className="button-row"><button className="button" type="submit">Gravar</button></div>
      </form>
    </section>
  );
}

function CertificatesScreen({ apiJson, branchId, branches, onBranch, onError, onMessage }: FiscalScreenProps) {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [pfx, setPfx] = useState("");
  const load = useCallback(async () => {
    if (!branchId) return;
    setRows(await apiJson<Certificate[]>(`/fiscal/certificates?branchId=${branchId}`));
  }, [apiJson, branchId]);
  useEffect(() => { void load().catch((reason) => onError(describeWorkspaceError(reason, "Os certificados não abriram."))); }, [load, onError]);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await apiJson("/fiscal/certificates", { method: "POST", body: JSON.stringify({ branchId, name, password, pfxBase64: pfx, issuedAt, expiresAt }) });
      setPassword("");
      onMessage("Certificado gravado. A senha não fica visível.");
      await load();
    } catch (reason) {
      onError(describeWorkspaceError(reason, "O certificado não foi gravado."));
    }
  }
  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Certificados Digitais</h2>
      <form className="form-grid" onSubmit={save}>
        <BranchField branches={branches} branchId={branchId} onBranch={onBranch} />
        <label className="field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="field"><span>Arquivo PFX</span><input type="file" accept=".pfx,.p12" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => setPfx(String(reader.result).split(",").pop() ?? "");
          reader.readAsDataURL(file);
        }} /></label>
        <label className="field"><span>Senha</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label className="field"><span>Data Emissão</span><input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></label>
        <label className="field"><span>Data Expiração</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /></label>
        <div className="button-row"><button className="button" type="submit">Trocar Certificado</button></div>
      </form>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>Nome</th><th>Emissão</th><th>Expiração</th><th>Status</th><th>Alerta</th><th>Ações</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td><td>{row.issuedAt?.slice(0, 10) || "—"}</td><td>{row.expiresAt.slice(0, 10)}</td><td>{row.status}</td>
                <td>{row.alertDays === null ? "—" : row.alertDays === 0 ? "Vencido" : `${row.alertDays} dias`}</td>
                <td><div className="table-actions">
                  <button className="button-secondary" type="button" onClick={() => void apiJson<{ message: string }>(`/fiscal/certificates/${row.id}/validate`, { method: "POST" }).then((result) => onMessage(result.message)).catch((reason) => onError(describeWorkspaceError(reason, "A validação não concluiu.")))}>Validar Certificado</button>
                  <button className="button-secondary" type="button" onClick={() => void apiJson<{ message: string }>(`/fiscal/certificates/${row.id}/test`, { method: "POST" }).then((result) => onMessage(result.message)).catch((reason) => onError(describeWorkspaceError(reason, "O teste não concluiu.")))}>Testar Comunicação</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EnvironmentsScreen({ apiJson, branchId, branches, onBranch, onError, onMessage }: FiscalScreenProps) {
  const [rows, setRows] = useState<Array<{ id: string; kind: string; isSelected: boolean; lastTestAt: string | null; lastIssueAt: string | null; certificateId: string | null }>>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const load = useCallback(async () => {
    if (!branchId) return;
    setRows(await apiJson(`/fiscal/environments?branchId=${branchId}`));
    setCertificates(await apiJson(`/fiscal/certificates?branchId=${branchId}`));
  }, [apiJson, branchId]);
  useEffect(() => { void load().catch((reason) => onError(describeWorkspaceError(reason, "Os ambientes não abriram."))); }, [load, onError]);
  async function choose(kind: "homologation" | "production") {
    const certificateId = certificates.find((item) => item.status === "active")?.id ?? null;
    try {
      setRows(await apiJson("/fiscal/environments", { method: "PUT", body: JSON.stringify({ branchId, kind, certificateId }) }));
      onMessage(kind === "production" ? "Ambiente de produção selecionado. A emissão real aguarda o emissor." : "Ambiente de homologação selecionado.");
    } catch (reason) {
      onError(describeWorkspaceError(reason, "O ambiente não foi trocado."));
    }
  }
  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Ambientes</h2>
      <BranchField branches={branches} branchId={branchId} onBranch={onBranch} />
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>Ambiente</th><th>Selecionado</th><th>Último teste</th><th>Última emissão</th><th>Certificado</th><th>Ações</th></tr></thead>
          <tbody>
            {(["homologation", "production"] as const).map((kind) => {
              const row = rows.find((item) => item.kind === kind);
              return (
                <tr key={kind}>
                  <td>{kind === "homologation" ? "Homologação" : "Produção"}</td>
                  <td>{row?.isSelected ? "Sim" : "Não"}</td>
                  <td>{row?.lastTestAt ? new Date(row.lastTestAt).toLocaleString("pt-BR") : "—"}</td>
                  <td>{row?.lastIssueAt ? new Date(row.lastIssueAt).toLocaleString("pt-BR") : "—"}</td>
                  <td>{certificates.find((item) => item.id === row?.certificateId)?.name ?? "—"}</td>
                  <td><button className="button-secondary" type="button" onClick={() => void choose(kind)}>Usar este ambiente</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BatchScreen({ apiJson, branchId, branches, onBranch, onError, onMessage }: FiscalScreenProps) {
  const [rows, setRows] = useState<Eligible[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!branchId) return;
    setRows(await apiJson<Eligible[]>(`/fiscal/eligible?branchId=${branchId}`));
  }, [apiJson, branchId]);
  useEffect(() => { void load().catch((reason) => onError(describeWorkspaceError(reason, "A fila de emissão não abriu."))); }, [load, onError]);
  async function emit(selected: Eligible[], mode: "per_order" | "consolidated") {
    const ready = selected.filter((row) => !row.blockedReason);
    if (ready.length === 0) {
      onError("Nenhuma OS selecionada está pronta para emitir.");
      return;
    }
    try {
      const batch = await apiJson<{ id: string }>("/fiscal/batches", { method: "POST", body: JSON.stringify({ branchId, mode, orderIds: ready.map((row) => row.id) }) });
      onMessage("Lote na fila. A tela não espera a transmissão.");
      const timer = window.setInterval(() => {
        void apiJson<{ status: string; processed: number; total: number; errors: number }>(`/fiscal/batches/${batch.id}`).then((view) => {
          setProgress(`${view.processed} de ${view.total}. Erros: ${view.errors}.`);
          if (view.status === "completed") {
            window.clearInterval(timer);
            void load();
          }
        });
      }, 1000);
    } catch (reason) {
      onError(describeWorkspaceError(reason, "O lote não entrou na fila."));
    }
  }
  return (
    <>
      {progress ? <p className="os-rule-banner">{progress}</p> : null}
      <BranchField branches={branches} branchId={branchId} onBranch={onBranch} />
      <CadastroListPanel
        applyFilters={(records, filters) => records.filter((row) => {
          const name = (filters.name ?? "").toLowerCase();
          const city = (filters.city ?? "").toLowerCase();
          const state = (filters.state ?? "").toUpperCase();
          const service = (filters.service ?? "").toLowerCase();
          const from = filters.from ? Date.parse(filters.from) : null;
          const to = filters.to ? Date.parse(filters.to) : null;
          const opened = Date.parse(row.openedAt);
          const min = Number(filters.min || 0);
          const max = filters.max ? Number(filters.max) : null;
          const orderFrom = filters.orderFrom ? Number(filters.orderFrom) : null;
          const orderTo = filters.orderTo ? Number(filters.orderTo) : null;
          const orderNumber = Number(row.orderNo.replace(/\D/g, ""));
          if (name && !row.orderNo.toLowerCase().includes(name) && !row.customerName.toLowerCase().includes(name)) return false;
          if (city && !(row.city ?? "").toLowerCase().includes(city)) return false;
          if (state && (row.state ?? "").toUpperCase() !== state) return false;
          if (service && !row.services.toLowerCase().includes(service)) return false;
          if (filters.payment && row.paymentStatus !== filters.payment) return false;
          if (from && opened < from) return false;
          if (to && opened > to + 86_400_000) return false;
          if (row.amount < min) return false;
          if (max !== null && row.amount > max) return false;
          if (orderFrom !== null && orderNumber < orderFrom) return false;
          if (orderTo !== null && orderNumber > orderTo) return false;
          return true;
        })}
        buildExcelCsv={() => ""}
        bulkActions={[
          { id: "each", label: "Emitir uma nota por OS", onSelect: (selected) => void emit(selected, "per_order") },
          { id: "group", label: "Consolidar por cliente", onSelect: (selected) => void emit(selected, "consolidated") },
        ]}
        canWrite
        columns={[
          { id: "name", label: "OS", locked: true, render: (row) => row.orderNo },
          { id: "customer", label: "Cliente", render: (row) => row.customerName },
          { id: "city", label: "Cidade", render: (row) => row.city || "—" },
          { id: "state", label: "UF", render: (row) => row.state || "—" },
          { id: "amount", label: "Valor", render: (row) => row.amount.toFixed(2) },
          { id: "payment", label: "Financeiro", render: (row) => row.paymentStatus === "paid" ? "Quitada" : "Em aberto" },
          { id: "service", label: "Serviço", render: (row) => row.services || "—" },
          { id: "block", label: "Pendência", render: (row) => row.blockedReason || "Pronta" },
        ]}
        columnStorageKey="anexsys.frontend.fiscal.batch.v1"
        defaultColumnIds={["name", "customer", "city", "state", "amount", "payment", "service", "block"]}
        editLabel="Ver"
        emptyFilters={{ name: "", city: "", state: "", service: "", payment: "", from: "", to: "", min: "", max: "", orderFrom: "", orderTo: "" }}
        emptyMessage="Nenhuma OS concluída nesta filial."
        excelFileName="fiscal.csv"
        filterFields={[
          { id: "name", label: "Cliente", placeholder: "Cliente" },
          { id: "orderFrom", label: "OS de", placeholder: "1001" },
          { id: "orderTo", label: "OS até", placeholder: "1999" },
          { id: "from", label: "Período de", placeholder: "AAAA-MM-DD" },
          { id: "to", label: "Período até", placeholder: "AAAA-MM-DD" },
          { id: "payment", label: "Status financeiro", kind: "select", options: [{ value: "", label: "Todos" }, { value: "paid", label: "Quitada" }, { value: "partial", label: "Parcial" }, { value: "pending", label: "Em aberto" }] },
          { id: "service", label: "Tipo de serviço", placeholder: "Serviço" },
          { id: "city", label: "Cidade", placeholder: "Cidade" },
          { id: "state", label: "UF", placeholder: "UF" },
          { id: "min", label: "Valor de", placeholder: "0" },
          { id: "max", label: "Valor até", placeholder: "0" },
        ]}
        hideCreate
        loading={false}
        onCreate={() => undefined}
        onEdit={() => undefined}
        records={rows}
        rowLabel={(row) => row.orderNo}
        searchKey="name"
        searchOptions={rows.map((row) => ({ id: row.id, label: row.orderNo, hint: row.customerName }))}
        searchPlaceholder="OS ou cliente"
        title="Emissão em Lote"
      />
    </>
  );
}

function HistoryScreen({ apiJson, onError }: { apiJson: FiscalScreenProps["apiJson"]; onError: (value: string | null) => void }) {
  const [rows, setRows] = useState<Array<Record<string, string | null>>>([]);
  useEffect(() => {
    void apiJson<Array<Record<string, string | null>>>("/fiscal/history").then(setRows).catch((reason) => onError(describeWorkspaceError(reason, "O histórico fiscal não abriu.")));
  }, [apiJson, onError]);
  async function file(id: string, kind: "xml" | "pdf") {
    const payload = await apiJson<{ fileName: string; mime: string; contentBase64: string }>(`/fiscal/documents/${id}/file?kind=${kind}`);
    downloadBase64(payload.fileName, payload.mime, payload.contentBase64);
  }
  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Histórico Fiscal</h2>
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Número da Nota</th><th>Cliente</th><th>Empresa</th><th>Filial</th><th>OS</th><th>Valor</th><th>Emissão</th><th>Situação</th><th>Usuário</th><th>Protocolo</th><th>Arquivos</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={String(row.id)}><td>{row.documentNo}</td><td>{row.customerName}</td><td>{row.companyName}</td><td>{row.branchName}</td><td>{row.orderNo}</td><td>{row.amount}</td><td>{row.issuedAt ? new Date(row.issuedAt).toLocaleString("pt-BR") : "—"}</td><td>{row.status}</td><td>{row.userName}</td><td>{row.protocol || "—"}</td><td><div className="table-actions"><button className="button-secondary" type="button" onClick={() => void file(String(row.id), "xml")}>XML</button><button className="button-secondary" type="button" onClick={() => void file(String(row.id), "pdf")}>PDF</button></div></td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

function CancelScreen({ apiJson, canWrite, onError, onMessage }: { apiJson: FiscalScreenProps["apiJson"]; canWrite: boolean; onError: (value: string | null) => void; onMessage: (value: string) => void }) {
  const [rows, setRows] = useState<Array<Record<string, string | null>>>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const load = useCallback(async () => setRows(await apiJson("/fiscal/history")), [apiJson]);
  useEffect(() => { void load().catch((error) => onError(describeWorkspaceError(error, "As notas não abriram."))); }, [load, onError]);
  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Cancelamento Fiscal</h2>
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Número</th><th>Cliente</th><th>OS</th><th>Situação</th><th>Protocolo</th><th>Ações</th></tr></thead>
        <tbody>{rows.filter((row) => row.status === "issued").map((row) => <tr key={String(row.id)}><td>{row.documentNo}</td><td>{row.customerName}</td><td>{row.orderNo}</td><td>{row.status}</td><td>{row.protocol || "—"}</td><td>{canWrite ? <button className="button-secondary" type="button" onClick={() => setTarget(String(row.id))}>Cancelar Nota</button> : "—"}</td></tr>)}</tbody>
      </table></div>
      {target ? createPortal(
        <div aria-modal="true" className="os-anexo-lightbox" role="dialog">
          <button aria-label="Fechar cancelamento" className="os-anexo-lightbox__backdrop" onClick={() => setTarget(null)} type="button" />
          <form className="os-anexo-lightbox__card" onSubmit={(event) => {
            event.preventDefault();
            void apiJson<{ protocol: string }>(`/fiscal/documents/${target}/cancel`, { method: "POST", body: JSON.stringify({ reason }) })
              .then((result) => { onMessage(`Cancelamento registrado. Protocolo ${result.protocol}.`); setTarget(null); setReason(""); return load(); })
              .catch((error) => onError(describeWorkspaceError(error, "A nota não foi cancelada.")));
          }}>
            <div className="day-board-card__head"><h2>Cancelar Nota</h2><button className="button-secondary" type="button" onClick={() => setTarget(null)}>Fechar</button></div>
            <label className="field"><span>Justificativa</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={15} /></label>
            <div className="button-row"><button className="button" type="submit">Confirmar cancelamento</button></div>
          </form>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

function PendingScreen({ apiJson, canWrite, onError, onMessage }: { apiJson: FiscalScreenProps["apiJson"]; canWrite: boolean; onError: (value: string | null) => void; onMessage: (value: string) => void }) {
  const { navigateWithinWorkspace } = useWorkspaceManager();
  const [rows, setRows] = useState<Array<Record<string, string | null>>>([]);
  const load = useCallback(async () => setRows(await apiJson("/fiscal/pending")), [apiJson]);
  useEffect(() => { void load().catch((error) => onError(describeWorkspaceError(error, "As pendências não abriram."))); }, [load, onError]);
  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Pendências Fiscais</h2>
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>OS</th><th>Cliente</th><th>Empresa</th><th>Filial</th><th>Erro</th><th>Data</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={String(row.id)}><td>{row.orderNo}</td><td>{row.customerName}</td><td>{row.companyName}</td><td>{row.branchName}</td><td>{row.message}</td><td>{row.happenedAt ? new Date(row.happenedAt).toLocaleString("pt-BR") : "—"}</td><td>{row.status}</td><td><div className="table-actions"><button className="button-secondary" type="button" onClick={() => navigateWithinWorkspace(`/service-orders?focusServiceOrderId=${row.serviceOrderId}`)}>Corrigir</button>{canWrite ? <button className="button-secondary" type="button" onClick={() => void apiJson(`/fiscal/pending/${row.id}/reprocess`, { method: "POST" }).then(() => { onMessage("Reprocesso na fila."); return load(); }).catch((error) => onError(describeWorkspaceError(error, "O reprocesso não entrou na fila.")))}>Reprocessar</button> : null}{canWrite ? <button className="button-secondary" type="button" onClick={() => void apiJson(`/fiscal/pending/${row.id}/reprocess`, { method: "POST" }).then(() => { onMessage("Reenvio na fila."); return load(); }).catch((error) => onError(describeWorkspaceError(error, "O reenvio não entrou na fila.")))}>Reenviar</button> : null}</div></td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

function AuditScreen({ apiJson, onError }: { apiJson: FiscalScreenProps["apiJson"]; onError: (value: string | null) => void }) {
  const [rows, setRows] = useState<Array<{ occurredAt: string; action: string; userName: string | null; metadata: Record<string, unknown> }>>([]);
  useEffect(() => { void apiJson<typeof rows>("/fiscal/audit").then(setRows).catch((error) => onError(describeWorkspaceError(error, "A auditoria fiscal não abriu."))); }, [apiJson, onError]);
  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Auditoria Fiscal</h2>
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Data e hora</th><th>Ação</th><th>Usuário</th><th>Resultado</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.occurredAt}-${index}`}><td>{new Date(row.occurredAt).toLocaleString("pt-BR")}</td><td>{row.action}</td><td>{row.userName || "—"}</td><td>{JSON.stringify(row.metadata)}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

type FiscalScreenProps = {
  apiJson: <T>(path: string, init?: { method?: string; body?: string }) => Promise<T>;
  branchId: string;
  branches: BranchOption[];
  onBranch: (id: string) => void;
  onError: (value: string | null) => void;
  onMessage: (value: string) => void;
};
