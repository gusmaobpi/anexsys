function includesNormalized(value: string | null | undefined, query: string) {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

function csvCell(value: string | null | undefined) {
  const text = value ?? "";
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export type OsListRecord = {
  id: string;
  orderNo: string;
  customerId?: string | null;
  customerName?: string | null;
  openedAt?: string | null;
  promisedDeliveryDate: string;
  deliveryType: string;
  operationalPriority: string | null;
  status: string;
  totalValue: string | null;
  piecesCount?: number;
  hasAttachments?: boolean;
  paymentStatus?: "pending" | "partial" | "paid";
  outstandingBalance?: string | null;
  amountPaid?: string | null;
  payLockedOnParent?: boolean;
};

export function osDeliveryTypeLabel(type: string) {
  if (type === "Standard") return "Normal";
  if (type === "Priority") return "Urgente";
  if (type === "Express") return "Expresso";
  return type;
}

export function osStatusLabel(status: string) {
  if (status === "open") return "Aberta";
  if (status === "approved") return "Aprovada";
  if (status === "cancelled") return "Cancelada";
  if (status === "draft") return "Rascunho";
  if (status === "in_production") return "Em produção";
  if (status === "awaiting_proof") return "Aguardando prova";
  if (status === "awaiting_quality") return "Aguardando controle de qualidade";
  if (status === "quality") return "Controle de qualidade";
  if (status === "in_rework") return "Em refação";
  if (status === "ready_for_pickup") return "Pronto para retirada";
  if (status === "picked_up") return "Retirado";
  return status;
}

function extractIsoDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (match) return match[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatBrDateFromIso(value: string | null | undefined): string {
  const iso = extractIsoDate(value);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatMoneyVariants(value: string | null | undefined): string[] {
  if (!value) return [];
  const num = Number(value);
  if (!Number.isFinite(num)) return [String(value)];
  const fixedDot = num.toFixed(2);
  const fixedComma = fixedDot.replace(".", ",");
  const intPart = String(Math.trunc(num));
  return [fixedDot, fixedComma, `r$ ${fixedComma}`, intPart];
}

function matchesSmartOsQuery(order: OsListRecord, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const paymentLabel =
    order.paymentStatus === "paid"
      ? "pago quitado"
      : order.paymentStatus === "partial"
        ? "parcial em aberto"
        : "em aberto a pagar";

  const compositeLabel = order.customerName
    ? `${order.customerName} · ${order.orderNo}`
    : order.orderNo;

  const candidates = [
    compositeLabel,
    order.customerName ?? "",
    order.orderNo,
    order.deliveryType,
    osDeliveryTypeLabel(order.deliveryType),
    order.operationalPriority ?? "",
    order.status,
    osStatusLabel(order.status),
    order.promisedDeliveryDate ?? "",
    formatBrDateFromIso(order.promisedDeliveryDate),
    paymentLabel,
    ...formatMoneyVariants(order.totalValue),
    ...formatMoneyVariants(order.outstandingBalance),
  ];

  if (candidates.some((candidate) => includesNormalized(candidate, query))) {
    return true;
  }

  // Se o usuário selecionou "Nome da Cliente · AAA000008" do combo, também aceita bater qualquer parte separada por "·"
  if (query.includes("·")) {
    const parts = query
      .split("·")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0 && parts.every((part) => candidates.some((c) => includesNormalized(c, part)))) {
      return true;
    }
  }

  return false;
}

export function applyOsListFilters(orders: OsListRecord[], filters: Record<string, string>): OsListRecord[] {
  const smartQuery = (filters.name ?? "").trim();
  const customerQuery = (filters.customer ?? "").trim().toLowerCase();
  const orderNoQuery = (filters.orderNo ?? "").trim().toLowerCase();
  const statusQuery = (filters.status ?? "").trim();
  const deliveryQuery = (filters.deliveryType ?? "").trim();
  const paymentQuery = (filters.payment ?? "").trim();
  const dateBasis = (filters.dateBasis ?? "").trim() || "promised";
  const dateFrom = (filters.dateFrom ?? "").trim();
  const dateTo = (filters.dateTo ?? "").trim();

  return orders.filter((order) => {
    if (smartQuery && !matchesSmartOsQuery(order, smartQuery)) {
      return false;
    }
    if (customerQuery && !includesNormalized(order.customerName ?? "", customerQuery)) {
      return false;
    }
    if (orderNoQuery && !includesNormalized(order.orderNo, orderNoQuery)) {
      return false;
    }
    if (statusQuery && order.status !== statusQuery) {
      return false;
    }
    if (deliveryQuery && order.deliveryType !== deliveryQuery) {
      return false;
    }
    if (paymentQuery === "paid" && order.paymentStatus !== "paid") {
      return false;
    }
    if (paymentQuery === "open" && order.paymentStatus === "paid") {
      return false;
    }
    if (dateFrom || dateTo) {
      const targetIso =
        dateBasis === "opened"
          ? extractIsoDate(order.openedAt) || extractIsoDate(order.promisedDeliveryDate)
          : extractIsoDate(order.promisedDeliveryDate);
      if (dateFrom && (!targetIso || targetIso < dateFrom)) {
        return false;
      }
      if (dateTo && (!targetIso || targetIso > dateTo)) {
        return false;
      }
    }
    return true;
  });
}

export type OsFilterSummaryTotals = {
  ordersCount: number;
  piecesCount: number;
  totalValue: number;
  paidValue: number;
  outstandingValue: number;
};

export function summarizeOsListTotals(orders: OsListRecord[]): OsFilterSummaryTotals {
  let ordersCount = 0;
  let piecesCount = 0;
  let totalValue = 0;
  let paidValue = 0;
  let outstandingValue = 0;

  for (const order of orders) {
    if (order.status === "cancelled") {
      continue;
    }
    ordersCount += 1;
    piecesCount += Number(order.piecesCount ?? 0);
    const total = Number(order.totalValue ?? 0);
    const paid = Number(order.amountPaid ?? (order.paymentStatus === "paid" ? total : 0));
    const balance =
      order.outstandingBalance !== undefined && order.outstandingBalance !== null
        ? Number(order.outstandingBalance)
        : Math.max(total - paid, 0);
    if (Number.isFinite(total)) totalValue += total;
    if (Number.isFinite(paid)) paidValue += paid;
    if (Number.isFinite(balance)) outstandingValue += balance;
  }

  return {
    ordersCount,
    piecesCount,
    totalValue,
    paidValue,
    outstandingValue,
  };
}

export type OsStatusBucketSummary = {
  code: string;
  label: string;
  ordersCount: number;
  piecesCount: number;
  totalValue: number;
};

const MAIN_STATUS_BUCKETS: Array<{ code: string; label: string; match: (status: string) => boolean }> = [
  { code: "", label: "Todas no Período", match: (s) => s !== "cancelled" },
  { code: "open", label: "OS em Aberto", match: (s) => s === "open" || s === "approved" || s === "draft" },
  {
    code: "in_production",
    label: "Em Produção / Qualidade",
    match: (s) => s === "in_production" || s === "awaiting_proof" || s === "awaiting_quality" || s === "quality" || s === "in_rework",
  },
  { code: "ready_for_pickup", label: "Prontas p/ Retirada", match: (s) => s === "ready_for_pickup" },
  { code: "picked_up", label: "Finalizadas / Entregues", match: (s) => s === "picked_up" },
];

export function summarizeOsByStatus(orders: OsListRecord[], activeFilters: Record<string, string>): OsStatusBucketSummary[] {
  const filtersWithoutStatus = { ...activeFilters, status: "" };
  const baseOrders = applyOsListFilters(orders, filtersWithoutStatus);

  return MAIN_STATUS_BUCKETS.map((bucket) => {
    const bucketOrders = baseOrders.filter((o) => bucket.match(o.status));
    const totals = summarizeOsListTotals(bucketOrders);
    return {
      code: bucket.code,
      label: bucket.label,
      ordersCount: totals.ordersCount,
      piecesCount: totals.piecesCount,
      totalValue: totals.totalValue,
    };
  });
}

export function buildOsExcelCsv(orders: OsListRecord[]) {
  const header = ["Número", "Cliente", "Entrega", "Tipo", "Prioridade", "Status", "Peças", "Pagamento", "Valor"];
  const rows = orders.map((order) => [
    order.orderNo,
    order.customerName ?? "",
    order.promisedDeliveryDate,
    osDeliveryTypeLabel(order.deliveryType),
    order.operationalPriority ?? "",
    osStatusLabel(order.status),
    String(order.piecesCount ?? 0),
    order.paymentStatus === "paid" ? "Pago" : "Em aberto",
    order.totalValue ?? "",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
