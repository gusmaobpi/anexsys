"use client";

import { useId, useState } from "react";
import { fitBrandImage, type BrandImageFile } from "@/components/ui/brand-image";

export function BrandFrame({
  kind,
  image,
  fallback,
  label,
  hint,
  disabled = false,
  onChange,
}: {
  kind: "logo" | "portrait";
  image: BrandImageFile | null;
  fallback?: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onChange?: (image: BrandImageFile | null) => void;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const src = image?.contentBase64 ? `data:${image.mimeType};base64,${image.contentBase64}` : null;

  async function pick(file: File | undefined) {
    if (!file || !onChange) {
      return;
    }
    try {
      setError(null);
      onChange(await fitBrandImage(file, kind));
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Não foi possível usar esta imagem.");
    }
  }

  return (
    <div className="brand-field">
      <span>{label}</span>
      <div className={`brand-frame brand-frame--${kind}`}>
        {src ? <img alt="" src={src} /> : fallback ? <span>{fallback}</span> : null}
      </div>
      {hint ? <p className="table-subtle">{hint}</p> : null}
      {onChange ? (
        <div className="brand-frame__actions">
          <label className={disabled ? "button-secondary brand-frame__pick is-disabled" : "button-secondary brand-frame__pick"} htmlFor={inputId}>
            Escolher imagem
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            id={inputId}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void pick(file);
            }}
          />
          {src ? (
            <button className="button-secondary" disabled={disabled} onClick={() => onChange(null)} type="button">
              Remover
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="workspace-flash workspace-flash--error">{error}</p> : null}
    </div>
  );
}
