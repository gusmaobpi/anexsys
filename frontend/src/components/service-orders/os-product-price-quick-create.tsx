"use client";

import { KeyboardEvent, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";
import { applyOsMoneyTyping, formatOsMoneyInput } from "@/components/service-orders/service-order-workspace-view-model";
import type { ProductPriceRecord } from "@/components/catalog/product-price-list";

type Props = {
  productId: string;
  productName: string;
  initialServiceName: string;
  onCancel: () => void;
  onCreated: (record: ProductPriceRecord) => void;
};

export function OsProductPriceQuickCreate({
  productId,
  productName,
  initialServiceName,
  onCancel,
  onCreated,
}: Props) {
  const { apiJson } = useSession();
  const [serviceName, setServiceName] = useState(initialServiceName);
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit() {
    const minutes = Number(estimatedMinutes);
    const price = Number(suggestedPrice.replace(/\./g, "").replace(",", "."));
    if (!serviceName.trim()) {
      setMessage("O serviço é obrigatório.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMessage("O preço sugerido é obrigatório.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1) {
      setMessage("O tempo previsto é obrigatório.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<ProductPriceRecord>("/product-services", {
        method: "POST",
        body: JSON.stringify({
          productId,
          serviceName: serviceName.trim(),
          suggestedPrice: price,
          estimatedMinutes: minutes,
        }),
      });
      onCreated(created);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O preço deste produto e serviço não pôde ser cadastrado."));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    event.preventDefault();
    void handleSubmit();
  }

  return (
    <div className="os-price-quick-create" onKeyDown={onKeyDown}>
      <p className="table-subtle">
        Preço de <strong>{productName}</strong>. O tempo fica só para o PCP depois; não mexe no prazo da OS.
      </p>
      <label className="field">
        <span>Serviço</span>
        <input
          value={serviceName}
          onChange={(event) => setServiceName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Preço sugerido</span>
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={suggestedPrice}
          onChange={(event) => setSuggestedPrice(applyOsMoneyTyping(event.target.value))}
        />
      </label>
      <label className="field">
        <span>Tempo previsto (min)</span>
        <input
          inputMode="numeric"
          placeholder="15"
          value={estimatedMinutes}
          onChange={(event) => setEstimatedMinutes(event.target.value.replace(/\D/g, ""))}
        />
      </label>
      {message ? <p className="table-subtle">{message}</p> : null}
      <div className="button-row">
        <button className="button" disabled={saving} onClick={() => void handleSubmit()} type="button">
          {saving ? "Salvando…" : "Salvar preço"}
        </button>
        <button className="button-secondary" onClick={onCancel} type="button">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function formatSuggestedPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return formatOsMoneyInput(value);
}
