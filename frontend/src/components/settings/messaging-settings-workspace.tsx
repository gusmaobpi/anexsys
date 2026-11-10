"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { EmailSettingsWorkspace } from "@/components/settings/email-settings-workspace";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type MessagingChannels = {
  tokenConfigured: boolean;
  tokenHint: string | null;
  whatsappSender: string;
  smsSender: string;
};

const EMPTY_CHANNELS: MessagingChannels = {
  tokenConfigured: false,
  tokenHint: null,
  whatsappSender: "",
  smsSender: "",
};

export function MessagingSettingsWorkspace() {
  const { apiJson, hasAnyPermission } = useSession();
  const canEmail = hasAnyPermission("email.write");
  const canChannels = hasAnyPermission("whatsapp.write");
  const [channels, setChannels] = useState<MessagingChannels>(EMPTY_CHANNELS);
  const [apiToken, setApiToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(canChannels);
  const [saving, setSaving] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!canChannels) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const settings = await apiJson<MessagingChannels>("/messaging/channels");
      setChannels(settings);
      setApiToken("");
    } catch (loadError) {
      setError(describeWorkspaceError(loadError, "A configuração da Zenvia não pôde ser carregada."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canChannels]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  async function saveChannels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await apiJson<MessagingChannels>("/messaging/channels", {
        method: "PATCH",
        body: JSON.stringify({
          apiToken,
          whatsappSender: channels.whatsappSender,
          smsSender: channels.smsSender,
        }),
      });
      setChannels(saved);
      setApiToken("");
      setMessage("WhatsApp e SMS gravados.");
    } catch (saveError) {
      setError(describeWorkspaceError(saveError, "WhatsApp e SMS não puderam ser gravados."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workspace-stack">
      <article className="hero-card">
        <div className="eyebrow">Configurações</div>
        <h1 className="title">Mensageria</h1>
        <p>
          Uma configuração por Conta. O e-mail sai direto pela caixa SMTP. Com o token e o remetente de WhatsApp da Zenvia, o aviso sai ao fechar a sacola e de novo quando a OS fica pronta para retirada.
        </p>
      </article>

      {canEmail ? <EmailSettingsWorkspace /> : null}

      {canChannels ? (
        <article className="mini-card cadastro-form">
          <div className="workspace-toolbar__copy">
            <h3>WhatsApp e SMS</h3>
            <p>O token é o da conta Zenvia, inclusive o de sandbox. No WhatsApp do sandbox, o remetente é a keyword do canal. Em branco, o token gravado permanece.</p>
          </div>
          {loading ? <div className="empty-state">Carregando Zenvia…</div> : null}
          {message ? <p>{message}</p> : null}
          {error ? <p>{error}</p> : null}
          {loading ? null : (
            <form className="form-grid" onSubmit={(event) => void saveChannels(event)}>
              <label className="field">
                <span>Token da Zenvia</span>
                <div className="password-field">
                  <input
                    type={tokenVisible ? "text" : "password"}
                    value={apiToken}
                    placeholder={channels.tokenConfigured ? "Em branco mantém o token gravado" : ""}
                    onChange={(event) => setApiToken(event.target.value)}
                  />
                  <button className="button-ghost password-field__toggle" onClick={() => setTokenVisible((current) => !current)} type="button">
                    {tokenVisible ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <span className="table-subtle">
                  {channels.tokenConfigured
                    ? `Token gravado${channels.tokenHint ? `, terminado em ${channels.tokenHint}` : ""}.`
                    : "Token ainda não gravado."}
                </span>
              </label>
              <label className="field">
                <span>Remetente do WhatsApp</span>
                <input
                  inputMode="tel"
                  placeholder="5511988887777"
                  value={channels.whatsappSender}
                  onChange={(event) => setChannels((current) => ({ ...current, whatsappSender: event.target.value }))}
                />
                <span className="table-subtle">Sandbox: a keyword do canal. Produção: o número com DDI e DDD.</span>
              </label>
              <label className="field">
                <span>Remetente do SMS</span>
                <input
                  maxLength={20}
                  placeholder="Atelie"
                  value={channels.smsSender}
                  onChange={(event) => setChannels((current) => ({ ...current, smsSender: event.target.value }))}
                />
                <span className="table-subtle">Nome curto ou número que a Zenvia autorizou para SMS.</span>
              </label>
              <div className="button-row">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Gravando…" : "Gravar WhatsApp e SMS"}
                </button>
              </div>
            </form>
          )}
        </article>
      ) : null}
    </section>
  );
}
