"use client";

type Props = {
  hasAttachments: boolean;
  onClick: () => void;
  disabled?: boolean;
};

export function OsAnexoButton({ hasAttachments, onClick, disabled = false }: Props) {
  return (
    <button
      aria-label={hasAttachments ? "Ver anexos da OS" : "OS sem anexos"}
      className={hasAttachments ? "table-anexo table-anexo--ready" : "table-anexo table-anexo--empty"}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      title={hasAttachments ? "Ver anexos e fotos da OS" : "Sem anexos"}
      type="button"
    >
      <svg aria-hidden="true" height="16" viewBox="0 0 24 24" width="16">
        <path
          d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </button>
  );
}
