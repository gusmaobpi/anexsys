export const OS_PAYMENT_METHODS = ["cash", "card", "pix", "bank_transfer", "other"] as const;
export const OS_CARD_MODALITIES = ["credit", "debit", "pix"] as const;
export const OS_PAY_CHANNELS = ["card", "internal"] as const;
export const OS_INTERNAL_OPTIONS = ["cash", "credit", "debit", "pix"] as const;

export type OsPaymentMethod = (typeof OS_PAYMENT_METHODS)[number];
export type OsCardModality = (typeof OS_CARD_MODALITIES)[number];
export type OsPayChannel = (typeof OS_PAY_CHANNELS)[number];
export type OsInternalOption = (typeof OS_INTERNAL_OPTIONS)[number];

export type OsPaymentRecord = {
  id: string;
  paymentMethod: OsPaymentMethod | string;
  paymentAmount: string;
  receivedAt?: string | Date | null;
  status?: string;
  informedModality?: string | null;
  confirmedModality?: string | null;
  paymentProvider?: string | null;
  manualReason?: string | null;
  reversalReason?: string | null;
};

export type OsOpenCharge = {
  id: string;
  status: string;
  paymentAmount: string;
  informedModality?: string | null;
  confirmedModality?: string | null;
  environment?: string | null;
};

export type OsFinancialSummary = {
  serviceOrderId: string;
  orderTotal: string;
  amountPaid: string;
  outstandingBalance: string;
  exigivel?: string;
  suspenso?: string;
  paymentStatus: "pending" | "partial" | "paid";
  deliveryBlocked?: boolean;
  openCharge?: OsOpenCharge | null;
  payments?: OsPaymentRecord[];
};

export function osPayChannelLabel(channel: string | null | undefined) {
  if (channel === "card") return "Cartão";
  if (channel === "internal") return "Interno";
  return "";
}

export function osPayOptionLabel(channel: OsPayChannel, option: string) {
  if (channel === "internal" && option === "cash") return "Dinheiro";
  if (option === "credit") return "Crédito";
  if (option === "debit") return "Débito";
  if (option === "pix") return channel === "internal" ? "PIX" : "Pix";
  return "";
}

export function osPayCanSend(input: {
  channel: OsPayChannel | "";
  option: string;
  outstanding: number;
  pendingCharge: boolean;
  busy: boolean;
  terminalReady: boolean;
  reason?: string;
}) {
  if (!input.channel || !input.option || input.outstanding <= 0 || input.pendingCharge || input.busy) {
    return false;
  }
  if (input.channel === "card") {
    return input.terminalReady && (OS_CARD_MODALITIES as readonly string[]).includes(input.option);
  }
  return (OS_INTERNAL_OPTIONS as readonly string[]).includes(input.option) && Boolean(input.reason?.trim());
}

export function osPaymentMethodLabel(method: string | null | undefined) {
  if (method === "cash") return "Dinheiro";
  if (method === "card") return "Cartão";
  if (method === "pix") return "Pix";
  if (method === "bank_transfer") return "Transferência";
  if (method === "other") return "Outro";
  return method || "Pagamento";
}

export function osPaymentModalityLabel(modality: string | null | undefined) {
  if (modality === "credit") return "Crédito";
  if (modality === "debit") return "Débito";
  if (modality === "pix") return "Pix";
  if (modality === "voucher") return "Voucher";
  return "";
}

export function osPaymentHistoryLabel(payment: Pick<OsPaymentRecord, "paymentMethod" | "informedModality" | "confirmedModality" | "status" | "paymentProvider" | "manualReason" | "reversalReason">) {
  const base = osPaymentHistoryBase(payment);
  if (payment.status === "reversed") {
    return [base, "Estornado", payment.reversalReason?.trim()].filter(Boolean).join(" · ");
  }
  return base;
}

function osPaymentHistoryBase(payment: Pick<OsPaymentRecord, "paymentMethod" | "informedModality" | "confirmedModality" | "status" | "paymentProvider" | "manualReason">) {
  if (!payment.paymentProvider && (payment.paymentMethod === "cash" || payment.paymentMethod === "pix" || payment.paymentMethod === "card")) {
    const detail =
      payment.paymentMethod === "cash"
        ? "Dinheiro"
        : payment.paymentMethod === "pix"
          ? "PIX"
          : osPaymentModalityLabel(payment.informedModality) || "Crédito";
    return ["Interno", detail, payment.manualReason?.trim()].filter(Boolean).join(" · ");
  }
  const parts = [osPaymentMethodLabel(payment.paymentMethod)];
  const informed = osPaymentModalityLabel(payment.informedModality);
  const confirmed = osPaymentModalityLabel(payment.confirmedModality);
  if (informed) parts.push(informed);
  if (confirmed && confirmed !== informed) parts.push(`confirmado ${confirmed}`);
  if (payment.paymentMethod === "card" && payment.status) parts.push(osPaymentRecordStatusLabel(payment.status));
  return parts.filter(Boolean).join(" · ");
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

export const OS_MACHINE_WAIT_MS = 3 * 60 * 1000;
export const OS_MACHINE_POLL_MS = 5_000;

export function osChargeWatchExpired(startedAt: number, now: number, waitMs = OS_MACHINE_WAIT_MS) {
  return now - startedAt >= waitMs;
}

export function osShouldCloseOrderTab(input: {
  outstandingBalance: string | number | null | undefined;
  openCharge?: { status?: string | null } | null;
  fromList: boolean;
}) {
  const waitingTerminal = input.openCharge?.status === "pending";
  return !input.fromList && Number(input.outstandingBalance ?? 0) <= 0 && !waitingTerminal;
}
