"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type EmailSettings = {
  host: string;
  port: number;
  security: "none" | "starttls" | "ssl";
  username: string;
  fromName: string;
  fromAddress: string;
  publicLinkOrigin: string;
  passwordConfigured: boolean;
  passwordHint: string | null;
};

const EMPTY: EmailSettings = {
  host: "",
  port: 587,
  security: "starttls",
  username: "",
  fromName: "",
  fromAddress: "",
  publicLinkOrigin: "",
  passwordConfigured: false,
  passwordHint: null,
};

export function EmailSettingsWorkspace() {
  const { apiJson } = useSession();
  const [form, setForm] = useState<EmailSettings>(EMPTY);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await apiJson<EmailSettings>("/email/settings");
      setForm(settings);
      setPassword("");
    } catch (loadError) {
      setError(describeWorkspaceError(loadError, "A configuração de e-mail não pôde ser carregada."));
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await apiJson<EmailSettings>("/email/settings", {
        method: "PATCH",
        body: JSON.stringify({
          host: form.host,
          port: Number(form.port),
          security: form.security,
          username: form.username,
          password,
          fromName: form.fromName,
          fromAddress: form.fromAddress,
          publicLinkOrigin: form.publicLinkOrigin,
        }),
      });
      setForm(saved);
      setPassword("");
      setMessage("Caixa de e-mail gravada.");
    } catch (saveError) {
      setError(describeWorkspaceError(saveError, "A caixa de e-mail não pôde ser gravada."));
    } finally {
      setSaving(false);
    }
  }

  async function testSend() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await apiJson("/email/settings/test", { method: "POST" });
      setMessage("E-mail de teste enviado para o seu usuário.");
    } catch (testError) {
      setError(describeWorkspaceError(testError, "O teste não foi enviado."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty-state">Carregando e-mail…</div>;
  }

  return (
    <section className="workspace-stack">
      <article className="mini-card cadastro-form">
        <div className="workspace-toolbar__copy">
          <h3>E-mail</h3>
          <p>Uma caixa por Conta. A senha é gravada e não volta para a tela. O convite e o esqueci a senha usam este remetente. Sem a caixa, o link de acesso continua aparecendo na tela de usuários.</p>
        </div>
        {message ? <p>{message}</p> : null}
        {error ? <p>{error}</p> : null}
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <label className="field">
            <span>Servidor</span>
            <input value={form.host} onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))} />
          </label>
          <label className="field">
            <span>Porta</span>
            <input
              min={1}
              max={65535}
              type="number"
              value={form.port}
              onChange={(event) => setForm((current) => ({ ...current, port: Number(event.target.value) }))}
            />
          </label>
          <label className="field">
            <span>Segurança</span>
            <select value={form.security} onChange={(event) => setForm((current) => ({ ...current, security: event.target.value as EmailSettings["security"] }))}>
              <option value="starttls">STARTTLS</option>
              <option value="ssl">SSL</option>
              <option value="none">Nenhuma</option>
            </select>
          </label>
          <label className="field">
            <span>Usuário da caixa</span>
            <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label className="field">
            <span>Senha da caixa</span>
            <div className="password-field">
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                placeholder={form.passwordConfigured ? "Em branco mantém a senha gravada" : ""}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button className="button-ghost password-field__toggle" onClick={() => setPasswordVisible((current) => !current)} type="button">
                {passwordVisible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <span className="table-subtle">
              {form.passwordConfigured ? `Senha gravada${form.passwordHint ? `, terminada em ${form.passwordHint}` : ""}.` : "Senha ainda não gravada."}
            </span>
          </label>
          <label className="field">
            <span>Nome do remetente</span>
            <input value={form.fromName} onChange={(event) => setForm((current) => ({ ...current, fromName: event.target.value }))} />
          </label>
          <label className="field">
            <span>E-mail do remetente</span>
            <input type="email" value={form.fromAddress} onChange={(event) => setForm((current) => ({ ...current, fromAddress: event.target.value }))} />
          </label>
          <label className="field">
            <span>Origem do link</span>
            <input
              placeholder="https://hml.atelierizagusmao.com.br"
              value={form.publicLinkOrigin}
              onChange={(event) => setForm((current) => ({ ...current, publicLinkOrigin: event.target.value }))}
            />
          </label>
          <div className="button-row">
            <button className="button" disabled={saving} type="submit">
              {saving ? "Gravando…" : "Gravar"}
            </button>
            <button className="button-secondary" disabled={saving} onClick={() => void testSend()} type="button">
              Testar envio
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
