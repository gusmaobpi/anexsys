"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { formatOsInstant } from "@/components/service-orders/os-approval";
import {
  OS_PAYMENT_METHODS,
  osPaymentMethodLabel,
  osPaymentRecordStatusLabel,
  osShowsFaltaPagamento,
  type OsFinancialSummary,
  type OsPaymentMethod,
} from "@/components/service-orders/os-payment";
import { applyOsMoneyTyping, formatOsMoney, parseOsMoney } from "@/components/service-orders/service-order-workspace-view-model";

export type { OsFinancialSummary };

type Props = {
  orderNo: string;
  branchId: string | null;
  summary: OsFinancialSummary;
  onClose: () => void;
  onPaid: (summary: OsFinancialSummary) => void;
};

type OsPaymentTerminal = {
  id: string;
  name: string;
  provider: string;
  isDefault: boolean;
};

function toPaySummary(payload: OsFinancialSummary): OsFinancialSummary {
  return {
    serviceOrderId: payload.serviceOrderId,
    orderTotal: payload.orderTotal,
    amountPaid: payload.amountPaid,
    outstandingBalance: payload.outstandingBalance,
    paymentStatus: payload.paymentStatus,
    deliveryBlocked: payload.deliveryBlocked,
    payments: payload.payments ?? [],
  };
}

export function OsPayPanel({ orderNo, branchId, summary, onClose, onPaid }: Props) {
  const { apiJson } = useSession();
  const outstanding = Number(summary.outstandingBalance);
  const [amount, setAmount] = useState(outstanding > 0 ? applyOsMoneyTyping(String(Math.round(outstanding * 100))) : "");
  const [paymentMethod, setPaymentMethod] = useState<OsPaymentMethod>("card");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<OsPaymentTerminal[]>([]);
  const [chargeTerminalId, setChargeTerminalId] = useState("");
  const [charging, setCharging] = useState(false);
  const [chargeMessage, setChargeMessage] = useState<string | null>(null);
  const [lastCharge, setLastCharge] = useState<{ id: string; status: string; environment?: string } | null>(null);
  const payments = summary.payments ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = parseOsMoney(amount);
    if (parsedAmount === undefined || parsedAmount <= 0) {
      setError("Informe o valor já recebido no balcão.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await apiJson<OsFinancialSummary>("/payments", {
        method: "POST",
        body: JSON.stringify({
          serviceOrderId: summary.serviceOrderId,
          paymentMethod,
          paymentAmount: parsedAmount,
          status: "received",
        }),
      });
      const next = toPaySummary(response);
      setAmount(Number(next.outstandingBalance) > 0 ? applyOsMoneyTyping(String(Math.round(Number(next.outstandingBalance) * 100))) : "");
      onPaid(next);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "O pagamento não pôde ser registrado.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!branchId) {
      return;
    }
    apiJson<OsPaymentTerminal[]>(`/payment-terminals?branchId=${encodeURIComponent(branchId)}&status=active`)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setTerminals(list);
        setChargeTerminalId(list.find((terminal) => terminal.isDefault)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setTerminals([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiJson, branchId]);

  async function handleCharge() {
    const parsedAmount = parseOsMoney(amount);
    if (parsedAmount === undefined || parsedAmount <= 0) {
      setError("Informe o valor da cobrança.");
      return;
    }
    setCharging(true);
    setError(null);
    setChargeMessage(null);
    try {
      const response = await apiJson<{
        terminalName?: string;
        environment?: string;
        payment: { id: string; status: string };
      }>("/payments/charge", {
        method: "POST",
        body: JSON.stringify({
          serviceOrderId: summary.serviceOrderId,
          amount: parsedAmount,
          terminalId: chargeTerminalId || undefined,
        }),
      });
      setLastCharge({ id: response.payment.id, status: response.payment.status, environment: response.environment });
      setChargeMessage(
        `Cobrança enviada para a maquininha${response.terminalName ? ` ${response.terminalName}` : ""}. Status: ${osPaymentRecordStatusLabel(response.payment.status)}.`,
      );
    } catch (chargeError) {
      setError(chargeError instanceof Error ? chargeError.message : "A cobrança não pôde ser iniciada.");
    } finally {
      setCharging(false);
    }
  }

  async function handleRefreshCharge() {
    if (!lastCharge) {
      return;
    }
    setCharging(true);
    setError(null);
    try {
      const response = await apiJson<{ payment: { id: string; status: string } }>(
        `/payments/${lastCharge.id}/refresh-status`,
        { method: "POST" },
      );
      setLastCharge({ id: response.payment.id, status: response.payment.status });
      setChargeMessage(`Status da cobrança: ${osPaymentRecordStatusLabel(response.payment.status)}.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Não foi possível consultar a operadora.");
    } finally {
      setCharging(false);
    }
  }
  async function handleSimulateCharge() {
    if (!lastCharge) {
      return;
    }
    setCharging(true);
    setError(null);
    try {
      const response = await apiJson<{ payment: { id: string; status: string } }>(
        `/payments/${lastCharge.id}/simulate-sandbox`,
        { method: "POST" },
      );
      setLastCharge({ id: response.payment.id, status: response.payment.status, environment: lastCharge.environment });
      setChargeMessage(`Status da cobrança: ${osPaymentRecordStatusLabel(response.payment.status)}.`);
    } catch (simulateError) {
      setError(simulateError instanceof Error ? simulateError.message : "A simulação não pôde ser executada.");
    } finally {
      setCharging(false);
    }
  }
  function handlePrimarySubmit(event: FormEvent<HTMLFormElement>) {
    if (paymentMethod === "card") {
      event.preventDefault();
      void handleCharge();
      return;
    }
    return handleSubmit(event);
  }

  return (
    <form className="os-pay-panel" onSubmit={handlePrimarySubmit}>
      <div className="workspace-toolbar__copy">
        <h4 id="os-pay-title">Pagar OS {orderNo}</h4>
        <p>Registra o que já entrou no caixa. Não cobra na maquininha e não abre Pix daqui.</p>
      </div>
      {osShowsFaltaPagamento(summary) ? (
        <p className="os-rule-banner">Falta pagamento. Isso não muda o status da OS.</p>
      ) : (
        <p className="table-subtle">OS quitada.</p>
      )}
      <div className="os-totals-grid">
        <label className="field">
          <span>Total da OS</span>
          <input disabled value={formatOsMoney(Number(summary.orderTotal))} />
        </label>
        <label className="field">
          <span>Já pago</span>
          <input disabled value={formatOsMoney(Number(summary.amountPaid))} />
        </label>
        <label className="field">
          <span>Em aberto</span>
          <input disabled value={formatOsMoney(outstanding)} />
        </label>
      </div>
      <div className="os-header-grid">
        <label className="field">
          <span>Valor recebido</span>
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(applyOsMoneyTyping(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Forma</span>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as OsPaymentMethod)}>
            {OS_PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {osPaymentMethodLabel(method)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {payments.length > 0 ? (
        <ul className="os-pay-history">
          {payments.map((payment) => (
            <li key={payment.id}>
              <span>
                {osPaymentMethodLabel(payment.paymentMethod)}
                {formatOsInstant(payment.receivedAt) ? ` · ${formatOsInstant(payment.receivedAt)}` : ""}
                {payment.paymentMethod === "card" && payment.status ? ` · ${osPaymentRecordStatusLabel(payment.status)}` : ""}
              </span>
              <strong>{formatOsMoney(Number(payment.paymentAmount))}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      {paymentMethod === "card" ? (
        terminals.length > 0 ? (
          <div className="os-charge-box">
            {terminals.length > 1 ? (
              <label className="field">
                <span>Terminal</span>
                <select value={chargeTerminalId} onChange={(event) => setChargeTerminalId(event.target.value)}>
                  {terminals.map((terminal) => (
                    <option key={terminal.id} value={terminal.id}>
                      {terminal.name}
                      {terminal.isDefault ? " (padrão)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="table-subtle">Terminal: {terminals[0].name}</p>
            )}
            {chargeMessage ? <p className="table-subtle">{chargeMessage}</p> : null}
            {lastCharge ? (
              <div className="button-row">
                <button className="button-ghost" disabled={charging} onClick={handleRefreshCharge} type="button">
                  Consultar status
                </button>
                {lastCharge.environment === "sandbox" ? (
                  <button className="button-ghost" disabled={charging} onClick={handleSimulateCharge} type="button">
                    Simular pagamento (sandbox)
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="table-subtle">
            Nenhum terminal ativo nesta filial. Cadastre em Configurações → Pagamentos → Terminais ou escolha outra forma de pagamento.
          </p>
        )
      ) : null}
      {error ? <p className="workspace-flash workspace-flash--error">{error}</p> : null}
      <div className="button-row">
        <button
          className="button"
          disabled={outstanding <= 0 || (paymentMethod === "card" ? charging || !chargeTerminalId : saving)}
          type="submit"
        >
          {paymentMethod === "card"
            ? charging
              ? "Enviando…"
              : "Enviar para pagamento"
            : saving
              ? "Registrando…"
              : "Registrar pagamento"}
        </button>
        <button className="button-secondary" onClick={onClose} type="button">
          Fechar
        </button>
      </div>
    </form>
  );
}
