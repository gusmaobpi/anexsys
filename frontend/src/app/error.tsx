"use client";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="screen-shell">
      <section className="auth-card">
        <div className="auth-card__header">
          <div className="eyebrow">ANEXSYS · Erro</div>
          <h1 className="title">Algo deu errado</h1>
          <p className="subtitle">Não foi possível concluir esta tela. Tente de novo.</p>
        </div>

        <div className="auth-card__body">
          <div className="error-banner">
            <strong>{error.name || "Erro do sistema"}</strong>
            <span>{error.message || "Falha inesperada na tela."}</span>
          </div>
          <div className="button-row">
            <button className="button" onClick={reset} type="button">
              Tentar de novo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
