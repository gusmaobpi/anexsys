"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";

type RequestTokenResponse = {
  registrationId: string;
  email: string;
  emailSent: boolean;
  emailNotice: string;
  homologCodePreview?: string | null;
};

type VerifyTokenResponse = {
  alreadyProvisioned: boolean;
  tenantId: string;
  tenantCode?: string;
  companyName: string;
  email: string;
};

async function postOnboardingJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/backend-api/public/onboarding/${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | T | null;
  if (!response.ok) {
    const rawMsg =
      payload && typeof payload === "object" && "message" in payload
        ? Array.isArray(payload.message)
          ? payload.message.join(", ")
          : payload.message
        : null;
    throw new Error(rawMsg || "Não foi possível concluir o credenciamento.");
  }
  return payload as T;
}

export default function CredenciamentoPage() {
  const router = useRouter();
  const { login, logout, status } = useSession();

  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [registrationId, setRegistrationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [homologCodePreview, setHomologCodePreview] = useState<string | null>(null);
  const [provisionedInfo, setProvisionedInfo] = useState<VerifyTokenResponse | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("A confirmação da senha não confere com a senha digitada.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await postOnboardingJson<RequestTokenResponse>("request-token", {
        companyName,
        cnpj: cnpj.trim() || null,
        adminName,
        email,
        phone,
        password,
      });
      setRegistrationId(result.registrationId);
      setEmailNotice(result.emailNotice);
      setHomologCodePreview(result.homologCodePreview ?? null);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o código.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const verified = await postOnboardingJson<VerifyTokenResponse>("verify-token", {
        registrationId,
        code: verificationCode,
      });
      setProvisionedInfo(verified);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido ou expirado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnterNewAccount() {
    setSubmitting(true);
    setError(null);
    try {
      if (status === "authenticated") {
        await logout();
      }
      await login({ email: email.trim().toLowerCase(), password });
      router.replace("/dashboard");
    } catch {
      router.replace("/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-shell">
      <section className="auth-card" style={{ maxWidth: 560 }}>
        <div className="auth-card__header" style={{ background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div className="eyebrow">ANEXSYS · CREDENCIAMENTO SAAS</div>
            <span className="status-chip status-chip--active">
              {step === "form" ? "Passo 1 de 2" : step === "verify" ? "Passo 2 de 2" : "Conta Criada ✓"}
            </span>
          </div>
          <h1 className="title" style={{ fontSize: 24, marginTop: 8 }}>
            {step === "form"
              ? "Crie a Conta do seu Ateliê"
              : step === "verify"
                ? "Confirme seu E-mail"
                : "Sua Conta está Pronta!"}
          </h1>
          <p className="subtitle" style={{ marginTop: 6 }}>
            {step === "form"
              ? "Preencha os dados abaixo para receber o token de confirmação por e-mail e liberar seu ambiente exclusivo e limpo."
              : step === "verify"
                ? "Digite o código de 6 dígitos enviado para validar sua autenticidade e criar seu ambiente."
                : "Seu ambiente exclusivo foi provisionado com sucesso."}
          </p>
        </div>

        <div className="auth-card__body">
          {error ? (
            <div className="workspace-flash workspace-flash--error" style={{ marginBottom: 16 }}>
              <p>{error}</p>
            </div>
          ) : null}

          {step === "form" ? (
            <form className="form-grid" onSubmit={handleRequestToken}>
              <label className="field">
                <span>Nome do Ateliê / Empresa</span>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex.: Ateliê Alta Costura Ltda"
                />
              </label>

              <div className="os-header-grid">
                <label className="field">
                  <span>Seu Nome Completo</span>
                  <input
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Nome do responsável"
                  />
                </label>

                <label className="field">
                  <span>CNPJ (opcional agora)</span>
                  <input
                    inputMode="numeric"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                  />
                </label>
              </div>

              <div className="os-header-grid">
                <label className="field">
                  <span>E-mail de Acesso (Login)</span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@seuatelie.com.br"
                  />
                </label>

                <label className="field">
                  <span>Celular / WhatsApp com DDD</span>
                  <input
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </label>
              </div>

              <div className="os-header-grid">
                <label className="field">
                  <span>Crie sua Senha</span>
                  <div className="password-field">
                    <input
                      required
                      minLength={8}
                      type={passwordVisible ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo de 8 caracteres"
                    />
                    <button
                      className="button-ghost password-field__toggle"
                      onClick={() => setPasswordVisible((v) => !v)}
                      type="button"
                    >
                      {passwordVisible ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </label>

                <label className="field">
                  <span>Confirme a Senha</span>
                  <input
                    required
                    minLength={8}
                    type={passwordVisible ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="Repita a senha"
                  />
                </label>
              </div>

              <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Link className="button-secondary" href="/login">
                  Já tenho conta (Ir para Login)
                </Link>
                <button className="button" disabled={submitting} type="submit">
                  {submitting ? "Enviando código…" : "Receber Token por E-mail →"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "verify" ? (
            <form className="form-grid" onSubmit={handleVerifyToken}>
              {emailNotice ? (
                <div className="workspace-flash workspace-flash--ok">
                  <p>{emailNotice}</p>
                </div>
              ) : null}

              {homologCodePreview ? (
                <div className="workspace-flash workspace-flash--warning">
                  <p>
                    <strong>Modo Homologação (Token de Teste):</strong> use o código{" "}
                    <strong style={{ fontSize: 18, letterSpacing: "0.08em" }}>{homologCodePreview}</strong> para validar agora.
                  </p>
                </div>
              ) : null}

              <label className="field">
                <span>Código de 6 dígitos enviado para {email}</span>
                <input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.2em", textAlign: "center" }}
                />
              </label>

              <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <button
                  className="button-secondary"
                  disabled={submitting}
                  onClick={() => {
                    setStep("form");
                    setError(null);
                  }}
                  type="button"
                >
                  ← Voltar e corrigir dados
                </button>
                <button className="button" disabled={submitting || verificationCode.length < 6} type="submit">
                  {submitting ? "Criando sua conta…" : "Confirmar Token e Criar Conta ✓"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "done" && provisionedInfo ? (
            <div className="form-grid">
              <div className="workspace-flash workspace-flash--ok">
                <p>
                  ✓ Conta <strong>{provisionedInfo.companyName}</strong> ({provisionedInfo.tenantCode}) criada e isolada com sucesso!
                </p>
              </div>

              <div className="os-box" style={{ display: "grid", gap: 6 }}>
                <span className="os-box__title">Resumo do seu novo ambiente</span>
                <p className="table-subtle" style={{ marginTop: 0 }}>
                  • <strong>Empresa:</strong> {provisionedInfo.companyName}
                </p>
                <p className="table-subtle" style={{ marginTop: 0 }}>
                  • <strong>Filial Padrão:</strong> Matriz (já configurada)
                </p>
                <p className="table-subtle" style={{ marginTop: 0 }}>
                  • <strong>Login Administrador:</strong> {provisionedInfo.email}
                </p>
              </div>

              <div className="button-row" style={{ justifyContent: "flex-end" }}>
                <button className="button" disabled={submitting} onClick={() => void handleEnterNewAccount()} type="button">
                  {submitting ? "Entrando na sua conta…" : "Entrar na Minha Nova Conta Agora →"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
