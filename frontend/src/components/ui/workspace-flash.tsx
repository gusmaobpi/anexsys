"use client";

import { useEffect, useState } from "react";

export type FlashTone = "error" | "ok";
export type VisualFlashTone = "error" | "ok" | "warning";

const ERROR_HINTS = [
  "não pôde",
  "não foi",
  "não foram",
  "não é possível",
  "não foi possível",
  "já existe",
  "already exists",
  "could not",
  "cannot read",
  "undefined",
  "typeerror",
  "internal server",
  "failed",
  "informe ",
  "revise ",
  "obrigatór",
  "inválid",
  "não encontrado",
  "erro",
  "incompleto",
  "não existe",
];

const WARNING_HINTS = [
  "aguardando maquininha",
  "consulta a maquininha",
  "tempo de espera acabou",
  "atenção",
  "parcial",
  "estorno",
  "permanece parcial",
];

const SUCCESS_HINTS = [
  "com sucesso",
  "criada.",
  "criado.",
  "atualizada.",
  "atualizado.",
  "atualizados.",
  "gravada",
  "gravado",
  "gravados",
  "cadastrada",
  "cadastrado",
  "quitada",
  "liquidado",
  "nasceu junto",
  "foi inativad",
  "foi excluíd",
  "foram excluíd",
  "vinculad",
  "reativada",
  "ativada.",
  "desativada.",
  "selecionada automaticamente",
  "já está no contexto",
  "successfully",
  "saved.",
  "were persisted",
  "recorded successfully",
];

const DEV_RESTART_HINT =
  /cannot read properties of undefined|getAllAndOverride|assertAllowed|internal server error/i;
const MISSING_SCHEMA_HINT = /coluna .+ não existe|column .+ does not exist/i;

export function inferFlashTone(message: string): FlashTone {
  const normalized = message.toLowerCase();
  if (ERROR_HINTS.some((hint) => normalized.includes(hint))) {
    return "error";
  }
  if (SUCCESS_HINTS.some((hint) => normalized.includes(hint))) {
    return "ok";
  }
  return "error";
}

export function resolveVisualFlashTone(message: string, explicitTone?: FlashTone): VisualFlashTone {
  if (explicitTone) {
    return explicitTone;
  }
  const normalized = message.toLowerCase();
  if (ERROR_HINTS.some((hint) => normalized.includes(hint))) {
    return "error";
  }
  if (WARNING_HINTS.some((hint) => normalized.includes(hint))) {
    return "warning";
  }
  if (SUCCESS_HINTS.some((hint) => normalized.includes(hint))) {
    return "ok";
  }
  return "error";
}

export function describeWorkspaceError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  if (/entity too large|PayloadTooLarge/i.test(raw)) {
    return "A foto ficou grande demais para enviar. O sistema já reduz a imagem; tire outra um pouco mais de perto.";
  }
  if (MISSING_SCHEMA_HINT.test(raw)) {
    return "O banco local está incompleto. No VS Code, no terminal do start:dev, aperte Ctrl+C e rode npm run start:dev de novo.";
  }
  if (DEV_RESTART_HINT.test(raw)) {
    return `${fallback.replace(/\.$/, "")}. Pare o processo da porta 3000, rode npm run start:dev outra vez e tente de novo.`;
  }
  return raw || fallback;
}

export function WorkspaceFlash({ message, tone }: Readonly<{ message: string; tone?: FlashTone }>) {
  const visualTone = resolveVisualFlashTone(message, tone);
  const [dismissedForMessage, setDismissedForMessage] = useState<string | null>(null);

  useEffect(() => {
    setDismissedForMessage(null);
    if (visualTone !== "ok") {
      return;
    }
    const timer = window.setTimeout(() => {
      setDismissedForMessage(message);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [message, visualTone]);

  const modalOpen = dismissedForMessage !== message;

  return (
    <>
      <section
        className={`mini-card workspace-flash workspace-flash--${visualTone}`}
        role={visualTone === "error" ? "alert" : "status"}
      >
        <p>{message}</p>
      </section>

      {modalOpen ? (
        <div
          className="feedback-modal-overlay"
          onClick={() => setDismissedForMessage(message)}
          role="presentation"
        >
          <div
            aria-live="polite"
            className={`feedback-modal-card feedback-modal-card--${visualTone}`}
            onClick={(event) => event.stopPropagation()}
            role={visualTone === "error" ? "alertdialog" : "dialog"}
          >
            <div className="feedback-modal-card__head">
              <span className="feedback-modal-card__badge">
                {visualTone === "ok"
                  ? "✓ Tudo certo · Gravado com sucesso"
                  : visualTone === "warning"
                    ? "⚠ Atenção operacional"
                    : "✕ Falta alguma informação ou ocorreu um erro"}
              </span>
              <button
                aria-label="Fechar aviso"
                className="grid-icon-btn"
                onClick={() => setDismissedForMessage(message)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="feedback-modal-card__body">
              <p>{message}</p>
            </div>

            <div className="feedback-modal-card__foot">
              <span>
                {visualTone === "ok"
                  ? "Esta confirmação fecha sozinha em 3 segundos."
                  : visualTone === "warning"
                    ? "Aviso amigável do sistema — você pode continuar operando."
                    : "Revise os campos destacados em vermelho ou o motivo acima."}
              </span>
              <button
                className={visualTone === "error" ? "button" : "button-secondary"}
                onClick={() => setDismissedForMessage(message)}
                type="button"
              >
                {visualTone === "ok" ? "OK" : "Entendi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
