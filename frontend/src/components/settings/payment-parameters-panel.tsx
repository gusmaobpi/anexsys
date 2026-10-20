"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { formatOsInstant } from "@/components/service-orders/os-approval";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type PaymentParameterChange = {
  occurredAt: string;
  actorName: string;
  previousMinutes: number;
  newMinutes: number;
};

type PaymentParameters = {
  machineWaitMinutes: number;
  history: PaymentParameterChange[];
};

export function PaymentParametersPanel() {
  const { apiJson, hasAnyPermission } = useSession();
  const canWrite = hasAnyPermission("finance.write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMinutes, setSavedMinutes] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<PaymentParameterChange[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyParameters = useCallback((parameters: PaymentParameters) => {
    setSavedMinutes(parameters.machineWaitMinutes);
    setDraft(String(parameters.machineWaitMinutes));
    setHistory(parameters.history ?? []);
  }, []);

  const loadParameters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<PaymentParameters>("/payment-parameters");
      applyParameters(response);
      setError(null);
    } catch (loadError) {
      setError(describeWorkspaceError(loadError, "Os parâmetros de pagamento não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, applyParameters]);

  useEffect(() => {
    void loadParameters();
  }, [loadParameters]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || saving) {
      return;
    }
    const minutes = Number(draft);
    if (!/^\d+$/.test(draft) || !Number.isInteger(minutes)) {
      setMessage(null);
      setError("O tempo de espera fica entre 1 e 30 minutos.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await apiJson<PaymentParameters>("/payment-parameters", {
        method: "PATCH",
        body: JSON.stringify({ machineWaitMinutes: minutes }),
      });
      applyParameters(response);
      setMessage(minutes === savedMinutes ? "O tempo continua o mesmo." : "Tempo de espera gravado.");
    } catch (saveError) {
      setError(describeWorkspaceError(saveError, "O tempo de espera não pôde ser gravado."));
    } finally {
      setSaving(false);
    }
  }

  const unchanged = savedMinutes !== null && draft === String(savedMinutes);

  return (
    <section className="mini-card" style={{ marginBottom: 16 }}>
      <h3>Parâmetros</h3>
      <p className="table-subtle">Vale para a conta inteira, em todas as empresas.</p>
      {loading ? <p>Carregando parâmetros…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {!loading && savedMinutes !== null ? (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Tempo máximo de espera da maquininha (minutos)</span>
            <input
              disabled={!canWrite || saving}
              inputMode="numeric"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setMessage(null);
                setError(null);
              }}
            />
          </label>
          <p className="table-subtle">Entre 1 e 30 minutos. Enquanto espera, o sistema consulta a maquininha a cada 5 segundos.</p>
          {canWrite ? (
            <div className="button-row">
              <button className="button" disabled={saving || unchanged || draft.trim() === ""} type="submit">
                {saving ? "Gravando…" : "Gravar"}
              </button>
            </div>
          ) : (
            <p className="table-subtle">Só quem grava pagamentos pode alterar este tempo.</p>
          )}
        </form>
      ) : null}
      {!loading && savedMinutes !== null ? (
        <div>
          <h4>Histórico</h4>
          {history.length === 0 ? (
            <p className="table-subtle">Nenhuma alteração. O padrão continua 3 minutos.</p>
          ) : (
            <ul className="table-subtle">
              {history.map((change) => (
                <li key={`${change.occurredAt}-${change.previousMinutes}-${change.newMinutes}`}>
                  {change.actorName} · {formatOsInstant(change.occurredAt) ?? change.occurredAt} · de {change.previousMinutes} para {change.newMinutes} minutos
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
