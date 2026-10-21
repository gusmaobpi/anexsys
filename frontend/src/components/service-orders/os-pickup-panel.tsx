"use client";

import { FormEvent, useState } from "react";
import { type PickupSummary } from "@/components/service-orders/os-pickup";
import { osShowsFaltaPagamento, type OsFinancialSummary } from "@/components/service-orders/os-payment";
import { readOsPhotoFile } from "@/components/service-orders/os-photo";

type DeliveryRelease = {
  releasedAt?: string | Date | null;
  reason?: string | null;
  releasedByName?: string | null;
};

type Props = {
  orderNo: string;
  pickup: PickupSummary | null;
  payment?: OsFinancialSummary | null;
  saving?: boolean;
  canRelease?: boolean;
  deliveryRelease?: DeliveryRelease | null;
  onClose: () => void;
  onComplete: (input: {
    method: "paper";
    photo: { mimeType: string; contentBase64: string; fileName: string };
  }) => Promise<void> | void;
  onRelease?: (reason: string) => Promise<void> | void;
};

export function OsPickupPanel({
  orderNo,
  payment = null,
  saving = false,
  canRelease = false,
  deliveryRelease = null,
  onClose,
  onComplete,
  onRelease,
}: Props) {
  const [photo, setPhoto] = useState<{ mimeType: string; contentBase64: string; fileName: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const released = Boolean(deliveryRelease?.reason || deliveryRelease?.releasedAt);
  const blocked = Boolean(payment?.deliveryBlocked) && !released;

  async function handleFile(file: File | undefined) {
    if (!file) {
      setPhoto(null);
      setPreview(null);
      return;
    }
    try {
      const next = await readOsPhotoFile(file, "A foto da OP assinada não pôde ser lida.");
      setPhoto(next);
      setPreview(`data:${next.mimeType};base64,${next.contentBase64}`);
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "A foto não pôde ser lida.");
    }
  }

  async function handlePaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) {
      setError("Anexe a foto da OP assinada para entregar no papel.");
      return;
    }
    await onComplete({ method: "paper", photo });
  }

  return (
    <form className="os-pay-panel" onSubmit={(event) => void handlePaper(event)}>
      <div className="workspace-toolbar__copy">
        <h4>Retirada · OS {orderNo}</h4>
        <p>A retirada desta versão é no papel. Anexe a foto da OP assinada e confirme Entregue assinado.</p>
      </div>
      {osShowsFaltaPagamento(payment) ? (
        <p className="os-rule-banner">Falta pagamento. Isso não muda o status da OS.</p>
      ) : null}
      {blocked ? <p className="table-subtle">O saldo em aberto bloqueia a entrega.</p> : null}
      {released ? (
        <p className="table-subtle">
          Entrega liberada{deliveryRelease?.releasedByName ? ` por ${deliveryRelease.releasedByName}` : ""}. Motivo:{" "}
          {deliveryRelease?.reason}
        </p>
      ) : null}
      <label className="field">
        <span>Foto da OP assinada</span>
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={saving}
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
          }}
          type="file"
        />
      </label>
      {preview ? <img alt="Foto da OP assinada" className="os-pickup-photo" src={preview} /> : null}
      {canRelease && blocked && onRelease ? (
        <label className="field">
          <span>Motivo da liberação</span>
          <textarea
            disabled={saving}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            value={reason}
          />
        </label>
      ) : null}
      {error ? <p className="workspace-flash workspace-flash--error">{error}</p> : null}
      <div className="button-row">
        <button className="button" disabled={saving || !photo || blocked} type="submit">
          {saving ? "Registrando…" : "Entregue assinado"}
        </button>
        {canRelease && blocked && onRelease ? (
          <button
            className="button-secondary"
            disabled={saving || reason.trim().length === 0}
            onClick={() => {
              const note = reason.trim();
              if (!note) {
                setError("Informe o motivo da liberação.");
                return;
              }
              void onRelease(note);
            }}
            type="button"
          >
            Liberar entrega
          </button>
        ) : null}
        <button className="button-secondary" disabled={saving} onClick={onClose} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
