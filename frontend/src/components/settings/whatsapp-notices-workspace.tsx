"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

const STATUS_LABELS: Record<string, string> = {
  queued: "Na fila",
  sending: "Enviando",
  accepted: "Aceita pela Meta",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Sem autorização",
};

const KIND_LABELS: Record<string, string> = {
  os_opened: "OS aberta",
  ready_for_pickup: "Pronto para retirada",
};

type Notice = {
  id: string;
  kind: string;
  status: string;
  body: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  orderNo: string;
  customerName: string;
};

export function WhatsappNoticesWorkspace() {
  const { apiJson, hasAnyPermission } = useSession();
  const canResend = hasAnyPermission("whatsapp.resend");
  const canDispatch = hasAnyPermission("whatsapp.write");
  const [status, setStatus] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
      setNotices(await apiJson<Notice[]>(`/whatsapp/messages${suffix}`));
      setError(null);
    } catch (loadError) {
      setError(describeWorkspaceError(loadError, "Os avisos não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend(id: string) {
    setActingId(id);
    try {
      setNotices(await apiJson<Notice[]>(`/whatsapp/messages/${id}/resend`, { method: "POST" }));
      setError(null);
    } catch (resendError) {
      setError(describeWorkspaceError(resendError, "O aviso não pôde ser reenviado."));
    } finally {
      setActingId(null);
    }
  }

  async function dispatchQueue() {
    setActingId("dispatch");
    try {
      setNotices(await apiJson<Notice[]>("/whatsapp/dispatch", { method: "POST" }));
      setError(null);
    } catch (dispatchError) {
      setError(describeWorkspaceError(dispatchError, "A fila não pôde ser processada."));
    } finally {
      setActingId(null);
    }
  }

  return (
    <section className="workspace-stack">
      <article className="mini-card">
        <div className="workspace-toolbar">
          <div className="workspace-toolbar__copy">
            <h3>Avisos</h3>
            <p className="table-subtle">A mensagem só fica enviada quando a Meta confirma. Aceita pela Meta ainda espera essa confirmação.</p>
          </div>
          <div className="button-row">
            <button className="button-secondary" onClick={() => void load()} type="button">
              Atualizar
            </button>
            {canDispatch ? (
              <button className="button-secondary" disabled={actingId === "dispatch"} onClick={() => void dispatchQueue()} type="button">
                Processar fila
              </button>
            ) : null}
          </div>
        </div>
        <label className="field">
          <span>Situação</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {loading ? <p>Carregando avisos…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading && notices.length === 0 ? <p>Nenhum aviso nesta lista.</p> : null}
        {notices.length > 0 ? (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th>Mensagem</th>
                  <th>Situação</th>
                  <th>Detalhe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {notices.map((notice) => (
                  <tr key={notice.id}>
                    <td>{notice.orderNo}</td>
                    <td>{notice.customerName}</td>
                    <td>{KIND_LABELS[notice.kind] ?? notice.kind}</td>
                    <td>{STATUS_LABELS[notice.status] ?? notice.status}</td>
                    <td>{notice.lastError || notice.body}</td>
                    <td>
                      {canResend && ["failed", "skipped", "accepted"].includes(notice.status) ? (
                        <button className="button-secondary" disabled={actingId === notice.id} onClick={() => void resend(notice.id)} type="button">
                          Reenviar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </section>
  );
}
