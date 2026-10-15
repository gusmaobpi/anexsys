export const MAX_SERVICE_ORDER_ITEMS = 5;
/** 15px (~11 pt) is the largest A5 work font that still fits 5 pieces + the shelf camera. */
export const OS_WORK_PRINT_FONT_PX = 15;
export const OS_WORK_PRINT_LINES = 3;
/** Column S takes ~7% of the A5 table; Detalhamento do ajuste keeps ~55% → ~34 chars/line. */
export const OS_WORK_CHARS_PER_LINE = 34;
export const OS_WORK_MAX_CHARS = OS_WORK_PRINT_LINES * OS_WORK_CHARS_PER_LINE;

export function osWorkPrintHint(text: string, sequence = 1) {
  const used = Math.min(text.length, OS_WORK_MAX_CHARS);
  const lineIndex = Math.min(OS_WORK_PRINT_LINES, Math.max(1, Math.ceil(used / OS_WORK_CHARS_PER_LINE) || 1));
  const inLine = used === 0 ? 0 : ((used - 1) % OS_WORK_CHARS_PER_LINE) + 1;
  return `S${sequence} · linha ${lineIndex} de ${OS_WORK_PRINT_LINES} · ${inLine}/${OS_WORK_CHARS_PER_LINE}`;
}

/** A bare list refresh must not rebind the open OS form. Pass an id only after save/close. */
export function serviceOrderListLoadBinding(preferredActiveId?: string | null):
  | { bind: false }
  | { bind: true; activeId: string | null } {
  if (preferredActiveId === undefined) {
    return { bind: false };
  }
  return { bind: true, activeId: preferredActiveId };
}

export const DEFAULT_CUSTOMER_NOTE =
  "Garantia de serviço: 90 dias a partir da retirada. Reconserto em até 7 dias úteis se o cliente não provou na hora da retirada.";

export type PersistedServiceOrderItem = {
  id: string;
  itemNo: number;
  itemType: string;
  productId?: string | null;
  serviceId?: string | null;
  description: string;
  complement?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNo?: string | null;
  quantity: string;
  unitPrice: string | null;
  discountValue: string | null;
  estimatedMinutes?: number | null;
  status: string;
  heldForRework?: boolean;
};

export type ServiceOrderItemGridRow = {
  localId: string;
  persistedItemId: string | null;
  itemNo: number;
  itemType: string;
  productId: string;
  serviceId: string;
  description: string;
  complement: string;
  brand: string;
  model: string;
  serialNo: string;
  quantity: string;
  unitPrice: string;
  discountValue: string;
  estimatedMinutes: string;
  status: string;
  isEditing: boolean;
  isNew: boolean;
  isRemoved: boolean;
};

type ItemPayload = {
  itemType: string;
  productId?: string;
  serviceId?: string;
  description: string;
  complement?: string;
  brand: string;
  model: string;
  serialNo: string;
  quantity: number;
  unitPrice?: number;
  discountValue?: number;
  estimatedMinutes?: number;
};

const osMoneyAmountFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatOsMoneyAmount(value: number) {
  return osMoneyAmountFormatter.format(value);
}

export function parseOsMoney(value: string) {
  const trimmed = value.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!trimmed) return undefined;

  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  let parsed: number;

  if (body.includes(",")) {
    parsed = Number(body.replace(/\./g, "").replace(",", "."));
  } else if (/^\d+\.\d{1,4}$/.test(body)) {
    parsed = Number(body);
  } else if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
    parsed = Number(body.replace(/\./g, ""));
  } else if (/^\d+$/.test(body)) {
    parsed = Number(body);
  } else {
    return undefined;
  }

  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -parsed : parsed;
}

function parseOptionalNumber(value: string) {
  return parseOsMoney(value);
}

export function formatOsMoneyInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = typeof value === "number" ? value : parseOsMoney(String(value));
  if (parsed === undefined) return "";
  return formatOsMoneyAmount(parsed);
}

export function applyOsMoneyTyping(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);
  if (!digits) return "";
  return formatOsMoneyAmount(Number(digits) / 100);
}

export function previewNextLinkedServiceOrderNo(orderNo: string, existingOrderNos: string[] = []) {
  const base = orderNo.replace(/-(?:\d+|[A-Za-z]\d*)$/i, "");
  let max = 0;
  for (const value of [orderNo, ...existingOrderNos]) {
    const numeric = value.match(/-(\d+)$/)?.[1];
    if (numeric) {
      max = Math.max(max, Number(numeric));
      continue;
    }
    const legacy = value.match(/-([A-Z])$/i)?.[1];
    if (legacy && !/^[CGR]$/i.test(legacy)) {
      max = Math.max(max, legacy.toUpperCase().charCodeAt(0) - 64);
    }
  }
  return `${base}-${max + 1}`;
}

function parseEstimatedMinutes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildPayload(row: ServiceOrderItemGridRow): ItemPayload {
  const estimatedMinutes = parseEstimatedMinutes(row.estimatedMinutes);
  return {
    itemType: row.itemType.trim(),
    productId: row.productId || undefined,
    serviceId: row.serviceId || undefined,
    description: row.description.trim(),
    complement: row.complement.trim() || undefined,
    brand: row.brand.trim(),
    model: row.model.trim(),
    serialNo: row.serialNo.trim(),
    quantity: 1,
    unitPrice: parseOptionalNumber(row.unitPrice),
    discountValue: parseOptionalNumber(row.discountValue),
    ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
  };
}

function numericFieldEquals(left: string, right: string, allowEmpty: boolean) {
  const leftValue = parseOptionalNumber(left);
  const rightValue = parseOptionalNumber(right);

  if (allowEmpty && leftValue === undefined && rightValue === undefined) {
    return true;
  }
  if (leftValue === undefined || rightValue === undefined) {
    return left.trim() === right.trim();
  }

  return leftValue === rightValue;
}

function rowsMatch(left: ServiceOrderItemGridRow, right: ServiceOrderItemGridRow) {
  return left.itemType.trim() === right.itemType.trim()
    && left.productId === right.productId
    && left.serviceId === right.serviceId
    && left.description.trim() === right.description.trim()
    && left.complement.trim() === right.complement.trim()
    && left.brand.trim() === right.brand.trim()
    && left.model.trim() === right.model.trim()
    && left.serialNo.trim() === right.serialNo.trim()
    && numericFieldEquals(left.quantity, right.quantity, false)
    && numericFieldEquals(left.unitPrice, right.unitPrice, true)
    && numericFieldEquals(left.discountValue, right.discountValue, true)
    && numericFieldEquals(left.estimatedMinutes, right.estimatedMinutes, true);
}

export function createEmptyServiceOrderItemGridRow(itemNo: number): ServiceOrderItemGridRow {
  return {
    localId: `draft-${itemNo}`,
    persistedItemId: null,
    itemNo,
    itemType: "",
    productId: "",
    serviceId: "",
    description: "",
    complement: "",
    brand: "",
    model: "",
    serialNo: "",
    quantity: "1",
    unitPrice: "",
    discountValue: "",
    estimatedMinutes: "",
    status: "open",
    isEditing: true,
    isNew: true,
    isRemoved: false,
  };
}

export function mapServiceOrderItemsToGridRows(items: PersistedServiceOrderItem[]): ServiceOrderItemGridRow[] {
  return items
    .filter((item) => item.status !== "cancelled")
    .map((item) => ({
      localId: item.id,
      persistedItemId: item.id,
      itemNo: item.itemNo,
      itemType: item.itemType,
      productId: item.productId ?? "",
      serviceId: item.serviceId ?? "",
      description: item.description,
      complement: (item.complement ?? "").slice(0, OS_WORK_MAX_CHARS),
      brand: item.brand ?? "",
      model: item.model ?? "",
      serialNo: item.serialNo ?? "",
      quantity: "1",
      unitPrice: formatOsMoneyInput(item.unitPrice),
      discountValue: formatOsMoneyInput(item.discountValue),
      estimatedMinutes: item.estimatedMinutes != null ? String(item.estimatedMinutes) : "",
      status: item.status,
      isEditing: false,
      isNew: false,
      isRemoved: false,
    }));
}

export function getNextServiceOrderItemNo(rows: ServiceOrderItemGridRow[]) {
  return rows.reduce((maxItemNo, row) => Math.max(maxItemNo, row.itemNo), 0) + 1;
}

export function getVisibleServiceOrderItemGridRows(rows: ServiceOrderItemGridRow[]) {
  return rows.filter((row) => !row.isRemoved);
}

export function canAddServiceOrderItemGridRow(
  rows: ServiceOrderItemGridRow[],
  maxItems = MAX_SERVICE_ORDER_ITEMS,
) {
  return getVisibleServiceOrderItemGridRows(rows).length < maxItems;
}

export function addServiceOrderItemGridRow(
  rows: ServiceOrderItemGridRow[],
  maxItems = MAX_SERVICE_ORDER_ITEMS,
) {
  if (!canAddServiceOrderItemGridRow(rows, maxItems)) {
    return rows;
  }
  return [...rows, createEmptyServiceOrderItemGridRow(getNextServiceOrderItemNo(rows))];
}

export function updateServiceOrderItemGridRow(
  rows: ServiceOrderItemGridRow[],
  localId: string,
  patch: Partial<
    Pick<
      ServiceOrderItemGridRow,
      | "itemType"
      | "productId"
      | "serviceId"
      | "description"
      | "complement"
      | "brand"
      | "model"
      | "serialNo"
      | "quantity"
      | "unitPrice"
      | "discountValue"
      | "estimatedMinutes"
      | "isEditing"
    >
  >,
) {
  return rows.map((row) => (row.localId === localId ? { ...row, ...patch } : row));
}

export function removeServiceOrderItemGridRow(rows: ServiceOrderItemGridRow[], localId: string) {
  return rows.flatMap((row) => {
    if (row.localId !== localId) return [row];
    if (row.isNew) return [];
    return [{ ...row, isRemoved: true, isEditing: false }];
  });
}

export function calculateServiceOrderItemSubtotal(row: Pick<ServiceOrderItemGridRow, "quantity" | "unitPrice" | "discountValue">) {
  const quantity = parseOptionalNumber(row.quantity) ?? 0;
  const unitPrice = parseOptionalNumber(row.unitPrice) ?? 0;
  const discountValue = parseOptionalNumber(row.discountValue) ?? 0;
  return Math.max(quantity * unitPrice - discountValue, 0);
}

export function calculateServiceOrderLaborTotal(rows: ServiceOrderItemGridRow[]) {
  return getVisibleServiceOrderItemGridRows(rows).reduce((sum, row) => sum + calculateServiceOrderItemSubtotal(row), 0);
}

export function osPaymentConditionLabel(paymentStatus?: string | null) {
  return paymentStatus === "paid" ? "Pago" : "Pagar na retirada";
}

export function osReturnKindLabel(kind?: string | null) {
  if (kind === "reconserto") return "Reconserto";
  if (kind === "warranty") return "Em garantia";
  if (kind === "charged") return "Cobrada";
  if (kind === "counter") return "Refação no balcão";
  return null;
}

export function osOpHeaderTerm(input: { returnKind?: string | null; paymentStatus?: string | null }) {
  if (input.returnKind === "reconserto") return "Reconserto";
  if (input.returnKind === "warranty") return "Em garantia";
  if (input.returnKind === "counter") return "Refação no balcão";
  return osPaymentConditionLabel(input.paymentStatus);
}

export function osClientReturnPreviewCopy(preview: {
  kind: string;
  daysSincePickup: number;
  adjustmentPeriodDays: number;
  executionPeriodDays: number;
}) {
  if (preview.kind === "reconserto") {
    return `Dentro de ${preview.adjustmentPeriodDays} dias de reconserto (${preview.daysSincePickup} dia(s) desde a retirada). A OS nova sai sem valor, com o termo Reconserto na OP.`;
  }
  if (preview.kind === "warranty") {
    return `Dentro de ${preview.executionPeriodDays} dias de garantia (${preview.daysSincePickup} dia(s) desde a retirada). A OS nova sai sem valor, com o termo Em garantia na OP.`;
  }
  return `Fora do prazo de reconserto e de garantia (${preview.daysSincePickup} dia(s) desde a retirada). A OS nova será cobrada.`;
}

export function formatOsMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function buildCreateServiceOrderItemsPayload(rows: ServiceOrderItemGridRow[]) {
  return getVisibleServiceOrderItemGridRows(rows).map(buildPayload);
}

export function buildServiceOrderItemMutationPlan(
  rows: ServiceOrderItemGridRow[],
  originalItems: PersistedServiceOrderItem[],
) {
  const originalRows = new Map(
    mapServiceOrderItemsToGridRows(originalItems).map((row) => [row.persistedItemId, row] as const),
  );

  const create = getVisibleServiceOrderItemGridRows(rows)
    .filter((row) => row.isNew)
    .map(buildPayload);

  const update = getVisibleServiceOrderItemGridRows(rows)
    .filter((row) => !row.isNew && row.persistedItemId)
    .flatMap((row) => {
      const original = originalRows.get(row.persistedItemId);
      if (!original || rowsMatch(row, original)) {
        return [];
      }
      return [{ itemId: row.persistedItemId, ...buildPayload(row) }];
    });

  const remove = rows
    .filter((row) => row.isRemoved && row.persistedItemId)
    .map((row) => ({ itemId: row.persistedItemId as string, status: "cancelled" as const }));

  return { create, update, remove };
}

export async function runClosedBagCommit<TPrint, TNext>(input: {
  wantsNextVersion: boolean;
  print: () => Promise<TPrint>;
  spawnNext: () => Promise<TNext>;
}): Promise<{ printed: TPrint | null; next: TNext | null; printError: unknown | null }> {
  const next = input.wantsNextVersion ? await input.spawnNext() : null;

  try {
    const printed = await input.print();
    return { printed, next, printError: null };
  } catch (printError) {
    if (!next) {
      throw printError;
    }
    return { printed: null, next, printError };
  }
}
