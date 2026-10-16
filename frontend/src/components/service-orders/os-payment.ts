export const OS_PAYMENT_METHODS = ["cash", "card", "pix", "bank_transfer", "other"] as const;

export type OsPaymentMethod = (typeof OS_PAYMENT_METHODS)[number];

export type OsPaymentRecord = {
  id: string;
  paymentMethod: OsPaymentMethod | string;
  paymentAmount: string;
  receivedAt?: string | Date | null;
  status?: string;
};

export type OsFinancialSummary = {
  serviceOrderId: string;
  orderTotal: string;
  amountPaid: string;
  outstandingBalance: string;
  paymentStatus: "pending" | "partial" | "paid";
  deliveryBlocked?: boolean;
  payments?: OsPaymentRecord[];
};

export function osPaymentMethodLabel(method: string | null | undefined) {
  if (method === "cash") return "Dinheiro";
  if (method === "card") return "Cartão na maquininha";
  if (method === "pix") return "Pix";
  if (method === "bank_transfer") return "Transferência";
  if (method === "other") return "Outro";
  return method || "Pagamento";
}

export function osPaymentRecordStatusLabel(status: string | null | undefined) {
  if (status === "pending") return "Aguardando maquininha";
  if (status === "authorized") return "Autorizado";
  if (status === "received") return "Recebido";
  if (status === "settled") return "Liquidado";
  if (status === "failed") return "Falhou";
  if (status === "canceled") return "Cancelado";
  if (status === "reversed") return "Estornado";
  return status || "";
}

export function osHasOutstandingBalance(summary?: Pick<OsFinancialSummary, "outstandingBalance"> | null) {
  return Number(summary?.outstandingBalance ?? 0) > 0;
}

export function osCanOpenPay(row?: {
  status?: string | null;
  paymentStatus?: string | null;
  payLockedOnParent?: boolean | null;
} | null) {
  return row?.status !== "cancelled" && row?.paymentStatus !== "paid" && !row?.payLockedOnParent;
}

export function osShowsFaltaPagamento(summary?: Pick<OsFinancialSummary, "outstandingBalance" | "paymentStatus"> | null) {
  if (!summary) {
    return false;
  }
  return summary.paymentStatus !== "paid" && osHasOutstandingBalance(summary);
}
