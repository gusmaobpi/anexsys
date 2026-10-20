"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { formatOsInstant } from "@/components/service-orders/os-approval";
import {
  OS_CARD_MODALITIES,
  OS_INTERNAL_OPTIONS,
  OS_MACHINE_POLL_MS,
  OS_MACHINE_WAIT_MS,
  osChargeWatchExpired,
  osPayCanSend,
  osPayOptionLabel,
  osPaymentHistoryLabel,
  osPaymentRecordStatusLabel,
  osShowsFaltaPagamento,
  type OsFinancialSummary,
  type OsPayChannel,
} from "@/components/service-orders/os-payment";
import { applyOsMoneyTyping, formatOsMoney, parseOsMoney } from "@/components/service-orders/service-order-workspace-view-model";

export type { OsFinancialSummary };

type Props = {
  orderNo: string;
  branchId: string | null;
  summary: OsFinancialSummary;
  canRefund?: boolean;
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
    exigivel: payload.exigivel,
    suspenso: payload.suspenso,
    amountPaid: payload.amountPaid,
    outstandingBalance: payload.outstandingBalance,
    paymentStatus: payload.paymentStatus,
    deliveryBlocked: payload.deliveryBlocked,
    openCharge: payload.openCharge ?? null,
    payments: payload.payments ?? [],
  };
}

export function OsPayPanel({ orderNo, branchId, summary, canRefund = false, onClose, onPaid }: Props) {
  const { apiJson } = useSession();
  const outstanding = Number(summary.outstandingBalance);
  const [amount, setAmount] = useState(outstanding > 0 ? applyOsMoneyTyping(String(Math.round(outstanding * 100))) : "");
  const [channel, setChannel] = useState<OsPayChannel>("card");
  const [option, setOption] = useState("");
  const [reason, setReason] = useState("");
  const [reversalId, setReversalId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<OsPaymentTerminal[]>([]);
  const [terminalsLoaded, setTerminalsLoaded] = useState(false);
  const [chargeTerminalId, setChargeTerminalId] = useState("");
  const [charging, setCharging] = useState(false);
  const [chargeMessage, setChargeMessage] = useState<string | null>(null);
  const [watchExpired, setWatchExpired] = useState(false);
  const inFlight = useRef(false);
  const machineWaitMsRef = useRef(OS_MACHINE_WAIT_MS);
  const [lastCharge, setLastCharge] = useState<{ id: string; status: string; environment?: string | null } | null>(
    summary.openCharge
      ? { id: summary.openCharge.id, status: summary.openCharge.status, environment: summary.openCharge.environment }
      : null,
  );
  const payments = summary.payments ?? [];
  const pendingCharge = lastCharge?.status === "pending" || summary.openCharge?.status === "pending";

  async function handleReverse(paymentId: string) {
    if (!reversalReason.trim()) {
      setError("Informe o motivo do estorno.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiJson<OsFinancialSummary>(`/payments/${paymentId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      setReversalId(null);
      setReversalReason("");
      onPaid(toPaySummary(response));
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "O estorno não pôde ser registrado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = parseOsMoney(amount);
    if (channel !== "internal" || !option) {
      setError("Escolha Dinheiro, Crédito, Débito ou PIX.");
      return;
    }
    if (!reason.trim()) {
      setError("Informe o motivo da baixa manual.");
      return;
    }
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
          paymentMethod: option === "cash" ? "cash" : option === "pix" ? "pix" : "card",
          informedModality: option === "cash" ? undefined : option,
          paymentAmount: parsedAmount,
          status: "received",
          manualReason: reason.trim(),
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
    setTerminalsLoaded(false);
    if (!branchId) {
      setTerminalsLoaded(true);
      return;
    }
    apiJson<OsPaymentTerminal[]>(`/payment-terminals?branchId=${encodeURIComponent(branchId)}&status=active`)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setTerminals(list);
        setChargeTerminalId(list.find((terminal) => terminal.isDefault)?.id ?? list[0]?.id ?? "");
        setTerminalsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setTerminals([]);
          setTerminalsLoaded(true);
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
    if (!option) {
      setError("Escolha Crédito, Débito ou Pix.");
      return;
    }
    if (pendingCharge || charging) {
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
        summary?: OsFinancialSummary;
      }>("/payments/charge", {
        method: "POST",
        body: JSON.stringify({
          serviceOrderId: summary.serviceOrderId,
          amount: parsedAmount,
          modality: option,
          terminalId: chargeTerminalId || undefined,
        }),
      });
      setLastCharge({ id: response.payment.id, status: response.payment.status, environment: response.environment });
      setChargeMessage(
        `Cobrança enviada para a maquininha${response.terminalName ? ` ${response.terminalName}` : ""}. Status: ${osPaymentRecordStatusLabel(response.payment.status)}.`,
      );
      if (response.summary) {
        onPaid(toPaySummary({ ...response.summary, serviceOrderId: summary.serviceOrderId }));
      }
    } catch (chargeError) {
      setError(chargeError instanceof Error ? chargeError.message : "A cobrança não pôde ser iniciada.");
    } finally {
      setCharging(false);
    }
  }

  const lastChargeRef = useRef(lastCharge);
  lastChargeRef.current = lastCharge;

  const consultCharge = useCallback(
    async (quiet = false) => {
      const charge = lastChargeRef.current;
      if (!charge || inFlight.current) {
        return charge?.status ?? "pending";
      }
      inFlight.current = true;
      if (!quiet) {
        setCharging(true);
        setError(null);
      }
      try {
        const response = await apiJson<{ payment: { id: string; status: string }; summary?: OsFinancialSummary }>(
          `/payments/${charge.id}/refresh-status`,
          { method: "POST" },
        );
        const status = response.payment.status;
        setLastCharge({ id: response.payment.id, status, environment: charge.environment });
        if (status === "pending") {
          if (!quiet) {
            setChargeMessage(`Status da cobrança: ${osPaymentRecordStatusLabel(status)}.`);
          }
          return status;
        }
        setChargeMessage(
          status === "canceled" || status === "failed"
            ? "A maquininha não confirmou o pagamento. A OS não foi paga."
            : `Status da cobrança: ${osPaymentRecordStatusLabel(status)}.`,
        );
        if (response.summary) {
          onPaid(toPaySummary({ ...response.summary, serviceOrderId: summary.serviceOrderId }));
        }
        return status;
      } catch (refreshError) {
        if (!quiet) {
          setError(refreshError instanceof Error ? refreshError.message : "Não foi possível consultar a operadora.");
        }
        return "pending";
      } finally {
        inFlight.current = false;
        if (!quiet) {
          setCharging(false);
        }
      }
    },
    [apiJson, onPaid, summary.serviceOrderId],
  );

  useEffect(() => {
    let alive = true;
    void apiJson<{ machineWaitMinutes?: number }>("/payment-parameters")
      .then((response) => {
        const minutes = Number(response.machineWaitMinutes);
        if (!alive || !Number.isInteger(minutes) || minutes <= 0) {
          return;
        }
        machineWaitMsRef.current = minutes * 60 * 1000;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [apiJson]);

  useEffect(() => {
    setWatchExpired(false);
  }, [lastCharge?.id]);

  const pendingChargeId = lastCharge?.status === "pending" ? lastCharge.id : null;

  useEffect(() => {
    if (!pendingChargeId || watchExpired) {
      return;
    }
    const startedAt = Date.now();
    let alive = true;
    const timer = window.setInterval(() => {
      const current = lastChargeRef.current;
      if (!alive || !current || current.status !== "pending" || inFlight.current) {
        return;
      }
      if (osChargeWatchExpired(startedAt, Date.now(), machineWaitMsRef.current)) {
        window.clearInterval(timer);
        void consultCharge(true).finally(() => {
          if (!alive) {
            return;
          }
          setWatchExpired(true);
          if (lastChargeRef.current?.status === "pending") {
            setChargeMessage(
              "O tempo de espera acabou. A cobrança continua na maquininha. Cancele ou consulte o status antes de enviar outra.",
            );
          }
        });
        return;
      }
      void consultCharge(true);
    }, OS_MACHINE_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [consultCharge, pendingChargeId, watchExpired]);

  async function handleRefreshCharge() {
    await consultCharge(false);
  }

  async function handleCancelCharge() {
    const charge = lastChargeRef.current;
    if (!charge || charge.status !== "pending") {
      return;
    }
    setCharging(true);
    setError(null);
    try {
      const response = await apiJson<{ payment: { id: string; status: string }; summary?: OsFinancialSummary }>(
        `/payments/${charge.id}/cancel`,
        { method: "POST" },
      );
      const status = response.payment.status;
      setLastCharge({ id: response.payment.id, status, environment: charge.environment });
      setChargeMessage(
        status === "settled" || status === "received" || status === "authorized"
          ? "A maquininha já confirmou o pagamento."
          : "Cobrança cancelada. A OS não foi paga.",
      );
      if (response.summary) {
        onPaid(toPaySummary({ ...response.summary, serviceOrderId: summary.serviceOrderId }));
      }
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "A cobrança não pôde ser cancelada.");
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
      const response = await apiJson<{ payment: { id: string; status: string }; summary?: OsFinancialSummary }>(
        `/payments/${lastCharge.id}/simulate-sandbox`,
        { method: "POST" },
      );
      setLastCharge({ id: response.payment.id, status: response.payment.status, environment: lastCharge.environment });
      setChargeMessage(`Status da cobrança: ${osPaymentRecordStatusLabel(response.payment.status)}.`);
      if (response.summary) {
        onPaid(toPaySummary({ ...response.summary, serviceOrderId: summary.serviceOrderId }));
      }
    } catch (simulateError) {
      setError(simulateError instanceof Error ? simulateError.message : "A simulação não pôde ser executada.");
    } finally {
      setCharging(false);
    }
  }
  function chooseChannel(next: OsPayChannel) {
    if (next === channel) {
      return;
    }
    setChannel(next);
    setOption("");
    setReason("");
    setError(null);
  }

  function handlePrimarySubmit(event: FormEvent<HTMLFormElement>) {
    if (channel === "card") {
      event.preventDefault();
      void handleCharge();
      return;
    }
    return handleSubmit(event);
  }

  const terminalReady = Boolean(chargeTerminalId);
  const canSend = osPayCanSend({
    channel,
    option,
    outstanding,
    pendingCharge,
    busy: channel === "card" ? charging : saving,
    terminalReady,
    reason,
  });
  const subOptions = channel === "card" ? OS_CARD_MODALITIES : channel === "internal" ? OS_INTERNAL_OPTIONS : [];

  return (
    <form className="os-pay-panel" onSubmit={handlePrimarySubmit}>
      <div className="workspace-toolbar__copy">
        <h4 id="os-pay-title">Pagar OS {orderNo}</h4>
        <p>Cartão envia a cobrança para a maquininha. Interno registra a baixa manual no caixa.</p>
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
          <span>Saldo em aberto</span>
          <input disabled value={formatOsMoney(outstanding)} />
        </label>
      </div>
      <label className="field">
        <span>Valor recebido</span>
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(event) => setAmount(applyOsMoneyTyping(event.target.value))}
        />
      </label>
      <div className="field">
        <span>Forma de pagamento</span>
        <div className="os-pay-choices" role="group" aria-label="Forma de pagamento">
          <button
            aria-pressed={channel === "card"}
            className={channel === "card" ? "button" : "button-secondary"}
            onClick={() => chooseChannel("card")}
            type="button"
          >
            Cartão
          </button>
          <button
            aria-pressed={channel === "internal"}
            className={channel === "internal" ? "button" : "button-secondary"}
            onClick={() => chooseChannel("internal")}
            type="button"
          >
            Interno
          </button>
        </div>
      </div>
      {channel === "internal" ? (
        <label className="field">
          <span>Motivo da baixa</span>
          <textarea
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Quem recebeu fora da maquininha e por quê"
            rows={2}
            value={reason}
          />
        </label>
      ) : null}
      {channel ? (
        <div className="field">
          <span>{channel === "card" ? "Na maquininha" : "Baixa manual"}</span>
          <div className="os-pay-choices" role="group" aria-label={channel === "card" ? "Na maquininha" : "Baixa manual"}>
            {subOptions.map((choice) => (
              <button
                aria-pressed={option === choice}
                className={option === choice ? "button" : "button-secondary"}
                key={choice}
                onClick={() => {
                  setOption(choice);
                  setError(null);
                }}
                type="button"
              >
                {osPayOptionLabel(channel, choice)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {payments.length > 0 ? (
        <ul className="os-pay-history">
          {payments.map((payment) => {
            const reversible = canRefund && (payment.status === "received" || payment.status === "settled");
            return (
              <li key={payment.id}>
                <span>
                  {osPaymentHistoryLabel(payment)}
                  {formatOsInstant(payment.receivedAt) ? ` · ${formatOsInstant(payment.receivedAt)}` : ""}
                </span>
                <strong>{formatOsMoney(Number(payment.paymentAmount))}</strong>
                {reversible ? (
                  <button className="button-ghost" disabled={saving} onClick={() => setReversalId(payment.id)} type="button">
                    Estornar
                  </button>
                ) : null}
                {reversalId === payment.id ? (
                  <label className="field">
                    <span>Motivo do estorno</span>
                    <textarea
                      maxLength={200}
                      onChange={(event) => setReversalReason(event.target.value)}
                      placeholder="Por que este pagamento volta"
                      rows={2}
                      value={reversalReason}
                    />
                    <button className="button" disabled={saving || !reversalReason.trim()} onClick={() => void handleReverse(payment.id)} type="button">
                      Confirmar estorno
                    </button>
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {lastCharge ? (
        <div className="os-charge-box">
          {chargeMessage ? <p className="table-subtle">{chargeMessage}</p> : null}
          <div className="button-row">
            <button className="button-ghost" disabled={charging} onClick={() => void handleRefreshCharge()} type="button">
              Consultar status
            </button>
            {lastCharge.status === "pending" ? (
              <button className="button-ghost" disabled={charging} onClick={() => void handleCancelCharge()} type="button">
                Cancelar cobrança
              </button>
            ) : null}
            {lastCharge.environment === "sandbox" ? (
              <button className="button-ghost" disabled={charging} onClick={handleSimulateCharge} type="button">
                Simular pagamento (sandbox)
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {channel === "card" ? (
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
          </div>
        ) : terminalsLoaded ? (
          <p className="table-subtle">
            Esta filial da OS não tem terminal ativo. O envio do cartão continua bloqueado. Cadastre o terminal em Configurações → Pagamentos → Terminais.
          </p>
        ) : null
      ) : null}
      {error ? <p className="workspace-flash workspace-flash--error">{error}</p> : null}
      <div className="button-row">
        <button className="button" disabled={!canSend} type="submit">
          {pendingCharge
            ? "Aguardando maquininha"
            : channel === "card" && charging
              ? "Enviando…"
              : saving
                ? "Registrando…"
                : "Enviar pagamento"}
        </button>
        <button className="button-secondary" onClick={onClose} type="button">
          Fechar
        </button>
      </div>
    </form>
  );
}
