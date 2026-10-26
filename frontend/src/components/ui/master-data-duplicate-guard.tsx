"use client";

type DuplicateStatus = "idle" | "checking" | "duplicate";

export type DuplicateMatch = {
  id: string;
  title: string;
  subtitle?: string;
};

type Props = {
  status: DuplicateStatus;
  variant?: "blocking" | "warning";
  entityLabel: string;
  match?: DuplicateMatch | null;
  onView?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
};

export function normalizeDocumentValue(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeEmailValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeCodeValue(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

export function normalizeBodyPartCodeValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function MasterDataDuplicateGuard({
  status,
  variant = "blocking",
  entityLabel,
  match,
  onView,
  onEdit,
  onCancel,
}: Props) {
  if (status === "idle") {
    return null;
  }

  if (status === "checking") {
    return <div className="field__hint">Verificando duplicidade de {entityLabel.toLowerCase()}…</div>;
  }

  const wrapperClassName = variant === "warning" ? "mini-card" : "error-banner";
  const title =
    variant === "warning"
      ? `Já existe ${entityLabel.toLowerCase()} semelhante antes de salvar.`
      : `Já existe ${entityLabel.toLowerCase()} com este identificador.`;

  return (
    <div className={wrapperClassName}>
      <strong>{title}</strong>
      {match ? (
        <div className="table-subtle">
          {match.title}
          {match.subtitle ? ` · ${match.subtitle}` : ""}
        </div>
      ) : null}
      {onView || onEdit || onCancel ? (
        <div className="button-row" style={{ marginTop: 12 }}>
          {onView ? (
            <button className="button-secondary" onClick={onView} type="button">
              Ver
            </button>
          ) : null}
          {onEdit ? (
            <button className="button-secondary" onClick={onEdit} type="button">
              Alterar
            </button>
          ) : null}
          {onCancel ? (
            <button className="button-secondary" onClick={onCancel} type="button">
              Cancelar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
