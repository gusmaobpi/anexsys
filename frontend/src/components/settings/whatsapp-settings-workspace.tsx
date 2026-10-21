"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

const VARIABLES = [
  { token: "{primeiro_nome}", label: "Primeiro nome" },
  { token: "{estabelecimento}", label: "Estabelecimento" },
  { token: "{numero_os}", label: "Número da OS" },
  { token: "{previsao}", label: "Previsão" },
  { token: "{link}", label: "Link" },
];

const TEMPLATE_LABELS: Record<string, string> = {
  os_opened: "OS aberta",
  ready_for_pickup: "Pronto para retirada",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
};

type TemplateDraft = {
  code: string;
  body: string;
  metaName: string;
  language: string;
  status: string;
  statusDetail: string | null;
};

type NumberHistory = {
  phoneDisplay: string;
  phoneNumberId: string;
  replacedAt: string;
};

type WhatsappSettings = {
  phoneDisplay: string;
  wabaId: string;
  phoneNumberId: string;
  tokenConfigured: boolean;
  tokenHint: string;
  environment: string;
  maxAttempts: number;
  retryIntervalMinutes: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  consentText: string;
  publicLinkOrigin: string;
  webhookVerifyToken: string;
  templates: TemplateDraft[];
  numberHistory: NumberHistory[];
};

type AccountDraft = {
  phoneDisplay: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  environment: string;
  maxAttempts: string;
  retryIntervalMinutes: string;
  sendWindowStart: string;
  sendWindowEnd: string;
  consentText: string;
  publicLinkOrigin: string;
};

function accountFrom(settings: WhatsappSettings): AccountDraft {
  return {
    phoneDisplay: settings.phoneDisplay,
    wabaId: settings.wabaId,
    phoneNumberId: settings.phoneNumberId,
    accessToken: "",
    environment: settings.environment,
    maxAttempts: String(settings.maxAttempts),
    retryIntervalMinutes: String(settings.retryIntervalMinutes),
    sendWindowStart: settings.sendWindowStart,
    sendWindowEnd: settings.sendWindowEnd,
    consentText: settings.consentText,
    publicLinkOrigin: settings.publicLinkOrigin,
  };
}

export function WhatsappSettingsWorkspace() {
  const { apiJson } = useSession();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [account, setAccount] = useState<AccountDraft | null>(null);
  const [templates, setTemplates] = useState<TemplateDraft[]>([]);
  const [testPhone, setTestPhone] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: WhatsappSettings) => {
    setSettings(next);
    setAccount(accountFrom(next));
    setTemplates(next.templates);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      apply(await apiJson<WhatsappSettings>("/whatsapp/settings"));
      setError(null);
    } catch (loadError) {
      setError(describeWorkspaceError(loadError, "A configuração do WhatsApp não pôde ser carregada."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    if (!account || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const next = await apiJson<WhatsappSettings>("/whatsapp/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...account,
          maxAttempts: Number(account.maxAttempts),
          retryIntervalMinutes: Number(account.retryIntervalMinutes),
          accessToken: account.accessToken.trim() || undefined,
        }),
      });
      apply(next);
      setMessage("Configuração do WhatsApp gravada.");
    } catch (saveError) {
      setError(describeWorkspaceError(saveError, "A configuração não pôde ser gravada."));
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(template: TemplateDraft) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const next = await apiJson<WhatsappSettings>(`/whatsapp/templates/${template.code}`, {
        method: "PATCH",
        body: JSON.stringify({ body: template.body, metaName: template.metaName }),
      });
      apply(next);
      setMessage(`Texto de ${TEMPLATE_LABELS[template.code] ?? template.code} gravado.`);
    } catch (saveError) {
      setError(describeWorkspaceError(saveError, "O texto não pôde ser gravado."));
    } finally {
      setSaving(false);
    }
  }

  async function runTemplate(template: TemplateDraft, action: "submit" | "refresh" | "test") {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      if (action === "test") {
        const result = await apiJson<{ message: string }>(`/whatsapp/templates/${template.code}/test`, {
          method: "POST",
          body: JSON.stringify({ phone: testPhone[template.code] ?? "" }),
        });
        setMessage(result.message);
      } else {
        const next = await apiJson<WhatsappSettings>(`/whatsapp/templates/${template.code}/${action}`, { method: "POST" });
        apply(next);
        setMessage(action === "submit" ? "Modelo enviado para a análise da Meta." : "Situação do modelo atualizada.");
      }
    } catch (actionError) {
      setError(describeWorkspaceError(actionError, "A Meta não concluiu este passo."));
    } finally {
      setSaving(false);
    }
  }

  const webhookUrl = typeof window === "undefined" ? "" : `${window.location.origin}/backend-api/public/whatsapp/webhook`;

  return (
    <section className="workspace-stack">
      <article className="mini-card">
        <h3>WhatsApp</h3>
        <p className="table-subtle">Vale para a conta inteira. O texto, o número, o token e a janela ficam nesta tela.</p>
        {loading ? <p>Carregando WhatsApp…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
      </article>

      {!loading && account && settings ? (
        <article className="mini-card">
          <h3>Conta e número</h3>
          <form className="form-grid" onSubmit={saveAccount}>
            <div className="filters-grid">
              <label className="field">
                <span>Número ativo</span>
                <input value={account.phoneDisplay} onChange={(event) => setAccount({ ...account, phoneDisplay: event.target.value })} />
              </label>
              <label className="field">
                <span>Ambiente</span>
                <select value={account.environment} onChange={(event) => setAccount({ ...account, environment: event.target.value })}>
                  <option value="test">Teste</option>
                  <option value="production">Produção</option>
                </select>
              </label>
            </div>
            <div className="filters-grid">
              <label className="field">
                <span>Identificador da conta na Meta</span>
                <input value={account.wabaId} onChange={(event) => setAccount({ ...account, wabaId: event.target.value })} />
              </label>
              <label className="field">
                <span>Identificador do telefone</span>
                <input value={account.phoneNumberId} onChange={(event) => setAccount({ ...account, phoneNumberId: event.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Token de acesso</span>
              <input
                autoComplete="off"
                placeholder={settings.tokenConfigured ? `Gravado, final ${settings.tokenHint}. Preencha só para trocar.` : "Cole o token da Meta"}
                type="password"
                value={account.accessToken}
                onChange={(event) => setAccount({ ...account, accessToken: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Endereço do link</span>
              <input
                placeholder="https://hml.atelierizagusmao.com.br"
                value={account.publicLinkOrigin}
                onChange={(event) => setAccount({ ...account, publicLinkOrigin: event.target.value })}
              />
            </label>
            <div className="filters-grid">
              <label className="field">
                <span>Tentativas antes da falha</span>
                <input inputMode="numeric" value={account.maxAttempts} onChange={(event) => setAccount({ ...account, maxAttempts: event.target.value })} />
              </label>
              <label className="field">
                <span>Intervalo entre tentativas (minutos)</span>
                <input
                  inputMode="numeric"
                  value={account.retryIntervalMinutes}
                  onChange={(event) => setAccount({ ...account, retryIntervalMinutes: event.target.value })}
                />
              </label>
            </div>
            <div className="filters-grid">
              <label className="field">
                <span>Enviar a partir de</span>
                <input type="time" value={account.sendWindowStart} onChange={(event) => setAccount({ ...account, sendWindowStart: event.target.value })} />
              </label>
              <label className="field">
                <span>Enviar até</span>
                <input type="time" value={account.sendWindowEnd} onChange={(event) => setAccount({ ...account, sendWindowEnd: event.target.value })} />
              </label>
            </div>
            <p className="table-subtle">Janela vazia envia na hora. Fora da janela, o aviso espera na fila.</p>
            <label className="field">
              <span>Texto de autorização do cliente</span>
              <textarea rows={3} value={account.consentText} onChange={(event) => setAccount({ ...account, consentText: event.target.value })} />
            </label>
            <p className="table-subtle">Endereço para colar na Meta: {webhookUrl}</p>
            <p className="table-subtle">Token de verificação: {settings.webhookVerifyToken}</p>
            <div className="button-row">
              <button className="button" disabled={saving} type="submit">
                {saving ? "Gravando…" : "Gravar"}
              </button>
            </div>
          </form>
          {settings.numberHistory.length > 0 ? (
            <div>
              <h4>Histórico de números</h4>
              <ul className="placeholder-list">
                {settings.numberHistory.map((item) => (
                  <li key={`${item.phoneNumberId}-${item.replacedAt}`}>
                    {item.phoneDisplay || item.phoneNumberId} · substituído em {new Date(item.replacedAt).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ) : null}

      {templates.map((template) => (
        <article className="mini-card" key={template.code}>
          <h3>{TEMPLATE_LABELS[template.code] ?? template.code}</h3>
          <p className="table-subtle">
            Situação na Meta: {STATUS_LABELS[template.status] ?? template.status}
            {template.statusDetail ? ` · ${template.statusDetail}` : ""}
          </p>
          <div className="button-row">
            {VARIABLES.map((variable) => (
              <button
                className="button-secondary"
                key={variable.token}
                onClick={() =>
                  setTemplates((current) =>
                    current.map((item) =>
                      item.code === template.code ? { ...item, body: `${item.body}${item.body.endsWith(" ") || item.body.length === 0 ? "" : " "}${variable.token}` } : item,
                    ),
                  )
                }
                type="button"
              >
                {variable.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Texto</span>
            <textarea
              rows={5}
              value={template.body}
              onChange={(event) =>
                setTemplates((current) => current.map((item) => (item.code === template.code ? { ...item, body: event.target.value } : item)))
              }
            />
          </label>
          <label className="field">
            <span>Nome do modelo na Meta</span>
            <input
              value={template.metaName}
              onChange={(event) =>
                setTemplates((current) => current.map((item) => (item.code === template.code ? { ...item, metaName: event.target.value } : item)))
              }
            />
          </label>
          <div className="filters-grid">
            <label className="field">
              <span>Celular para teste</span>
              <input
                value={testPhone[template.code] ?? ""}
                onChange={(event) => setTestPhone((current) => ({ ...current, [template.code]: event.target.value }))}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="button" disabled={saving} onClick={() => void saveTemplate(template)} type="button">
              Gravar texto
            </button>
            <button className="button-secondary" disabled={saving} onClick={() => void runTemplate(template, "submit")} type="button">
              Pedir aprovação na Meta
            </button>
            <button className="button-secondary" disabled={saving} onClick={() => void runTemplate(template, "refresh")} type="button">
              Atualizar situação
            </button>
            <button className="button-secondary" disabled={saving} onClick={() => void runTemplate(template, "test")} type="button">
              Testar envio
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
