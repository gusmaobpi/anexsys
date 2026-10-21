"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function ResetPasswordForm() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("As senhas não conferem.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/backend-api/auth/first-access/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const text = Array.isArray(payload?.message) ? payload?.message.join(" ") : payload?.message;
        setMessage(text || "O link não pôde ser usado. Peça outro.");
        return;
      }
      setDone(true);
    } catch {
      setMessage("O link não pôde ser usado. Peça outro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-shell">
      <section className="auth-card">
        <div className="auth-card__header">
          <div className="eyebrow">ANEXSYS</div>
          <h1 className="title">Definir senha</h1>
          <p className="subtitle">O link vale por 72 horas e só pode ser usado uma vez.</p>
        </div>
        <div className="auth-card__body">
          {done ? (
            <div className="form-grid">
              <p>Senha definida. Entre com o e-mail e a nova senha.</p>
              <Link href="/login">Ir para o login</Link>
            </div>
          ) : (
            <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
              {message ? <p>{message}</p> : null}
              <label className="field">
                <span>E-mail</span>
                <input readOnly value={email} />
              </label>
              <label className="field">
                <span>Nova senha</span>
                <div className="password-field">
                  <input
                    minLength={8}
                    required
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button className="button-ghost password-field__toggle" onClick={() => setVisible((current) => !current)} type="button">
                    {visible ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>
              <label className="field">
                <span>Confirmar senha</span>
                <input
                  minLength={8}
                  required
                  type={visible ? "text" : "password"}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button className="button" disabled={submitting || !email || !token} type="submit">
                  {submitting ? "Gravando…" : "Gravar senha"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="screen-shell">Carregando…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
