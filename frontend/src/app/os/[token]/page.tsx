"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { printServiceOrderDocument } from "@/components/service-orders/os-documents";
import {
  describePublicOsError,
  formatPublicOsDate,
  publicAttendantFirstName,
  publicAttendantInitials,
  publicOsAgreement,
  publicOsCta,
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

export default function PublicOsPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [view, setView] = useState<PublicOsTrackingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

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

  const printView = useMemo(() => (view ? toPublicOsPrintView(view) : null), [view]);
  const cta = view ? publicOsCta(view) : null;
  const agreement = view ? publicOsAgreement(view) : null;
  const total = view ? money(view.totalValue) : null;

  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).get("preview") === "1");
  }, []);

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

  return (
    <div className="screen-shell public-os-shell">
      <section className="auth-card public-os">
        {error ? <p className="workspace-flash workspace-flash--error">{error}</p> : null}
        {!view && !error ? <p className="subtitle">Carregando a sua OS…</p> : null}
        {view ? (
          <>
            <div className="auth-card__header">
              {view.logo?.contentBase64 ? (
                <div className="brand-frame brand-frame--logo">
                  <img alt={view.companyName} src={`data:${view.logo.mimeType};base64,${view.logo.contentBase64}`} />
                </div>
              ) : null}
              <div className="eyebrow">{view.companyName}</div>
              <h1 className="title">Olá, {view.customerFirstName}</h1>
              <p className="subtitle">
                OS <strong>{view.orderNo}</strong>. Não compartilhe este link.
              </p>
              {view.attendantName ? (
                <div className="public-os__attendant">
                  <div className="brand-frame brand-frame--portrait">
                    {view.attendantPortrait?.contentBase64 ? (
                      <img alt="" src={`data:${view.attendantPortrait.mimeType};base64,${view.attendantPortrait.contentBase64}`} />
                    ) : (
                      <span>{publicAttendantInitials(view.attendantName)}</span>
                    )}
                  </div>
                  <span>Atendimento {publicAttendantFirstName(view.attendantName)}</span>
                </div>
              ) : null}
            </div>
            <div className="auth-card__body">
              {preview ? (
                <p className="os-rule-banner">
                  Este é o formulário que o cliente abre no celular. O texto jurídico ainda pode ser ajustado. O WhatsApp entra quando a Meta liberar o número.
                </p>
              ) : null}
              <p className="public-os__status">{view.statusLabel}</p>
              <p className="table-subtle">
                Entrada {formatPublicOsDate(view.openedAt)} · Previsão {formatPublicOsDate(view.promisedDeliveryDate)}
                {view.promisedDeliveryTime ? ` ${view.promisedDeliveryTime.slice(0, 5)}` : ""}
              </p>
              <p className="table-subtle">{view.paymentLabel}</p>
              <ul className="public-os__items">
                {view.items.map((item) => {
                  const price = money(item.subtotal ?? item.unitPrice);
                  return (
                    <li key={`${item.itemNo}-${item.description}`}>
                      <strong>
                        {item.itemType} · {item.description}
                      </strong>
                      {item.complement ? <span>{item.complement}</span> : null}
                      {price ? <span className="public-os__price">{price}</span> : null}
                    </li>
                  );
                })}
              </ul>
              {total ? <p className="public-os__total">Total {total}</p> : null}
              {view.privacyNotice ? <p className="table-subtle">{view.privacyNotice}</p> : null}
              {agreement === "agreed" ? (
                <p className="os-rule-banner">
                  Aceite registrado{view.agreedAt ? ` em ${formatPublicOsDate(view.agreedAt)}` : ""}.
                </p>
              ) : null}
              {agreement === "concordo" ? (
                <>
                  <p className="table-subtle">{view.termsText}</p>
                  <button className="button public-os__cta" disabled={saving} onClick={() => void confirmConcordo()} type="button">
                    {saving ? "Registrando…" : "Concordo"}
                  </button>
                </>
              ) : null}
              {cta === "picked_up" ? <p className="os-rule-banner">Retirada confirmada. Obrigada.</p> : null}
              {cta === "recebi" ? (
                <button className="button public-os__cta" disabled={saving} onClick={() => void confirmRecebi()} type="button">
                  {saving ? "Confirmando…" : "Recebi"}
                </button>
              ) : null}
              {cta === "waiting_counter" ? (
                <p className="os-rule-banner">Quando estiver no balcão, a atendente libera o botão Recebi neste link.</p>
              ) : null}
              {cta === "follow" ? (
                <p className="os-rule-banner">Avisaremos por WhatsApp quando estiver pronto. Você acompanha o status aqui.</p>
              ) : null}
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
