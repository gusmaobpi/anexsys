import type { OsPrintView } from "@/components/service-orders/os-documents";

export type PublicOsTrackingView = {
  orderNo: string;
  companyName: string;
  customerFirstName: string;
  customerName: string;
  status: string;
  statusLabel: string;
  openedAt: string;
  promisedDeliveryDate: string;
  promisedDeliveryTime?: string | null;
  deliveryType?: "Standard" | "Priority" | "Express" | string;
  items: Array<{
    itemNo: number;
    itemType: string;
    description: string;
    complement?: string | null;
    quantity?: string | null;
    unitPrice?: string | null;
    discountValue?: string | null;
    subtotal?: string | null;
  }>;
  totalValue?: string | null;
  customerNotes?: string | null;
  recebiReady: boolean;
  pickedUp: boolean;
  pickupMethod?: string | null;
  paymentLabel: string;
  agreed?: boolean;
  agreedAt?: string | null;
  termsText?: string | null;
  privacyNotice?: string | null;
  logo?: { mimeType: string; contentBase64: string } | null;
  attendantName?: string | null;
  attendantPortrait?: { mimeType: string; contentBase64: string } | null;
};

export function describePublicOsError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (/não encontrado|not found|uuid is expected/i.test(raw)) {
    return "Este link não foi encontrado.";
  }
  if (/não respondeu na porta 3000|econnrefused|failed to fetch/i.test(raw)) {
    return "O servidor da OS não está no ar. Deixe o npm run start:dev rodando e recarregue esta página.";
  }
  if (/getAllAndOverride|assertAllowed|porta 3000|internal server|não concluiu a operação/i.test(raw)) {
    return "O servidor da OS ainda está com a versão antiga. Pare o processo da porta 3000, rode npm run start:dev e recarregue esta página.";
  }
  return raw || "Não foi possível abrir esta OS.";
}

export function formatPublicOsDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function publicAttendantFirstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function publicAttendantInitials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export function publicOsAgreement(view: Pick<PublicOsTrackingView, "agreed" | "status">) {
  if (view.agreed) return "agreed" as const;
  if (view.status === "cancelled" || view.status === "picked_up") return null;
  return "concordo" as const;
}

export function publicOsCta(view: Pick<PublicOsTrackingView, "pickedUp" | "recebiReady" | "status">) {
  if (view.pickedUp) return "picked_up" as const;
  if (view.recebiReady) return "recebi" as const;
  if (view.status === "ready_for_pickup") return "waiting_counter" as const;
  return "follow" as const;
}

export function toPublicOsPrintView(view: PublicOsTrackingView): OsPrintView {
  return {
    documentType: "service_order",
    serviceOrderId: view.orderNo,
    orderNo: view.orderNo,
    status: view.status,
    statusLabel: view.statusLabel,
    openedAt: view.openedAt,
    promisedDeliveryDate: view.promisedDeliveryDate,
    promisedDeliveryTime: view.promisedDeliveryTime,
    deliveryType:
      view.deliveryType === "Priority" || view.deliveryType === "Express" || view.deliveryType === "Standard"
        ? view.deliveryType
        : "Standard",
    customer: {
      legalName: view.customerName,
      phone: null,
      email: null,
    },
    items: view.items.map((item) => ({
      productName: item.itemType,
      serviceName: item.description,
      complement: item.complement ?? null,
      quantity: item.quantity ?? "1",
      unitPrice: item.unitPrice ?? null,
      discountValue: item.discountValue ?? null,
      subtotal: item.subtotal ?? null,
    })),
    totalValue: view.totalValue ?? null,
    customerNotes: view.customerNotes ?? null,
  };
}
