"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { printServiceOrderDocument } from "@/components/service-orders/os-documents";
import {
  describePublicOsError,
  detectCardBrandLabel,
  formatCardExpiryDisplay,
  formatCardNumberDisplay,
  formatPublicOsDate,
  publicAttendantFirstName,
  publicAttendantInitials,
  publicOsAgreement,
  publicOsCta,
  resolvePublicOsStageIndex,
  toPublicOsPrintView,
  type PublicOsTrackingView,
} from "@/components/service-orders/public-os-view";
import { formatOsMoney } from "@/components/service-orders/service-order-workspace-view-model";

async function publicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.method && init.method !== "GET") {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Não foi possível abrir esta OS.";
    throw new Error(message);
  }
  return payload as T;
}

function money(value: string | null | undefined) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? formatOsMoney(amount) : null;
}

const TIMELINE_STEPS = [
  { label: "1. Recebida", sub: "Conferida" },
  { label: "2. Ateliê", sub: "Em costura" },
  { label: "3. Qualidade", sub: "Inspeção" },
  { label: "4. Pronta!", sub: "Liberada" },
  { label: "5. Entregue", sub: "Concluída" },
];

export default function PublicOsPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [view, setView] = useState<PublicOsTrackingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  // Estados do Checkout Online (Pix | Cartão lado a lado)
  const [payMethod, setPayMethod] = useState<"pix" | "card">("pix");
  const [pixCopied, setPixCopied] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [payFeedback, setPayFeedback] = useState<string | null>(null);
  const [scanningCard, setScanningCard] = useState(false);

  const expiryInputRef = useRef<HTMLInputElement | null>(null);
  const cvvInputRef = useRef<HTMLInputElement | null>(null);
  const holderInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      setView(await publicJson<PublicOsTrackingView>(`/os/${token}/data`));
      setError(null);
    } catch (loadError) {
      setView(null);
      setError(describePublicOsError(loadError));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).get("preview") === "1");
  }, []);

  // Câmera para auxiliar na leitura do cartão físico
  useEffect(() => {
    if (!scanningCard) return undefined;
    let stopped = false;
    let stream: MediaStream | null = null;
    const video = cameraVideoRef.current;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then(async (nextStream) => {
        stream = nextStream;
        if (!video || stopped) {
          nextStream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = nextStream;
        await video.play().catch(() => undefined);
      })
      .catch(() => {
        setPayError("Não foi possível abrir a câmera. Você pode usar o preenchimento automático do celular ou digitar os números.");
        setScanningCard(false);
      });
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanningCard]);

  const printView = useMemo(() => (view ? toPublicOsPrintView(view) : null), [view]);
  const cta = view ? publicOsCta(view) : null;
  const agreement = view ? publicOsAgreement(view) : null;
  const totalFormatted = view ? money(view.totalValue) : null;
  const paidFormatted = view ? money(view.paidAmount ?? "0.00") : "0,00";
  const outstandingAmount = view
    ? Number(view.outstandingBalance ?? (view.paymentLabel === "Pago" ? "0" : view.totalValue ?? "0"))
    : 0;
  const outstandingFormatted = formatOsMoney(Math.max(outstandingAmount, 0));
  const isPaid = outstandingAmount <= 0 || view?.paymentStatus === "paid" || view?.paymentLabel === "Pago";
  const stageIdx = view ? resolvePublicOsStageIndex(view.status) : 0;

  async function confirmConcordo() {
    setSaving(true);
    try {
      setView(await publicJson<PublicOsTrackingView>(`/os/${token}/concordo`, { method: "POST" }));
      setError(null);
    } catch (confirmError) {
      setError(describePublicOsError(confirmError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRecebi() {
    setSaving(true);
    try {
      setView(await publicJson<PublicOsTrackingView>(`/os/${token}/recebi`, { method: "POST" }));
      setError(null);
    } catch (confirmError) {
      setError(describePublicOsError(confirmError));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyPix() {
    const code = view?.pixCopyPaste || `00020126580014BR.GOV.BCB.PIX0136${view?.orderNo ?? "OS"}`;
    try {
      await navigator.clipboard?.writeText(code);
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 4000);
    } catch {
      setPixCopied(true);
    }
  }

  async function handleOnlinePay(method: "pix" | "card") {
    setPayError(null);
    setPayFeedback(null);
    if (method === "card") {
      const digits = cardNumber.replace(/\D/g, "");
      if (digits.length < 13) {
        setPayError("Informe os 16 dígitos do cartão de crédito.");
        return;
      }
      if (cardExpiry.replace(/\D/g, "").length < 4) {
        setPayError("Informe a validade do cartão (MM/AA).");
        expiryInputRef.current?.focus();
        return;
      }
      if (cardCvv.replace(/\D/g, "").length < 3) {
        setPayError("Informe o código de segurança CVV (3 dígitos no verso).");
        cvvInputRef.current?.focus();
        return;
      }
      if (!cardHolder.trim()) {
        setPayError("Informe o nome impresso no cartão.");
        holderInputRef.current?.focus();
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await publicJson<PublicOsTrackingView>(`/os/${token}/pay`, {
        method: "POST",
        body: JSON.stringify({
          method,
          cardNumber: method === "card" ? cardNumber : null,
          cardExpiry: method === "card" ? cardExpiry : null,
          cardHolder: method === "card" ? cardHolder : null,
        }),
      });
      setView(updated);
      setPayFeedback("Pagamento confirmado! Sua Ordem de Serviço já está quitada.");
    } catch (err) {
      setPayError(describePublicOsError(err));
    } finally {
      setSaving(false);
    }
  }

  function handleCardNumberChange(value: string) {
    const formatted = formatCardNumberDisplay(value);
    setCardNumber(formatted);
    setPayError(null);
    if (formatted.replace(/\D/g, "").length === 16) {
      expiryInputRef.current?.focus();
    }
  }

  function handleCardExpiryChange(value: string) {
    const formatted = formatCardExpiryDisplay(value);
    setCardExpiry(formatted);
    setPayError(null);
    if (formatted.replace(/\D/g, "").length === 4) {
      cvvInputRef.current?.focus();
    }
  }

  function handleCardCvvChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setCardCvv(digits);
    setPayError(null);
    if (digits.length >= 3 && !cardHolder.trim()) {
      holderInputRef.current?.focus();
    }
  }

  return (
    <div className="screen-shell public-os-shell">
      <section className="auth-card public-os" style={{ maxWidth: 460 }}>
        {error ? <p className="workspace-flash workspace-flash--error">{error}</p> : null}
        {!view && !error ? <p className="subtitle" style={{ padding: 24 }}>Carregando a sua OS…</p> : null}
        {view ? (
          <>
            <div className="auth-card__header" style={{ background: "#f8fafc" }}>
              {view.logo?.contentBase64 ? (
                <div className="brand-frame brand-frame--logo">
                  <img alt={view.companyName} src={`data:${view.logo.mimeType};base64,${view.logo.contentBase64}`} />
                </div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div className="eyebrow">{view.companyName}</div>
                <span className="status-chip status-chip--active">{`OS ${view.orderNo}`}</span>
              </div>
              <h1 className="title" style={{ fontSize: 24, marginTop: 8 }}>
                Olá, {view.customerFirstName}
              </h1>
              <p className="subtitle" style={{ marginTop: 4, fontSize: 13 }}>
                Acompanhe o cuidado com as suas peças em tempo real. Não compartilhe este link.
              </p>
              {view.attendantName ? (
                <div
                  className="public-os__attendant"
                  style={{
                    marginTop: 12,
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "#ffffff",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="brand-frame brand-frame--portrait" style={{ width: 38, height: 38 }}>
                    {view.attendantPortrait?.contentBase64 ? (
                      <img alt="" src={`data:${view.attendantPortrait.mimeType};base64,${view.attendantPortrait.contentBase64}`} />
                    ) : (
                      <span>{publicAttendantInitials(view.attendantName)}</span>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>
                      Atendimento {publicAttendantFirstName(view.attendantName)}
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      Entrada {formatPublicOsDate(view.openedAt)} · Previsão {formatPublicOsDate(view.promisedDeliveryDate)}
                      {view.promisedDeliveryTime ? ` às ${view.promisedDeliveryTime.slice(0, 5)}` : ""}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="table-subtle" style={{ marginTop: 8 }}>
                  Entrada {formatPublicOsDate(view.openedAt)} · Previsão {formatPublicOsDate(view.promisedDeliveryDate)}
                  {view.promisedDeliveryTime ? ` ${view.promisedDeliveryTime.slice(0, 5)}` : ""}
                </p>
              )}
            </div>

            <div className="auth-card__body" style={{ display: "grid", gap: 16 }}>
              {preview ? (
                <p className="os-rule-banner">
                  Este é o formulário que o cliente abre no celular. O aviso e o termo saem de Privacidade.
                </p>
              ) : null}

              {/* LINHA DO TEMPO DE 5 ETAPAS */}
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                    Etapa atual das suas peças
                  </span>
                  <strong className="public-os__status" style={{ fontSize: 14, color: "var(--primary)" }}>
                    {view.statusLabel}
                  </strong>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                    gap: 6,
                  }}
                >
                  {TIMELINE_STEPS.map((step, idx) => {
                    const done = idx < stageIdx || view.status === "picked_up";
                    const current = idx === stageIdx && view.status !== "picked_up";
                    return (
                      <div
                        key={step.label}
                        style={{
                          padding: "8px 4px",
                          borderRadius: 10,
                          border: current
                            ? "2px solid var(--primary)"
                            : done
                              ? "1px solid var(--success-border)"
                              : "1px solid var(--border)",
                          background: current
                            ? "var(--primary-soft)"
                            : done
                              ? "var(--success-bg)"
                              : "var(--surface-alt)",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: current ? "var(--primary)" : done ? "var(--success)" : "var(--text-tertiary)",
                          }}
                        >
                          {done ? `✓ ${step.label}` : step.label}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>{step.sub}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* FICHA DAS PEÇAS E SERVIÇOS (PRIMEIRO A CLIENTE LÊ O QUE FOI COMBINADO) */}
              <div style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                  {`Peças e Serviços (${view.items.length})`}
                </span>
                <ul className="public-os__items" style={{ margin: 0 }}>
                  {view.items.map((item) => {
                    const price = money(item.subtotal ?? item.unitPrice);
                    return (
                      <li
                        key={`${item.itemNo}-${item.description}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          background: "#ffffff",
                        }}
                      >
                        <div style={{ display: "grid", gap: 2 }}>
                          <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>
                            {item.itemType} · {item.description}
                          </strong>
                          {item.complement ? <span style={{ fontSize: 13 }}>{item.complement}</span> : null}
                        </div>
                        {price ? (
                          <span className="public-os__price" style={{ whiteSpace: "nowrap" }}>
                            {`R$ ${price}`}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* APROVAÇÃO DIGITAL ("CONCORDO" — LOGO ABAIXO DAS PEÇAS E SERVIÇOS) */}
              {agreement === "concordo" ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1.5px solid var(--primary)",
                    background: "var(--primary-soft)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    Confirme sua Ordem de Serviço
                  </strong>
                  <p className="table-subtle" style={{ margin: 0, color: "var(--text-secondary)" }}>
                    {view.termsText}
                  </p>
                  <button
                    className="button public-os__cta"
                    disabled={saving}
                    onClick={() => void confirmConcordo()}
                    type="button"
                  >
                    {saving ? "Registrando…" : "✓ Concordo"}
                  </button>
                </div>
              ) : null}

              {agreement === "agreed" ? (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--success-border)",
                    background: "var(--success-bg)",
                    color: "var(--success)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  ✓ Aceite registrado{view.agreedAt ? ` em ${formatPublicOsDate(view.agreedAt)}` : ""}.
                </div>
              ) : null}

              {/* CONFIRMAÇÃO DE RETIRADA ("RECEBI") */}
              {cta === "recebi" ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1.5px solid #16a34a",
                    background: "var(--success-bg)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <strong style={{ fontSize: 14, color: "var(--success)" }}>
                    Suas peças estão prontas para entrega!
                  </strong>
                  <button
                    className="button public-os__cta"
                    disabled={saving}
                    onClick={() => void confirmRecebi()}
                    type="button"
                  >
                    {saving ? "Confirmando…" : "✓ Recebi"}
                  </button>
                </div>
              ) : null}

              {cta === "picked_up" ? (
                <p className="os-rule-banner" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success)" }}>
                  ✓ Retirada confirmada. Obrigada!
                </p>
              ) : null}

              {cta === "waiting_counter" ? (
                <p className="os-rule-banner">
                  Quando estiver no balcão, a atendente libera o botão Recebi neste link.
                </p>
              ) : null}

              {/* =============================================================
               * CHECKOUT LIMPO LADO A LADO: [ ❖ Pix ] | [ 💳 Cartão ]
               * ============================================================= */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: isPaid ? "1.5px solid var(--success-border)" : "1px solid #cbd5e1",
                  background: isPaid ? "var(--success-bg)" : "var(--surface-alt)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                      {isPaid ? "Status do Pagamento" : "Saldo a Pagar"}
                    </span>
                    <strong className="public-os__total" style={{ fontSize: 20 }}>
                      {isPaid ? "✓ Pago" : `R$ ${outstandingFormatted}`}
                    </strong>
                    <span className="table-subtle" style={{ marginTop: 0 }}>
                      {view.paymentLabel}
                    </span>
                  </div>
                  <div style={{ textAlign: "right", display: "grid", gap: 2 }}>
                    {totalFormatted ? (
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {`Total OS: R$ ${totalFormatted}`}
                      </span>
                    ) : null}
                    {paidFormatted && paidFormatted !== "0,00" ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--success)" }}>
                        {`Já pago: R$ ${paidFormatted}`}
                      </span>
                    ) : null}
                  </div>
                </div>

                {payFeedback ? (
                  <p className="workspace-flash workspace-flash--ok" style={{ margin: 0 }}>
                    {payFeedback}
                  </p>
                ) : null}

                {payError ? (
                  <p className="workspace-flash workspace-flash--error" style={{ margin: 0 }}>
                    {payError}
                  </p>
                ) : null}

                {!isPaid && view.status !== "cancelled" ? (
                  <>
                    {/* DOIS BOTÕES GÊMEOS LADO A LADO (50% PIX | 50% CARTÃO) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPayMethod("pix");
                          setPayError(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          minHeight: 44,
                          borderRadius: 12,
                          border: payMethod === "pix" ? "2px solid var(--primary)" : "1px solid var(--border)",
                          background: payMethod === "pix" ? "var(--primary-soft)" : "#ffffff",
                          color: payMethod === "pix" ? "var(--primary)" : "var(--text-primary)",
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                          <path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" />
                        </svg>
                        <span>Pix</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPayMethod("card");
                          setPayError(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          minHeight: 44,
                          borderRadius: 12,
                          border: payMethod === "card" ? "2px solid var(--primary)" : "1px solid var(--border)",
                          background: payMethod === "card" ? "var(--primary-soft)" : "#ffffff",
                          color: payMethod === "card" ? "var(--primary)" : "var(--text-primary)",
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <rect x="2" y="5" width="20" height="14" rx="2.5" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <span>Cartão</span>
                      </button>
                    </div>

                    {/* CONTEÚDO DA ABA PIX */}
                    {payMethod === "pix" ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          background: "#ffffff",
                          border: "1px solid var(--border)",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div
                            style={{
                              width: 68,
                              height: 68,
                              borderRadius: 10,
                              border: "1px solid var(--border)",
                              background: "var(--surface-alt)",
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <svg aria-hidden="true" width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="1.7">
                              <rect x="3" y="3" width="7" height="7" />
                              <rect x="14" y="3" width="7" height="7" />
                              <rect x="3" y="14" width="7" height="7" />
                              <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 19h2M19 14v2" />
                            </svg>
                          </div>
                          <div style={{ display: "grid", gap: 3 }}>
                            <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>
                              Pix Copia e Cola
                            </strong>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              Copie o código abaixo, cole no aplicativo do seu banco e confirme abaixo para baixar sua OS na hora.
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button
                            className="button-secondary"
                            onClick={() => void handleCopyPix()}
                            type="button"
                          >
                            {pixCopied ? "✓ Copiado!" : "Copiar Código Pix"}
                          </button>
                          <button
                            className="button"
                            disabled={saving}
                            onClick={() => void handleOnlinePay("pix")}
                            type="button"
                          >
                            {saving ? "Confirmando…" : "Já paguei o Pix"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* CONTEÚDO DA ABA CARTÃO (CÂMERA + AUTOFILL + AUTO-TAB) */}
                    {payMethod === "card" ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          background: "#ffffff",
                          border: "1px solid var(--border)",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>
                            Cartão de Crédito à vista
                          </strong>
                          <button
                            type="button"
                            onClick={() => setScanningCard((s) => !s)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              height: 28,
                              padding: "0 10px",
                              borderRadius: 999,
                              border: "1px solid #bfdbfe",
                              background: "var(--primary-soft)",
                              color: "var(--primary)",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            <span>📷 {scanningCard ? "Fechar câmera" : "Ler c/ câmera"}</span>
                          </button>
                        </div>

                        {scanningCard ? (
                          <div
                            style={{
                              padding: 10,
                              borderRadius: 10,
                              border: "1.5px dashed var(--primary)",
                              background: "var(--surface-alt)",
                              display: "grid",
                              gap: 8,
                              textAlign: "center",
                            }}
                          >
                            <video
                              ref={cameraVideoRef}
                              muted
                              playsInline
                              style={{ width: "100%", maxHeight: 160, borderRadius: 8, background: "#0f172a" }}
                            />
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              Posicione o cartão na câmera ou toque no campo abaixo e escolha &quot;Escanear Cartão&quot; no teclado do celular.
                            </span>
                          </div>
                        ) : null}

                        <label className="field" style={{ gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span>Número do cartão</span>
                            <span style={{ color: "var(--text-tertiary)" }}>{detectCardBrandLabel(cardNumber)}</span>
                          </div>
                          <input
                            autoComplete="cc-number"
                            inputMode="numeric"
                            name="cardnumber"
                            onChange={(e) => handleCardNumberChange(e.target.value)}
                            placeholder="0000 0000 0000 0000"
                            value={cardNumber}
                          />
                        </label>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <label className="field" style={{ gap: 4 }}>
                            <span>Validade</span>
                            <input
                              ref={expiryInputRef}
                              autoComplete="cc-exp"
                              inputMode="numeric"
                              name="exp-date"
                              onChange={(e) => handleCardExpiryChange(e.target.value)}
                              placeholder="MM/AA"
                              value={cardExpiry}
                            />
                          </label>
                          <label className="field" style={{ gap: 4 }}>
                            <span>CVV (3 dígitos)</span>
                            <input
                              ref={cvvInputRef}
                              autoComplete="cc-csc"
                              inputMode="numeric"
                              name="cvc"
                              onChange={(e) => handleCardCvvChange(e.target.value)}
                              placeholder="123"
                              value={cardCvv}
                            />
                          </label>
                        </div>

                        <label className="field" style={{ gap: 4 }}>
                          <span>Nome impresso no cartão</span>
                          <input
                            ref={holderInputRef}
                            autoComplete="cc-name"
                            name="ccname"
                            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                            placeholder="COMO ESTÁ NO CARTÃO"
                            value={cardHolder}
                          />
                        </label>

                        <button
                          className="button public-os__cta"
                          disabled={saving}
                          onClick={() => void handleOnlinePay("card")}
                          type="button"
                        >
                          {saving ? "Processando…" : `Pagar R$ ${outstandingFormatted} agora`}
                        </button>
                      </div>
                    ) : null}

                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                      Se preferir, você também pode pagar presencialmente na maquininha do ateliê.
                    </span>
                  </>
                ) : null}
              </div>

              {cta === "follow" ? (
                <p className="os-rule-banner" style={{ margin: 0 }}>
                  Avisaremos por WhatsApp quando estiver pronto. Você acompanha o status aqui.
                </p>
              ) : null}

              {view.privacyNotice ? <p className="table-subtle">{view.privacyNotice}</p> : null}

              {printView ? (
                <button
                  className="button-secondary public-os__print"
                  onClick={() => printServiceOrderDocument(printView, view.companyName)}
                  type="button"
                >
                  Ver a via impressa
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
