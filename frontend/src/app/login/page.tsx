"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { consumeFloorReturn } from "@/components/production/floor-return";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeLegacyTenantUuid(value: string) {
  return UUID_PATTERN.test(value.trim());
}

export default function LoginPage() {
  const router = useRouter();
  const { login, status, errorMessage, clearError } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const hasUserEditedEmailRef = useRef(false);

  const clearLegacyTenantEmail = useCallback(() => {
    const injectedValue = emailInputRef.current?.value ?? "";
    if (!hasUserEditedEmailRef.current && looksLikeLegacyTenantUuid(injectedValue)) {
      setEmail("");
      if (emailInputRef.current) {
        emailInputRef.current.value = "";
      }
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(consumeFloorReturn() ?? "/dashboard");
      return;
    }
    if (status === "company-selection" || status === "branch-selection") {
      router.replace("/select-branch");
    }
  }, [router, status]);

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(clearLegacyTenantEmail);
    const timerIds = [150, 500].map((delay) => window.setTimeout(clearLegacyTenantEmail, delay));

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [clearLegacyTenantEmail]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    clearError();
    try {
      await login({ email, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-shell">
      <section className="auth-card">
        <div className="auth-card__header">
          <div className="eyebrow">ANEXSYS</div>
          <h1 className="title">Administrative login</h1>
          <p className="subtitle">
            Sign in with your email and password. Company and filial open automatically when possible.
          </p>
        </div>

        <div className="auth-card__body">
          <form autoComplete="off" className="form-grid" onSubmit={handleSubmit}>
            {errorMessage ? (
              <div className="error-banner">
                <strong>Authentication failed</strong>
                <span>{errorMessage}</span>
                <button className="button-ghost" onClick={clearError} type="button">
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                ref={emailInputRef}
                id="login-email"
                name="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => {
                  hasUserEditedEmailRef.current = true;
                  setEmail(event.target.value);
                }}
                placeholder="admin@company.test"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                minLength={8}
                required
              />
            </div>

            <div className="button-row">
              <button className="button" disabled={submitting} type="submit">
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
