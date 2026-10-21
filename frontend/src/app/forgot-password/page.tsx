"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/backend-api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(payload?.message ?? "Se o e-mail estiver cadastrado, enviaremos o link para definir a senha.");
    } catch {
      setMessage("Se o e-mail estiver cadastrado, enviaremos o link para definir a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-shell">
      <section className="auth-card">
        <div className="auth-card__header">
          <div className="eyebrow">ANEXSYS</div>
          <h1 className="title">Esqueci a senha</h1>
          <p className="subtitle">Informe o e-mail do usuário. A resposta é a mesma mesmo quando o e-mail não existe.</p>
        </div>
        <div className="auth-card__body">
          <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
            {message ? <p>{message}</p> : null}
            <label className="field">
              <span>E-mail</span>
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="button" disabled={submitting} type="submit">
                {submitting ? "Enviando…" : "Enviar link"}
              </button>
              <Link href="/login">Voltar ao login</Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
