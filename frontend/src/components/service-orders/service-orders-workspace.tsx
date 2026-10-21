"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { HoverPeek } from "@/components/ui/hover-peek";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";
import { SmartLookup, type SmartLookupOption } from "@/components/ui/smart-lookup";
import {
  buildOsWhatsAppMessage,
  openEmailResend,
  openWhatsAppResend,
  printProductionOrderDocument,
  printServiceOrderDocument,
  reservePrintWindow,
  type OpPrintView,
  type OsPrintView,
} from "@/components/service-orders/os-documents";
import { canReopenBagAfterFloor } from "@/components/service-orders/os-floor";
import { applyOsListFilters, buildOsExcelCsv, osDeliveryTypeLabel, osStatusLabel } from "@/components/service-orders/os-list";
import {
  canActOnProof,
  canSendToProof,
  proofActionLabel,
  proofActionSuccessMessage,
  proofNotesReprintMessage,
  type ProofAction,
} from "@/components/service-orders/os-proof";
import { OsClientReturnPanel } from "@/components/service-orders/os-client-return-panel";
import { OsProofNotesPanel } from "@/components/service-orders/os-proof-notes-panel";
import { OsAnexoButton } from "@/components/service-orders/os-anexo-button";
import { OsProductPriceQuickCreate, formatSuggestedPrice } from "@/components/service-orders/os-product-price-quick-create";
import type { ProductPriceRecord } from "@/components/catalog/product-price-list";
import type { MinuteRateRecord } from "@/components/catalog/minute-rate-list";
import { OsApprovalPanel } from "@/components/service-orders/os-approval-panel";
import { OsAttachmentsPanel } from "@/components/service-orders/os-attachments-panel";
import { approvalMethodLabel, canRecordOsApproval, formatOsInstant, type ApprovalSummary } from "@/components/service-orders/os-approval";
import { OsPickupPanel } from "@/components/service-orders/os-pickup-panel";
import { pickupMethodLabel, type PickupSummary } from "@/components/service-orders/os-pickup";
import { OsPayPanel, type OsFinancialSummary } from "@/components/service-orders/os-pay-panel";
import { osCanOpenPay, osPaymentHistoryLabel, osShouldCloseOrderTab, osShowsFaltaPagamento } from "@/components/service-orders/os-payment";
import { RowOverflowMenu, type RowMenuItem } from "@/components/ui/row-overflow-menu";
import {
  addServiceOrderItemGridRow,
  applyOsMoneyTyping,
  applyTimePricingToUnitPrice,
  buildCreateServiceOrderItemsPayload,
  buildServiceOrderItemMutationPlan,
  calculateServiceOrderItemSubtotal,
  calculateServiceOrderLaborTotal,
  canAddServiceOrderItemGridRow,
  createEmptyServiceOrderItemGridRow,
  DEFAULT_CUSTOMER_NOTE,
  formatOsMoney,
  getVisibleServiceOrderItemGridRows,
  mapServiceOrderItemsToGridRows,
  MAX_SERVICE_ORDER_ITEMS,
  OS_WORK_MAX_CHARS,
  osOpHeaderTerm,
  osReturnKindLabel,
  osWorkPrintHint,
  previewNextLinkedServiceOrderNo,
  removeServiceOrderItemGridRow,
  runClosedBagCommit,
  serviceOrderListLoadBinding,
  updateServiceOrderItemGridRow,
  validateServiceOrderItemGrid,
  type PersistedServiceOrderItem,
  type ServiceOrderItemGridRow,
} from "@/components/service-orders/service-order-workspace-view-model";

const OS_LIST_REFRESH_EVENT = "anexsys:service-orders-changed";

type ServiceOrderRecord = {
  id: string;
  branchId?: string;
  customerId?: string;
  orderNo: string;
  openedAt: string;
  promisedDeliveryDate: string;
  promisedDeliveryTime?: string | null;
  deliveryType: "Standard" | "Priority" | "Express";
  operationalPriority: string | null;
  status: string;
  totalValue: string | null;
  paymentTermsDays?: number;
  commercialNotes?: string | null;
  customerNotes?: string | null;
  commercialResponsibleActorId?: string;
  actualDeliveryDate?: string | null;
  actualDeliveryTime?: string | null;
  bagClosed?: boolean;
  publicToken?: string | null;
  actualPickupDate?: string | null;
  originServiceOrderId?: string | null;
  returnKind?: string | null;
  hasAttachments?: boolean;
  paymentStatus?: "pending" | "partial" | "paid";
  outstandingBalance?: string | null;
  amountPaid?: string | null;
  payLockedOnParent?: boolean;
  difficultyGrade?: number | null;
};

type ActorSummary = {
  id: string;
  displayName: string;
  email?: string | null;
};

type ServiceOrderDetail = {
  serviceOrder: ServiceOrderRecord & {
    branchId: string;
    customerId: string;
    paymentTermsDays: number;
    commercialNotes: string | null;
    customerNotes: string | null;
    originFloorNames?: string | null;
    chargeWaivedReason?: string | null;
  };
  customer: {
    legalName: string;
    phone: string | null;
    email: string | null;
    whatsappConsent?: boolean;
  };
  commercialResponsible?: ActorSummary | null;
  productionTechnician?: ActorSummary | null;
  qualityReviewer?: ActorSummary | null;
  items: PersistedServiceOrderItem[];
  maxPiecesPerBag?: number;
  groupVersions?: Array<{
    id: string;
    orderNo: string;
    versionSuffix: string | null;
    returnKind?: string | null;
    status?: string;
  }>;
  payLockedOnParent?: boolean;
  origin?: { id: string; orderNo: string; status: string; actualPickupDate: string | null } | null;
  linkedReturns?: Array<{ id: string; orderNo: string; returnKind: string | null; status: string }>;
  clientReturnPreview?: {
    kind: string;
    daysSincePickup: number;
    adjustmentPeriodDays: number;
    executionPeriodDays: number;
  } | null;
  floorFinishNames?: string[];
  deliveryRelease?: {
    releasedAt?: string | Date | null;
    reason?: string | null;
    releasedByName?: string | null;
  } | null;
  proofNotes?: Array<{
    batchId: string;
    createdAt: string | Date;
    createdByName: string;
    items: Array<{ itemId: string; itemNo: number; itemType: string; description: string; note: string }>;
  }>;
  reprintProof?: boolean;
  pickup?: PickupSummary | null;
  approval?: ApprovalSummary | null;
};

type CustomerLookupRecord = {
  id: string;
  legalName: string;
  tradeName: string | null;
  email: string | null;
  cpfCnpj: string | null;
};

type CatalogLookupRecord = {
  id: string;
  displayName: string;
  status?: string;
};

type CreateServiceOrderResponse = {
  serviceOrder: ServiceOrderRecord & {
    branchId: string;
    customerId: string;
    paymentTermsDays: number;
    commercialNotes: string | null;
    customerNotes: string | null;
  };
  items: Array<{
    id: string;
  }>;
};

type ServiceOrderHeaderForm = {
  customerId: string;
  deliveryType: "Standard" | "Priority" | "Express";
  operationalPriority: string;
  promisedDeliveryDate: string;
  promisedDeliveryTime: string;
  attendantId: string;
  commercialNotes: string;
  customerNotes: string;
  difficultyGrade: string;
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function toTimeInput(value: string | null | undefined, fromDate?: string | null) {
  if (value && /^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }
  if (!fromDate) return "";
  const date = new Date(fromDate);
  if (Number.isNaN(date.getTime())) return "";
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function nowDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(now.getDate())}`;
}

function nowTimeInput() {
  const now = new Date();
  return `${padDatePart(now.getHours())}:${padDatePart(now.getMinutes())}`;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function photoSrc(photo: { mimeType?: string | null; contentBase64?: string | null } | null | undefined) {
  return photo?.contentBase64 ? `data:${photo.mimeType};base64,${photo.contentBase64}` : null;
}

function createEmptyHeaderForm(attendantId = ""): ServiceOrderHeaderForm {
  return {
    customerId: "",
    deliveryType: "Standard",
    operationalPriority: "",
    promisedDeliveryDate: "",
    promisedDeliveryTime: nowTimeInput(),
    attendantId,
    commercialNotes: "",
    customerNotes: DEFAULT_CUSTOMER_NOTE,
    difficultyGrade: "",
  };
}

function mapDetailsToHeaderForm(details: ServiceOrderDetail): ServiceOrderHeaderForm {
  return {
    customerId: details.serviceOrder.customerId,
    deliveryType: details.serviceOrder.deliveryType,
    operationalPriority: details.serviceOrder.operationalPriority ?? "",
    promisedDeliveryDate: toDateInput(details.serviceOrder.promisedDeliveryDate),
    promisedDeliveryTime: toTimeInput(details.serviceOrder.promisedDeliveryTime, details.serviceOrder.openedAt),
    attendantId: details.serviceOrder.commercialResponsibleActorId ?? details.commercialResponsible?.id ?? "",
    commercialNotes: details.serviceOrder.commercialNotes ?? "",
    customerNotes: details.serviceOrder.customerNotes ?? "",
    difficultyGrade: details.serviceOrder.difficultyGrade ? String(details.serviceOrder.difficultyGrade) : "",
  };
}

function formatWorkspaceMessage(error: unknown, fallback: string) {
  return describeWorkspaceError(error, fallback);
}

function scrollFieldIntoOsGrid(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const grid = target.closest<HTMLElement>(".os-items-table");
  if (!grid) {
    return;
  }
  const field = target.closest("td, th") ?? target;
  const gridRect = grid.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  if (fieldRect.right > gridRect.right - 8) {
    grid.scrollLeft += fieldRect.right - gridRect.right + 16;
  } else if (fieldRect.left < gridRect.left + 8) {
    grid.scrollLeft -= gridRect.left - fieldRect.left + 16;
  }
  const content = grid.closest<HTMLElement>(".workspace__content");
  if (content) {
    content.scrollLeft = 0;
  }
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
}

function fitOsWorkTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function OsWorkTextarea({
  disabled,
  sequence,
  value,
  onChange,
}: {
  disabled: boolean;
  sequence: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    fitOsWorkTextarea(element);
  }, [value]);

  return (
    <HoverPeek text={value}>
      <textarea
        ref={ref}
        className="os-item-input os-item-input--work"
        disabled={disabled}
        maxLength={OS_WORK_MAX_CHARS}
        placeholder="Detalhe o serviço combinado com o cliente"
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, OS_WORK_MAX_CHARS))}
      />
      <small className="os-item-work-hint">{osWorkPrintHint(value, sequence)}</small>
    </HoverPeek>
  );
}

export function ServiceOrdersWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { session, hasAnyPermission, apiJson } = useSession();
  const { isMobile } = useWorkspaceViewportMode();
  const focusServiceOrderId = searchParams.get("focusServiceOrderId");
  const workspaceMode = searchParams.get("workspaceMode");
  const openProof = searchParams.get("openProof") === "1";
  const openPickup = searchParams.get("openPickup") === "1";
  const openApproval = searchParams.get("openApproval") === "1";
  const canRead = hasAnyPermission("service_orders.read");
  const canWrite = hasAnyPermission("service_orders.write");
  const canRelease = hasAnyPermission("service_orders.release");
  const canReadCustomers = hasAnyPermission("customers.read");
  const canWriteCustomers = hasAnyPermission("customers.write");
  const canReadUsers = hasAnyPermission("users.read");
  const canReadFinance = hasAnyPermission("finance.read");
  const canWriteFinance = hasAnyPermission("finance.write");
  const canRefund = hasAnyPermission("finance.refund");
  const canReadProduction = hasAnyPermission("production_orders.read");
  const canWriteProduction = hasAnyPermission("production_orders.write");
  const canWriteProof = canWrite || canWriteProduction;
  const [orders, setOrders] = useState<ServiceOrderRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerLookupRecord[]>([]);
  const [products, setProducts] = useState<CatalogLookupRecord[]>([]);
  const [services, setServices] = useState<CatalogLookupRecord[]>([]);
  const [productPrices, setProductPrices] = useState<ProductPriceRecord[]>([]);
  const [minuteRateValue, setMinuteRateValue] = useState<number | null>(null);
  const [users, setUsers] = useState<ActorSummary[]>([]);
  const [payTarget, setPayTarget] = useState<{ orderNo: string; branchId: string | null; summary: OsFinancialSummary } | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<OsFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useWorkspaceScopedState<string | null>("service-orders.activeOrderId", null);
  const [showCreateForm, setShowCreateForm] = useWorkspaceScopedState("service-orders.showCreateForm", false);
  const [details, setDetails] = useState<ServiceOrderDetail | null>(null);
  const [headerForm, setHeaderForm] = useWorkspaceScopedState<ServiceOrderHeaderForm>(
    "service-orders.headerForm",
    createEmptyHeaderForm(),
  );
  const [itemRows, setItemRows] = useWorkspaceScopedState<ServiceOrderItemGridRow[]>("service-orders.itemRows", [createEmptyServiceOrderItemGridRow(1)]);
  const [maxPiecesPerBag, setMaxPiecesPerBag] = useState(MAX_SERVICE_ORDER_ITEMS);
  const [previewOrderNo, setPreviewOrderNo] = useState("—");
  const [wantsNextVersion, setWantsNextVersion] = useState(false);
  const [returnPickerOpen, setReturnPickerOpen] = useState(false);
  const [counterPickerOpen, setCounterPickerOpen] = useState(false);
  const [proofPickerOpen, setProofPickerOpen] = useState(false);
  const [pickupPickerOpen, setPickupPickerOpen] = useState(false);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [approvalPickerOpen, setApprovalPickerOpen] = useState(false);
  const [approvalPhoto, setApprovalPhoto] = useState<string | null>(null);
  const [anexoViewer, setAnexoViewer] = useState<{
    orderNo: string;
    approval: ApprovalSummary | null;
    approvalPhoto: string | null;
    pickup: PickupSummary | null;
    pickupPhoto: string | null;
    loading: boolean;
  } | null>(null);
  const latestDetailRequestId = useRef(0);

  const activeCompany = session?.companies.find((company) => company.tenantId === session?.tenantId) ?? null;
  const canPersistInContext = Boolean(session?.tenantId && session?.activeBranchId);

  const selectedOrder = details?.serviceOrder ?? null;
  const selectedCustomerId = headerForm.customerId || selectedOrder?.customerId || null;
  const { closeWorkspace } = useWorkspaceManager();
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: showCreateForm ? "OS: Nova" : selectedOrder ? `OS ${selectedOrder.orderNo}` : "Ordens de serviço",
    subtitle: showCreateForm ? "Novo cadastro" : selectedOrder ? osDeliveryTypeLabel(selectedOrder.deliveryType) : null,
  });
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusServiceOrderId);
  const isListWorkspace = !isFormWorkspace;
  const bagClosed = Boolean(selectedOrder?.bagClosed);
  const canEditSelectedOrder = canWrite && selectedOrder !== null && selectedOrder.status !== "cancelled" && !bagClosed;
  const canReopenSelectedBag = Boolean(selectedOrder && canWrite && bagClosed && canReopenBagAfterFloor(selectedOrder.status));

  useEffect(() => {
    setWantsNextVersion(false);
    setReturnPickerOpen(false);
    setProofPickerOpen(false);
    setPickupPickerOpen(false);
    setPickupPhoto(null);
  }, [selectedOrder?.id, showCreateForm]);
  const visibleItemRows = useMemo(() => getVisibleServiceOrderItemGridRows(itemRows), [itemRows]);

  const openRelatedCustomerWorkspace = useCallback(
    (focusSection?: "measurements") => {
      if (!selectedCustomerId) {
        return;
      }

      const params = new URLSearchParams();
      params.set("focusCustomerId", selectedCustomerId);
      if (focusSection) {
        params.set("focusSection", focusSection);
      }

      const targetPath = `/customers?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }

      openWorkspaceInNewTab(targetPath, focusSection === "measurements" ? "Medidas" : "Cliente", {
        cloneCurrent: false,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab, selectedCustomerId],
  );

  const attendantLookupOptions = useMemo<SmartLookupOption[]>(() => {
    const options = users.map((user) => ({
      id: user.id,
      label: user.displayName,
      hint: user.email ?? undefined,
    }));
    const currentUser = session?.user;
    if (currentUser && !options.some((option) => option.id === currentUser.id)) {
      options.unshift({ id: currentUser.id, label: currentUser.displayName, hint: currentUser.email });
    }
    if (
      details?.commercialResponsible &&
      !options.some((option) => option.id === details.commercialResponsible?.id)
    ) {
      options.unshift({
        id: details.commercialResponsible.id,
        label: details.commercialResponsible.displayName,
        hint: details.commercialResponsible.email ?? undefined,
      });
    }
    return options;
  }, [details?.commercialResponsible, session?.user, users]);

  const customerLookupOptions = useMemo<SmartLookupOption[]>(() => {
    const options = customers.map((customer) => ({
      id: customer.id,
      label: customer.legalName,
      hint: customer.tradeName ?? customer.email ?? customer.cpfCnpj ?? undefined,
    }));

    if (details?.serviceOrder.customerId && !options.some((option) => option.id === details.serviceOrder.customerId)) {
      options.unshift({
        id: details.serviceOrder.customerId,
        label: details.customer.legalName,
        hint: details.customer.email ?? details.customer.phone ?? undefined,
      });
    }

    return options;
  }, [customers, details]);

  const orderLookupOptions = useMemo<SmartLookupOption[]>(
    () =>
      orders.map((order) => ({
        id: order.id,
        label: order.orderNo,
        hint: [osStatusLabel(order.status), osDeliveryTypeLabel(order.deliveryType), order.operationalPriority]
          .filter(Boolean)
          .join(" · ") || undefined,
      })),
    [orders],
  );

  const productLookupOptions = useMemo<SmartLookupOption[]>(() => {
    const options = products
      .filter((product) => product.status !== "inactive")
      .map((product) => ({ id: product.id, label: product.displayName }));
    for (const row of visibleItemRows) {
      if (row.productId && !options.some((option) => option.id === row.productId)) {
        options.unshift({ id: row.productId, label: row.itemType || "Produto" });
      }
    }
    return options;
  }, [products, visibleItemRows]);

  const serviceLookupOptionsFor = useCallback(
    (row: { productId: string; serviceId: string; description: string }) => {
      const options: SmartLookupOption[] = productPrices
        .filter((price) => price.productId === row.productId && price.status !== "inactive")
        .map((price) => ({
          id: price.serviceId,
          label: price.serviceName,
          hint: `${formatOsMoney(Number(price.suggestedPrice))} • ${price.estimatedMinutes} min`,
        }));
      if (row.serviceId && !options.some((option) => option.id === row.serviceId)) {
        const fallback = services.find((service) => service.id === row.serviceId);
        options.unshift({
          id: row.serviceId,
          label: fallback?.displayName || row.description || "Serviço",
        });
      }
      return options;
    },
    [productPrices, services],
  );

  const suggestedPriceFor = useCallback(
    (productId: string, serviceId: string) => {
      const priced = productPrices.find(
        (price) => price.productId === productId && price.serviceId === serviceId && price.status !== "inactive",
      );
      return priced ? formatSuggestedPrice(priced.suggestedPrice) : "";
    },
    [productPrices],
  );

  const estimatedMinutesFor = useCallback(
    (productId: string, serviceId: string) => {
      const priced = productPrices.find(
        (price) => price.productId === productId && price.serviceId === serviceId && price.status !== "inactive",
      );
      return priced ? String(priced.estimatedMinutes) : "";
    },
    [productPrices],
  );

  const laborTotal = useMemo(() => calculateServiceOrderLaborTotal(itemRows), [itemRows]);
  const nextVersionNo = useMemo(
    () =>
      selectedOrder?.orderNo
        ? previewNextLinkedServiceOrderNo(
            selectedOrder.orderNo,
            (details?.groupVersions ?? []).map((version) => version.orderNo),
          )
        : "",
    [details?.groupVersions, selectedOrder?.orderNo],
  );

  const openCreateCustomerFromLookup = useCallback(
    (query: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (query.trim()) {
        params.set("prefillName", query.trim());
      }
      const targetPath = `/customers?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Cliente: Novo", { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const loadDetails = useCallback(
    async (serviceOrderId: string) => {
      const requestId = latestDetailRequestId.current + 1;
      latestDetailRequestId.current = requestId;
      setDetailLoading(true);
      try {
        const response = await apiJson<ServiceOrderDetail>(`/service-orders/${serviceOrderId}`);
        if (latestDetailRequestId.current !== requestId) {
          return;
        }
        setDetails(response);
        if (response.maxPiecesPerBag) {
          setMaxPiecesPerBag(response.maxPiecesPerBag);
        }
        if (!showCreateForm) {
          setHeaderForm(mapDetailsToHeaderForm(response));
          const mapped = mapServiceOrderItemsToGridRows(response.items);
          setItemRows(mapped.length > 0 ? mapped : [createEmptyServiceOrderItemGridRow(1)]);
        }
        if (canReadFinance || canWriteFinance) {
          try {
            const summary = await apiJson<OsFinancialSummary>(`/service-orders/${serviceOrderId}/financial-summary`);
            if (latestDetailRequestId.current === requestId) {
              setPaymentSummary(summary);
            }
          } catch {
            if (latestDetailRequestId.current === requestId) {
              setPaymentSummary(null);
            }
          }
        } else {
          setPaymentSummary(null);
        }
        if (focusServiceOrderId !== serviceOrderId || workspaceMode === "new") {
          navigateWithinWorkspace(`/service-orders?focusServiceOrderId=${encodeURIComponent(serviceOrderId)}`);
        }
        setMessage(null);
      } catch (error) {
        if (latestDetailRequestId.current !== requestId) {
          return;
        }
        setMessage(
          formatWorkspaceMessage(error, "A OS não pôde ser carregada. Confira o acesso e tente de novo."),
        );
      } finally {
        if (latestDetailRequestId.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [apiJson, canReadFinance, canWriteFinance, focusServiceOrderId, navigateWithinWorkspace, setHeaderForm, setItemRows, showCreateForm, workspaceMode],
  );
  const loadDetailsRef = useRef(loadDetails);
  loadDetailsRef.current = loadDetails;

  const loadOrders = useCallback(
    async (preferredActiveId?: string | null) => {
      if (!canRead) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const binding = serviceOrderListLoadBinding(preferredActiveId);
      try {
        const response = await apiJson<ServiceOrderRecord[]>("/service-orders");
        setOrders(response);
        if (binding.bind) {
          setActiveOrderId(binding.activeId);
          if (binding.activeId) {
            await loadDetailsRef.current(binding.activeId);
          } else {
            setDetails(null);
          }
        }
        setMessage(null);
      } catch (error) {
        setOrders([]);
        if (binding.bind) {
          setActiveOrderId(null);
          setDetails(null);
        }
        setMessage(
          formatWorkspaceMessage(error, "As OS não puderam ser carregadas. Confira filtros, acesso e a Filial do contexto."),
        );
      } finally {
        setLoading(false);
      }
    },
    [apiJson, canRead, setActiveOrderId],
  );

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }
    const onChanged = () => {
      void loadOrders();
    };
    window.addEventListener(OS_LIST_REFRESH_EVENT, onChanged);
    return () => window.removeEventListener(OS_LIST_REFRESH_EVENT, onChanged);
  }, [isListWorkspace, loadOrders]);

  const loadCustomers = useCallback(async () => {
    if (!canWrite || !canReadCustomers) {
      setCustomers([]);
      return;
    }
    setLoadingCustomers(true);
    try {
      const response = await apiJson<CustomerLookupRecord[]>("/customers");
      setCustomers(response);
    } catch (error) {
      setCustomers([]);
      setMessage(
        formatWorkspaceMessage(
          error,
          "A busca de clientes não pôde ser carregada. Confira o acesso a Clientes antes de criar a OS.",
        ),
      );
    } finally {
      setLoadingCustomers(false);
    }
  }, [apiJson, canReadCustomers, canWrite]);

  const loadUsers = useCallback(async () => {
    if (!canReadUsers) {
      setUsers(session?.user ? [{ id: session.user.id, displayName: session.user.displayName, email: session.user.email }] : []);
      return;
    }
    try {
      const response = await apiJson<ActorSummary[]>("/users");
      setUsers(response);
    } catch {
      setUsers(session?.user ? [{ id: session.user.id, displayName: session.user.displayName, email: session.user.email }] : []);
    }
  }, [apiJson, canReadUsers, session?.user]);

  const loadCatalogs = useCallback(async () => {
    const activeEmpresaId = session?.activeEmpresaId ?? null;
    if (!canRead) {
      setProducts([]);
      setServices([]);
      setProductPrices([]);
      setMinuteRateValue(null);
      return;
    }
    try {
      const [productResponse, serviceResponse, priceResponse, minuteRatesResponse] = await Promise.all([
        apiJson<CatalogLookupRecord[]>("/garment-products"),
        apiJson<CatalogLookupRecord[]>("/atelier-services"),
        apiJson<ProductPriceRecord[]>("/product-services"),
        activeEmpresaId
          ? apiJson<MinuteRateRecord[]>(`/minute-rates?companyId=${encodeURIComponent(activeEmpresaId)}`)
          : Promise.resolve([]),
      ]);
      setProducts(productResponse);
      setServices(serviceResponse);
      setProductPrices(priceResponse);
      const activeRate = minuteRatesResponse.find((rate) => rate.status === "active");
      setMinuteRateValue(activeRate ? Number(activeRate.valuePerMinute) : null);
    } catch {
      setProducts([]);
      setServices([]);
      setProductPrices([]);
      setMinuteRateValue(null);
    }
  }, [apiJson, canRead, session?.activeEmpresaId]);

  const loadBagSettings = useCallback(async () => {
    if (!canRead) {
      return;
    }
    try {
      const settings = await apiJson<{ maxPiecesPerBag: number }>("/service-orders/settings");
      if (settings.maxPiecesPerBag > 0) {
        setMaxPiecesPerBag(settings.maxPiecesPerBag);
      }
    } catch {
      /* o padrão da Conta continua valendo na grade */
    }
  }, [apiJson, canRead]);

  const loadNextOrderNo = useCallback(async () => {
    if (!canRead) {
      return;
    }
    try {
      const next = await apiJson<{ orderNo: string }>("/service-orders/next-number");
      setPreviewOrderNo(next.orderNo);
    } catch {
      setPreviewOrderNo("—");
    }
  }, [apiJson, canRead]);

  const openPay = useCallback(
    async (order: Pick<ServiceOrderRecord, "id" | "orderNo" | "branchId">) => {
      if (!canReadFinance && !canWriteFinance) {
        setMessage("O pagamento depende da permissão financeira.");
        return;
      }
      try {
        const summary = await apiJson<OsFinancialSummary>(`/service-orders/${order.id}/financial-summary`);
        setPaymentSummary(summary);
        setPayTarget({
          orderNo: order.orderNo,
          branchId: order.branchId ?? session?.activeBranchId ?? null,
          summary,
        });
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "O resumo financeiro não pôde ser carregado."));
      }
    },
    [apiJson, canReadFinance, canWriteFinance, session?.activeBranchId],
  );

  const companyName = activeCompany?.displayName ?? "ANEXSYS";

  const printServiceOrder = useCallback(
    async (serviceOrderId: string) => {
      try {
        const view = await apiJson<OsPrintView>(`/service-orders/${serviceOrderId}/print-view`);
        printServiceOrderDocument(view, companyName);
        setMessage(`OS ${view.orderNo} enviada para impressão.`);
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A OS não pôde ser impressa."));
      }
    },
    [apiJson, companyName],
  );

  const printProductionOrder = useCallback(
    async (serviceOrderId: string, reservedWindow?: Window | null) => {
      let productionOrderId = "";
      try {
        const existing = await apiJson<{ productionOrder: { id: string } }>(`/service-orders/${serviceOrderId}/production-order`);
        productionOrderId = existing.productionOrder.id;
      } catch {
        if (!canWriteProduction) {
          throw new Error("Esta OS ainda não tem Ordem de Produção.");
        }
        const created = await apiJson<{ productionOrder: { id: string } }>(
          `/service-orders/${serviceOrderId}/production-order/generate`,
          { method: "POST" },
        );
        productionOrderId = created.productionOrder.id;
      }
      const view = await apiJson<OpPrintView>(`/production-orders/${productionOrderId}/print-view`);
      let paymentCondition = osOpHeaderTerm({
        returnKind: view.serviceOrder.returnKind,
        paymentStatus: paymentSummary?.paymentStatus,
      });
      try {
        const summary = await apiJson<OsFinancialSummary>(`/service-orders/${serviceOrderId}/financial-summary`);
        paymentCondition = osOpHeaderTerm({
          returnKind: view.serviceOrder.returnKind,
          paymentStatus: summary.paymentStatus,
        });
        setPaymentSummary(summary);
      } catch {
        /* a OP sai mesmo se o financeiro não puder ser lido; parcial e em aberto = Saldo em aberto */
      }
      printProductionOrderDocument(view, companyName, reservedWindow, paymentCondition);
      return view;
    },
    [apiJson, canWriteProduction, companyName, paymentSummary?.paymentStatus],
  );

  const resendWhatsApp = useCallback(
    async (serviceOrderId: string) => {
      try {
        const view = await apiJson<OsPrintView>(`/service-orders/${serviceOrderId}/print-view`);
        openWhatsAppResend(
          view.customer.phone,
          buildOsWhatsAppMessage({
            customerName: view.customer.legalName,
            companyName,
            orderNo: view.orderNo,
          }),
        );
        setMessage(`WhatsApp da OS ${view.orderNo} aberto para reenvio.`);
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "O WhatsApp não pôde ser aberto para reenvio."));
      }
    },
    [apiJson, companyName],
  );

  const resendEmail = useCallback(
    async (serviceOrderId: string) => {
      try {
        const view = await apiJson<OsPrintView>(`/service-orders/${serviceOrderId}/print-view`);
        openEmailResend(
          view.customer.email,
          `Ordem de serviço ${view.orderNo}`,
          buildOsWhatsAppMessage({
            customerName: view.customer.legalName,
            companyName,
            orderNo: view.orderNo,
          }),
        );
        setMessage(`E-mail da OS ${view.orderNo} aberto para reenvio.`);
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "O e-mail não pôde ser aberto para reenvio."));
      }
    },
    [apiJson, companyName],
  );

  const openPickupPanel = useCallback(
    (order: Pick<ServiceOrderRecord, "id" | "orderNo">) => {
      if (isListWorkspace) {
        const targetPath = `/service-orders?focusServiceOrderId=${encodeURIComponent(order.id)}&openPickup=1`;
        if (isMobile) {
          navigateWithinWorkspace(targetPath);
        } else {
          openWorkspaceInNewTab(targetPath, `OS ${order.orderNo}`, { cloneCurrent: false });
        }
        return;
      }
      setPickupPickerOpen(true);
    },
    [isListWorkspace, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openApprovalPanel = useCallback(
    (order: Pick<ServiceOrderRecord, "id" | "orderNo">) => {
      if (isListWorkspace) {
        const targetPath = `/service-orders?focusServiceOrderId=${encodeURIComponent(order.id)}&openApproval=1`;
        if (isMobile) {
          navigateWithinWorkspace(targetPath);
        } else {
          openWorkspaceInNewTab(targetPath, `OS ${order.orderNo}`, { cloneCurrent: false });
        }
        return;
      }
      setApprovalPickerOpen(true);
    },
    [isListWorkspace, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openAnexoPanel = useCallback(
    async (order: Pick<ServiceOrderRecord, "id" | "orderNo">) => {
      setMessage(null);
      setAnexoViewer({
        orderNo: order.orderNo,
        approval: null,
        approvalPhoto: null,
        pickup: null,
        pickupPhoto: null,
        loading: true,
      });
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${order.id}`);
        const [approvalFile, pickupFile] = await Promise.all([
          next.approval?.photoAvailable
            ? apiJson<{ mimeType: string; contentBase64: string } | null>(`/service-orders/${order.id}/approval/photo`)
            : Promise.resolve(null),
          next.pickup?.photoAvailable
            ? apiJson<{ mimeType: string; contentBase64: string } | null>(`/service-orders/${order.id}/pickup/photo`)
            : Promise.resolve(null),
        ]);
        setAnexoViewer({
          orderNo: next.serviceOrder.orderNo,
          approval: next.approval ?? null,
          approvalPhoto: photoSrc(approvalFile),
          pickup: next.pickup ?? null,
          pickupPhoto: photoSrc(pickupFile),
          loading: false,
        });
      } catch (error) {
        setAnexoViewer(null);
        setMessage(formatWorkspaceMessage(error, "Os anexos não puderam ser abertos."));
      }
    },
    [apiJson],
  );

  const copyPublicLink = useCallback(async () => {
    const token = selectedOrder?.publicToken;
    if (!token) {
      setMessage("Esta OS ainda não tem o link do cliente. Salve de novo depois de atualizar o sistema.");
      return;
    }
    const url = `${window.location.origin}/os/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`Link copiado para colar no WhatsApp Web: ${url}`);
    } catch {
      setMessage(url);
    }
  }, [selectedOrder?.publicToken]);

  const handleRecalculateDelivery = useCallback(async () => {
    if (!canWrite) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (showCreateForm) {
        if (!session?.activeBranchId) {
          throw new Error("Selecione a Filial para recalcular o prazo.");
        }
        const params = new URLSearchParams({
          branchId: session.activeBranchId,
          deliveryType: headerForm.deliveryType,
          itemCount: String(visibleItemRows.length || 1),
        });
        const suggestion = await apiJson<{ promisedDeliveryDate: string; promisedDeliveryTime: string }>(
          `/service-orders/delivery-preview?${params.toString()}`,
        );
        setHeaderForm((current) => ({
          ...current,
          promisedDeliveryDate: suggestion.promisedDeliveryDate,
          promisedDeliveryTime: toTimeInput(suggestion.promisedDeliveryTime),
        }));
        setMessage(
          `Previsão sugerida: ${formatDate(suggestion.promisedDeliveryDate)} ${toTimeInput(suggestion.promisedDeliveryTime)}. Você pode ajustar.`,
        );
        return;
      }
      if (!selectedOrder) {
        return;
      }
      const saved = await apiJson<{ orderNo: string; promisedDeliveryDate: string; promisedDeliveryTime?: string | null }>(
        `/service-orders/${selectedOrder.id}/delivery-date/recalculate`,
        { method: "POST" },
      );
      setHeaderForm((current) => ({
        ...current,
        promisedDeliveryDate: toDateInput(saved.promisedDeliveryDate),
        promisedDeliveryTime: toTimeInput(saved.promisedDeliveryTime),
      }));
      await loadOrders(isListWorkspace ? undefined : selectedOrder.id);
      setMessage(
        `Previsão da OS ${saved.orderNo} recalculada para ${formatDate(saved.promisedDeliveryDate)} ${toTimeInput(saved.promisedDeliveryTime)}. Você pode ajustar.`,
      );
    } catch (error) {
      setMessage(formatWorkspaceMessage(error, "O prazo não pôde ser recalculado."));
    } finally {
      setSaving(false);
    }
  }, [
    apiJson,
    canWrite,
    headerForm.deliveryType,
    isListWorkspace,
    loadOrders,
    selectedOrder,
    session?.activeBranchId,
    showCreateForm,
    visibleItemRows.length,
  ]);

  const handleCompletePickup = useCallback(
    async (input: {
      method: "paper" | "attendant";
      photo?: { mimeType: string; contentBase64: string; fileName: string } | null;
    }) => {
      if (!canWrite || !selectedOrder) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const delivered = await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/pickup/complete`, {
          method: "POST",
          body: JSON.stringify(input),
        });
        setPickupPickerOpen(false);
        await loadOrders(isListWorkspace ? undefined : delivered.serviceOrder.id);
        const method = pickupMethodLabel(delivered.pickup?.method) ?? "atendente";
        const partial = delivered.serviceOrder.status === "ready_for_pickup" || delivered.pickup?.partial;
        setMessage(
          partial
            ? `Retirada parcial da OS ${delivered.serviceOrder.orderNo}. A mãe não fica Retirado enquanto a refação no balcão estiver aberta.`
            : `OS ${delivered.serviceOrder.orderNo} retirada (${method}). Use Cliente voltou se o cliente reclamar depois.`,
        );
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A OS não pôde ser entregue."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWrite, isListWorkspace, loadOrders, selectedOrder],
  );

  const handleCompleteApproval = useCallback(
    async (input: {
      method: "counter" | "paper" | "release";
      photo?: { mimeType: string; contentBase64: string; fileName: string } | null;
      releaseReason?: string;
    }) => {
      if (!canWrite || !selectedOrder) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/approval`, {
          method: "POST",
          body: JSON.stringify(input),
        });
        setApprovalPickerOpen(false);
        await loadOrders(isListWorkspace ? undefined : next.serviceOrder.id);
        if (next.approval?.releasedWithoutSignature) {
          setMessage(
            `Produção da OS ${next.serviceOrder.orderNo} liberada sem assinatura. A OS continua Em aberto.`,
          );
          return;
        }
        const method = approvalMethodLabel(next.approval?.method) ?? "balcão";
        setMessage(
          `OS ${next.serviceOrder.orderNo} assinada (${method}). A OS continua Em aberto e a medida ficou travada.`,
        );
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A aprovação não pôde ser registrada."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWrite, isListWorkspace, loadOrders, selectedOrder],
  );

  const handleProofAction = useCallback(
    async (order: Pick<ServiceOrderRecord, "id" | "orderNo">, action: ProofAction) => {
      if (!canWriteProof) {
        return;
      }
      if (action === "complete_proof") {
        if (isListWorkspace) {
          const targetPath = `/service-orders?focusServiceOrderId=${encodeURIComponent(order.id)}&openProof=1`;
          if (isMobile) {
            navigateWithinWorkspace(targetPath);
          } else {
            openWorkspaceInNewTab(targetPath, `OS ${order.orderNo}`, { cloneCurrent: false });
          }
          return;
        }
        setProofPickerOpen(true);
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${order.id}/send-to-proof`, {
          method: "POST",
        });
        await loadOrders(isListWorkspace ? undefined : next.serviceOrder.id);
        setMessage(proofActionSuccessMessage(action, next.serviceOrder.orderNo));
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A prova desta OS não pôde ser atualizada."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWriteProof, isListWorkspace, isMobile, loadOrders, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const handleCompleteProof = useCallback(
    async (notes: Array<{ itemId: string; note: string }>) => {
      if (!canWriteProof || !selectedOrder) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/complete-proof`, {
          method: "POST",
          body: JSON.stringify({ notes }),
        });
        setProofPickerOpen(false);
        await loadOrders(isListWorkspace ? undefined : next.serviceOrder.id);
        if (next.reprintProof) {
          try {
            await printProductionOrder(next.serviceOrder.id);
            setMessage(proofNotesReprintMessage(next.serviceOrder.orderNo));
          } catch (error) {
            setMessage(
              formatWorkspaceMessage(error, "A OS voltou para produção, mas a OP não pôde ser reimpressa."),
            );
          }
        } else {
          setMessage(proofActionSuccessMessage("complete_proof", next.serviceOrder.orderNo));
        }
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A prova desta OS não pôde ser atualizada."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWriteProof, isListWorkspace, loadOrders, printProductionOrder, selectedOrder],
  );

  const buildOsRowMenu = useCallback(
    (row: Pick<ServiceOrderRecord, "id" | "orderNo" | "status" | "bagClosed">): RowMenuItem[] => [
      ...(canSendToProof(row.status, Boolean(row.bagClosed)) && canWriteProof
        ? [
            {
              id: "send-to-proof",
              label: proofActionLabel("send_to_proof"),
              onSelect: () => {
                void handleProofAction(row, "send_to_proof");
              },
            },
          ]
        : []),
      ...(canActOnProof(row.status) && canWriteProof
        ? [
            {
              id: "complete-proof",
              label: proofActionLabel("complete_proof"),
              onSelect: () => {
                void handleProofAction(row, "complete_proof");
              },
            },
          ]
        : []),
      ...(canRecordOsApproval(row.status) && canWrite
        ? [
            {
              id: "approval",
              label: "Aprovação",
              onSelect: () => {
                openApprovalPanel(row);
              },
            },
          ]
        : []),
      ...(row.status === "ready_for_pickup" && canWrite
        ? [
            {
              id: "deliver",
              label: "Retirada",
              onSelect: () => {
                openPickupPanel(row);
              },
            },
          ]
        : []),
      {
        id: "print",
        label: "Imprimir",
        children: [
          {
            id: "print-os",
            label: "Ordem de serviço",
            onSelect: () => {
              void printServiceOrder(row.id);
            },
          },
          {
            id: "print-op",
            label: "Ordem de produção",
            disabled: !canReadProduction && !canWriteProduction,
            onSelect: () => {
              void printProductionOrder(row.id)
                .then((view) => {
                  setMessage(`Ordem de produção ${view.productionNo} enviada para impressão.`);
                })
                .catch((error) => {
                  setMessage(formatWorkspaceMessage(error, "A Ordem de Produção não pôde ser impressa."));
                });
            },
          },
        ],
      },
      {
        id: "resend",
        label: "Reenviar",
        children: [
          {
            id: "whatsapp",
            label: "Por WhatsApp",
            onSelect: () => {
              void resendWhatsApp(row.id);
            },
          },
          {
            id: "email",
            label: "Por e-mail",
            onSelect: () => {
              void resendEmail(row.id);
            },
          },
        ],
      },
    ],
    [
      canReadProduction,
      canWrite,
      canWriteProduction,
      canWriteProof,
      handleProofAction,
      openApprovalPanel,
      openPickupPanel,
      printProductionOrder,
      printServiceOrder,
      resendEmail,
      resendWhatsApp,
    ],
  );

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isListWorkspace, loadOrders, session?.activeBranchId, session?.tenantId]);

  useEffect(() => {
    if (isListWorkspace) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadCustomers();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isListWorkspace, loadCustomers, session?.tenantId]);

  useEffect(() => {
    if (isListWorkspace) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isListWorkspace, loadUsers, session?.tenantId]);

  useEffect(() => {
    if (isListWorkspace) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadCatalogs();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isListWorkspace, loadCatalogs, session?.tenantId]);

  useEffect(() => {
    if (isListWorkspace) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadBagSettings();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isListWorkspace, loadBagSettings, session?.tenantId]);

  useEffect(() => {
    if (!headerForm.attendantId && session?.user?.id) {
      setHeaderForm((current) => ({ ...current, attendantId: session.user?.id ?? current.attendantId }));
    }
  }, [headerForm.attendantId, session?.user?.id, setHeaderForm]);

  useEffect(() => {
    if (!canRead || !session?.activeBranchId) {
      return;
    }
    if (!showCreateForm) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            branchId: session.activeBranchId ?? "",
            deliveryType: headerForm.deliveryType,
            itemCount: String(visibleItemRows.length || 1),
          });
          const suggestion = await apiJson<{ promisedDeliveryDate: string; promisedDeliveryTime: string }>(
            `/service-orders/delivery-preview?${params.toString()}`,
          );
          setHeaderForm((current) => ({
            ...current,
            promisedDeliveryDate: suggestion.promisedDeliveryDate,
            promisedDeliveryTime: toTimeInput(suggestion.promisedDeliveryTime) || current.promisedDeliveryTime,
          }));
        } catch {
          /* a atendente ainda pode preencher a saída na mão */
        }
      })();
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [apiJson, canRead, headerForm.deliveryType, session?.activeBranchId, setHeaderForm, showCreateForm, visibleItemRows.length]);

  useEffect(() => {
    if (!focusServiceOrderId || focusServiceOrderId === activeOrderId || showCreateForm) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveOrderId(focusServiceOrderId);
      void loadDetails(focusServiceOrderId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeOrderId, focusServiceOrderId, loadDetails, setActiveOrderId, showCreateForm]);

  useEffect(() => {
    if (!openProof || !focusServiceOrderId || !details || details.serviceOrder.id !== focusServiceOrderId) {
      return;
    }
    if (!canActOnProof(details.serviceOrder.status)) {
      return;
    }
    setProofPickerOpen(true);
    navigateWithinWorkspace(`/service-orders?focusServiceOrderId=${encodeURIComponent(focusServiceOrderId)}`);
  }, [details, focusServiceOrderId, navigateWithinWorkspace, openProof]);

  useEffect(() => {
    if (!openPickup || !focusServiceOrderId || !details || details.serviceOrder.id !== focusServiceOrderId) {
      return;
    }
    if (details.serviceOrder.status !== "ready_for_pickup") {
      return;
    }
    setPickupPickerOpen(true);
    navigateWithinWorkspace(`/service-orders?focusServiceOrderId=${encodeURIComponent(focusServiceOrderId)}`);
  }, [details, focusServiceOrderId, navigateWithinWorkspace, openPickup]);

  useEffect(() => {
    if (!openApproval || !focusServiceOrderId || !details || details.serviceOrder.id !== focusServiceOrderId) {
      return;
    }
    if (!canRecordOsApproval(details.serviceOrder.status)) {
      return;
    }
    setApprovalPickerOpen(true);
    navigateWithinWorkspace(`/service-orders?focusServiceOrderId=${encodeURIComponent(focusServiceOrderId)}`);
  }, [details, focusServiceOrderId, navigateWithinWorkspace, openApproval]);

  useEffect(() => {
    if (!details?.pickup?.photoAvailable || !details.serviceOrder.id) {
      setPickupPhoto(null);
      return;
    }
    let cancelled = false;
    void apiJson<{ mimeType: string; contentBase64: string } | null>(
      `/service-orders/${details.serviceOrder.id}/pickup/photo`,
    )
      .then((photo) => {
        if (!cancelled && photo?.contentBase64) {
          setPickupPhoto(`data:${photo.mimeType};base64,${photo.contentBase64}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPickupPhoto(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiJson, details?.pickup?.photoAvailable, details?.serviceOrder.id]);

  useEffect(() => {
    if (!details?.approval?.photoAvailable || !details.serviceOrder.id) {
      setApprovalPhoto(null);
      return;
    }
    let cancelled = false;
    void apiJson<{ mimeType: string; contentBase64: string } | null>(
      `/service-orders/${details.serviceOrder.id}/approval/photo`,
    )
      .then((photo) => {
        if (!cancelled && photo?.contentBase64) {
          setApprovalPhoto(`data:${photo.mimeType};base64,${photo.contentBase64}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApprovalPhoto(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiJson, details?.approval?.photoAvailable, details?.serviceOrder.id]);

  useEffect(() => {
    if (!anexoViewer && !payTarget) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAnexoViewer(null);
        setPayTarget(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anexoViewer, payTarget]);

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }

    setShowCreateForm(false);
    setActiveOrderId(null);
    setDetails(null);
    setPaymentSummary(null);
  }, [isListWorkspace, setActiveOrderId, setShowCreateForm]);

  const openCreateForm = useCallback(() => {
    setShowCreateForm(true);
    setDetails(null);
    setActiveOrderId(null);
    setPaymentSummary(null);
    setHeaderForm(createEmptyHeaderForm(session?.user?.id ?? ""));
    setItemRows([createEmptyServiceOrderItemGridRow(1)]);
    setMessage(null);
    void loadNextOrderNo();
  }, [loadNextOrderNo, session?.user?.id, setActiveOrderId, setHeaderForm, setItemRows, setShowCreateForm]);

  const openCreateWorkspace = useCallback(() => {
    const targetPath = "/service-orders?workspaceMode=new";
    if (isMobile) {
      navigateWithinWorkspace(targetPath);
      return;
    }

    openWorkspaceInNewTab(targetPath, "OS: Nova", { cloneCurrent: false, subtitle: "Novo cadastro" });
  }, [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  const openServiceOrderWorkspace = useCallback(
    (order: { id: string; orderNo: string; deliveryType?: string }, extras?: { openProof?: boolean }) => {
      const params = new URLSearchParams({ focusServiceOrderId: order.id });
      if (extras?.openProof) {
        params.set("openProof", "1");
      }
      const targetPath = `/service-orders?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }

      openWorkspaceInNewTab(targetPath, `OS ${order.orderNo}`, {
        cloneCurrent: false,
        subtitle: order.deliveryType ? osDeliveryTypeLabel(order.deliveryType) : null,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const handleReleaseDelivery = useCallback(
    async (reason: string) => {
      if (!canRelease || !selectedOrder) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/delivery-release`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        await loadOrders(isListWorkspace ? undefined : next.serviceOrder.id);
        setMessage(
          `Entrega da OS ${next.serviceOrder.orderNo} liberada. O saldo continua em aberto e o status da OS não muda.`,
        );
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A entrega não pôde ser liberada."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canRelease, isListWorkspace, loadOrders, selectedOrder],
  );

  const handleClientReturn = useCallback(
    async (itemIds: string[], options?: { waiveCharge?: boolean; reason?: string }) => {
      if (!canWrite || !selectedOrder) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/client-return`, {
          method: "POST",
          body: JSON.stringify({
            itemIds,
            waiveCharge: options?.waiveCharge === true,
            reason: options?.reason,
          }),
        });
        setReturnPickerOpen(false);
        openServiceOrderWorkspace(next.serviceOrder);
        await loadOrders(selectedOrder.id);
        const term = osReturnKindLabel(next.serviceOrder.returnKind) ?? "retorno";
        setMessage(`OS ${next.serviceOrder.orderNo} aberta como ${term}. Feche a sacola e salve para imprimir a OP.`);
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "O retorno do cliente não pôde ser aberto."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWrite, loadOrders, openServiceOrderWorkspace, selectedOrder],
  );

  const handleCounterRework = useCallback(
    async (itemIds: string[], reason?: string) => {
      if (!canWrite || !selectedOrder) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const next = await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/counter-rework`, {
          method: "POST",
          body: JSON.stringify({ itemIds, reason }),
        });
        setCounterPickerOpen(false);
        openServiceOrderWorkspace(next.serviceOrder);
        await loadOrders(selectedOrder.id);
        setMessage(
          `OS ${next.serviceOrder.orderNo} aberta como Refação no balcão. A mãe permanece parcial, sem Pagar, até quitar esta OS.`,
        );
      } catch (error) {
        setMessage(formatWorkspaceMessage(error, "A refação no balcão não pôde ser aberta."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWrite, loadOrders, openServiceOrderWorkspace, selectedOrder],
  );

  const closeServiceOrderWorkspace = useCallback((options?: { skipDiscard?: boolean }) => {
    const discardEmptyLinkedVersion = () => {
      if (
        options?.skipDiscard ||
        !canWrite ||
        !selectedOrder ||
        (details?.items.length ?? 0) > 0 ||
        (details?.groupVersions?.length ?? 0) <= 1
      ) {
        return;
      }
      void apiJson(`/service-orders/${selectedOrder.id}/cancel`, { method: "POST" }).catch(() => undefined);
    };

    discardEmptyLinkedVersion();

    if (!currentTabId || isMobile) {
      setShowCreateForm(false);
      setActiveOrderId(null);
      setDetails(null);
      navigateWithinWorkspace("/service-orders");
      return;
    }

    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/service-orders", "Ordens de serviço", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [
    apiJson,
    canWrite,
    closeWorkspace,
    currentTabId,
    details?.groupVersions?.length,
    details?.items.length,
    isMobile,
    navigateWithinWorkspace,
    openWorkspaceInNewTab,
    selectedOrder,
    setActiveOrderId,
    setShowCreateForm,
  ]);

  useEffect(() => {
    if (workspaceMode !== "new" || showCreateForm || activeOrderId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      openCreateForm();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeOrderId, openCreateForm, showCreateForm, workspaceMode]);

  function validateItems(requireAtLeastOneItem: boolean) {
    return validateServiceOrderItemGrid(itemRows, {
      requireAtLeastOne: requireAtLeastOneItem,
      maxItems: maxPiecesPerBag,
    });
  }

  async function persistCurrentServiceOrder(requireAtLeastOneItem: boolean) {
    if (!canWrite) {
      throw new Error("Você não tem permissão para gravar a OS.");
    }

    if (showCreateForm) {
      if (!canPersistInContext || !session?.activeBranchId) {
        throw new Error("Escolha a Filial no contexto antes de salvar a OS.");
      }
      if (!headerForm.customerId) {
        throw new Error("Escolha o cliente antes de salvar a OS.");
      }

      const itemValidation = validateItems(requireAtLeastOneItem);
      if (itemValidation) {
        throw new Error(itemValidation);
      }

      const created = await apiJson<CreateServiceOrderResponse>("/service-orders", {
        method: "POST",
        body: JSON.stringify({
          branchId: session.activeBranchId,
          customerId: headerForm.customerId,
          deliveryType: headerForm.deliveryType,
          promisedDeliveryDate: headerForm.promisedDeliveryDate || undefined,
          promisedDeliveryTime: toTimeInput(headerForm.promisedDeliveryTime) || undefined,
          commercialResponsibleActorId: headerForm.attendantId || session?.user?.id || undefined,
          operationalPriority: headerForm.operationalPriority || undefined,
          commercialNotes: headerForm.commercialNotes || undefined,
          customerNotes: headerForm.customerNotes || undefined,
          difficultyGrade: headerForm.difficultyGrade ? Number(headerForm.difficultyGrade) : null,
          items: buildCreateServiceOrderItemsPayload(itemRows),
        }),
      });
      const createdId = created.serviceOrder.id;
      setShowCreateForm(false);
      setActiveOrderId(createdId);
      return { id: createdId, orderNo: created.serviceOrder.orderNo };
    }

    if (!selectedOrder || !canEditSelectedOrder) {
      throw new Error("Esta OS não pode ser alterada.");
    }
    if (!headerForm.customerId) {
      throw new Error("Escolha o cliente antes de atualizar a OS.");
    }

    const itemValidation = validateItems(requireAtLeastOneItem);
    if (itemValidation) {
      throw new Error(itemValidation);
    }

    await apiJson<ServiceOrderRecord>(`/service-orders/${selectedOrder.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        customerId: headerForm.customerId,
        deliveryType: headerForm.deliveryType,
        promisedDeliveryDate: headerForm.promisedDeliveryDate || undefined,
        promisedDeliveryTime: toTimeInput(headerForm.promisedDeliveryTime) || undefined,
        commercialResponsibleActorId: headerForm.attendantId || undefined,
        operationalPriority: headerForm.operationalPriority || undefined,
        commercialNotes: headerForm.commercialNotes || null,
        customerNotes: headerForm.customerNotes || null,
        difficultyGrade: headerForm.difficultyGrade ? Number(headerForm.difficultyGrade) : null,
      }),
    });

    const plan = buildServiceOrderItemMutationPlan(itemRows, details?.items ?? []);

    for (const item of plan.update) {
      await apiJson(`/service-orders/${selectedOrder.id}/items/${item.itemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          itemType: item.itemType,
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          complement: item.complement,
          brand: item.brand,
          model: item.model,
          serialNo: item.serialNo,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountValue: item.discountValue,
          timeMinutes: item.timeMinutes,
        }),
      });
    }

    for (const item of plan.remove) {
      await apiJson(`/service-orders/${selectedOrder.id}/items/${item.itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: item.status }),
      });
    }

    for (const item of plan.create) {
      await apiJson(`/service-orders/${selectedOrder.id}/items`, {
        method: "POST",
        body: JSON.stringify(item),
      });
    }

    return { id: selectedOrder.id, orderNo: selectedOrder.orderNo };
  }

  function notifyServiceOrderList() {
    window.dispatchEvent(new CustomEvent(OS_LIST_REFRESH_EVENT));
  }

  async function handleCreate(event: { preventDefault(): void }) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const persisted = await persistCurrentServiceOrder(true);
      await loadOrders(persisted.id);
      notifyServiceOrderList();
      navigateWithinWorkspace(`/service-orders?focusServiceOrderId=${encodeURIComponent(persisted.id)}`);
      setMessage("OS salva como rascunho. A sacola ainda está aberta e a OP ainda não foi gerada.");
    } catch (error) {
      setMessage(
        formatWorkspaceMessage(
          error,
          "A OS não pôde ser salva. Confira o contexto ativo, o cliente e as peças, e tente de novo.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const persisted = await persistCurrentServiceOrder(false);
      await loadOrders(persisted.id);
      notifyServiceOrderList();
      setMessage("OS atualizada como rascunho. A sacola ainda está aberta e a OP ainda não foi gerada.");
    } catch (error) {
      setMessage(
        formatWorkspaceMessage(
          error,
          "A OS não pôde ser atualizada. Confira o cabeçalho e as peças, e tente de novo.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function closeSavedServiceOrderTab() {
    if (!currentTabId || isMobile) {
      setShowCreateForm(false);
      setActiveOrderId(null);
      setDetails(null);
      navigateWithinWorkspace("/service-orders");
      return;
    }

    closeWorkspace(currentTabId);
  }

  function continueWithNewServiceOrder() {
    const closingTabId = currentTabId;
    if (!closingTabId || isMobile) {
      openCreateForm();
      navigateWithinWorkspace("/service-orders?workspaceMode=new");
      return;
    }

    openCreateWorkspace();
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }

  async function persistAndCloseBag() {
    const persisted = await persistCurrentServiceOrder(true);
    const closed = await apiJson<ServiceOrderDetail>(`/service-orders/${persisted.id}/close-bag`, {
      method: "POST",
    });
    return closed;
  }

  async function openNextVersionInNewTab(sourceServiceOrderId: string) {
    const next = await apiJson<ServiceOrderDetail>(`/service-orders/${sourceServiceOrderId}/next-version`, {
      method: "POST",
    });
    openServiceOrderWorkspace(next.serviceOrder);
    return next;
  }

  async function commitClosedBag(serviceOrder: ServiceOrderRecord, reservedWindow?: Window | null) {
    const result = await runClosedBagCommit({
      wantsNextVersion,
      spawnNext: () => openNextVersionInNewTab(serviceOrder.id),
      print: () => printProductionOrder(serviceOrder.id, reservedWindow),
    });
    if (result.next) {
      setWantsNextVersion(false);
    }
    return {
      printed: result.printed,
      nextOrderNo: result.next?.serviceOrder.orderNo ?? null,
      printError: result.printError,
    };
  }

  async function handleCloseBag() {
    if (!canWrite) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const closed = await persistAndCloseBag();
      setWantsNextVersion(false);
      await loadOrders(closed.serviceOrder.id);
      setMessage(
        "Sacola fechada. Esta versão ficou travada. Se errou, use Abrir sacola. Para imprimir a OP, clique em Gravar. Se ainda houver peças, marque Abrir nova versão e depois Gravar.",
      );
    } catch (error) {
      setMessage(
        formatWorkspaceMessage(
          error,
          "A sacola não pôde ser fechada. Confira as peças, grave de novo e tente fechar outra vez.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenBag() {
    if (!canReopenSelectedBag || !selectedOrder?.bagClosed) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await apiJson<ServiceOrderDetail>(`/service-orders/${selectedOrder.id}/open-bag`, {
        method: "POST",
      });
      setWantsNextVersion(false);
      await loadOrders(selectedOrder.id);
      setMessage("Sacola reaberta. Você pode corrigir as peças ou incluir a que o cliente pediu.");
    } catch (error) {
      setMessage(
        formatWorkspaceMessage(
          error,
          "A sacola não pôde ser reaberta. Tente de novo.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClosedBagSave(after: "close" | "continue") {
    if (!canWrite || !selectedOrder?.bagClosed) {
      return;
    }

    setSaving(true);
    setMessage(null);
    const reservedPrintWindow = reservePrintWindow();
    try {
      const result = await commitClosedBag(selectedOrder, reservedPrintWindow);
      await loadOrders(selectedOrder.id);
      notifyServiceOrderList();
      if (result.nextOrderNo && result.printError) {
        reservedPrintWindow?.close();
        setMessage(
          `A versão ${result.nextOrderNo} abriu em outra aba, já editável. A impressão da OP foi bloqueada pelo navegador. Permita pop-ups e reimprima pelo menu ⋮.`,
        );
        return;
      }
      if (after === "continue") {
        continueWithNewServiceOrder();
        return;
      }
      closeSavedServiceOrderTab();
    } catch (error) {
      reservedPrintWindow?.close();
      setMessage(
        formatWorkspaceMessage(
          error,
          "A Ordem de Produção não pôde ser impressa. Confira a sacola e tente salvar de novo.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  const canMutateItems = showCreateForm || canEditSelectedOrder;

  function focusItemRow(localId: string) {
    window.requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-os-item-row="${localId}"]`);
      const field = row?.querySelector<HTMLInputElement>("input:not([disabled])");
      field?.focus({ preventScroll: true });
      scrollFieldIntoOsGrid(field ?? null);
    });
  }

  function addPieceRow() {
    if (!canAddServiceOrderItemGridRow(itemRows, maxPiecesPerBag)) {
      setMessage(
        `Esta versão aceita no máximo ${maxPiecesPerBag} peças. Feche a sacola para abrir a próxima versão.`,
      );
      return false;
    }
    const nextItemNo = itemRows.reduce((maxItemNo, row) => Math.max(maxItemNo, row.itemNo), 0) + 1;
    setItemRows((current) => addServiceOrderItemGridRow(current, maxPiecesPerBag));
    focusItemRow(`draft-${nextItemNo}`);
    return true;
  }

  const addPieceRowId = useMemo(() => {
    const editingRow = [...visibleItemRows].reverse().find((row) => showCreateForm || row.isEditing);
    return (editingRow ?? visibleItemRows[visibleItemRows.length - 1])?.localId ?? null;
  }, [showCreateForm, visibleItemRows]);

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Ordens de serviço indisponíveis</h3>
        <p>Você não possui acesso às OS no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace && !showCreateForm && !selectedOrder && !detailLoading ? (
        <section className="hero-card">
          <div className="eyebrow">Operações</div>
          <h1 className="title">Ordem de serviço</h1>
          <p>A Empresa e a Filial vêm do contexto ativo. Abra uma OS na grade ou clique em Nova OS.</p>
        </section>
      ) : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {anexoViewer ? (
        <div aria-labelledby="os-anexo-title" aria-modal="true" className="os-anexo-lightbox" role="dialog">
          <button
            aria-label="Fechar anexos"
            className="os-anexo-lightbox__backdrop"
            onClick={() => setAnexoViewer(null)}
            type="button"
          />
          <div className="os-anexo-lightbox__card">
            <OsAttachmentsPanel
              orderNo={anexoViewer.orderNo}
              approval={anexoViewer.approval}
              approvalPhoto={anexoViewer.approvalPhoto}
              pickup={anexoViewer.pickup}
              pickupPhoto={anexoViewer.pickupPhoto}
              loading={anexoViewer.loading}
              onClose={() => setAnexoViewer(null)}
            />
          </div>
        </div>
      ) : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyOsListFilters}
          buildExcelCsv={buildOsExcelCsv}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.os.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "OS",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.orderNo}</strong>
                  <div className="table-subtle">
                    {osDeliveryTypeLabel(row.deliveryType)}
                    {row.operationalPriority ? ` · ${row.operationalPriority}` : ""}
                  </div>
                </>
              ),
            },
            { id: "delivery", label: "Entrega", render: (row) => formatDate(row.promisedDeliveryDate) },
            { id: "type", label: "Tipo", render: (row) => osDeliveryTypeLabel(row.deliveryType) },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "cancelled" ? "inactive" : "active"}`}>
                  {osStatusLabel(row.status)}
                </span>
              ),
            },
            { id: "value", label: "Valor", render: (row) => row.totalValue ?? "—" },
          ]}
          defaultColumnIds={["name", "delivery", "status"]}
          emptyFilters={{ name: "", status: "", deliveryType: "", payment: "" }}
          emptyMessage="Nenhuma OS encontrada para os filtros informados."
          excelFileName="ordens-de-servico.csv"
          filterFields={[
            { id: "name", label: "Número", lookup: true, placeholder: "Número já cadastrado" },
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "open", label: "Aberta" },
                { value: "approved", label: "Aprovada" },
                { value: "in_production", label: "Em produção" },
                { value: "awaiting_proof", label: "Aguardando prova" },
                { value: "awaiting_quality", label: "Aguardando controle de qualidade" },
                { value: "quality", label: "Controle de qualidade" },
                { value: "in_rework", label: "Em refação" },
                { value: "ready_for_pickup", label: "Pronto para retirada" },
                { value: "picked_up", label: "Retirado" },
                { value: "cancelled", label: "Cancelada" },
              ],
            },
            {
              id: "deliveryType",
              kind: "select",
              label: "Tipo de entrega",
              options: [
                { value: "", label: "Todos" },
                { value: "Standard", label: "Normal" },
                { value: "Priority", label: "Urgente" },
                { value: "Express", label: "Expresso" },
              ],
            },
            {
              id: "payment",
              kind: "select",
              label: "Pagamento",
              options: [
                { value: "", label: "Todos" },
                { value: "open", label: "Em aberto" },
                { value: "paid", label: "Pago" },
              ],
            },
          ]}
          loading={loading}
          onCreate={openCreateWorkspace}
          onEdit={openServiceOrderWorkspace}
          onPay={
            canWriteFinance
              ? (row) => {
                  void openPay(row);
                }
              : undefined
          }
          canPay={(row) => osCanOpenPay(row)}
          extraActions={(row) => (
            <OsAnexoButton
              disabled={Boolean(anexoViewer?.loading)}
              hasAttachments={Boolean(row.hasAttachments)}
              onClick={() => {
                void openAnexoPanel(row);
              }}
            />
          )}
          rowMenu={buildOsRowMenu}
          records={orders}
          rowLabel={(row) => row.orderNo}
          searchKey="name"
          searchOptions={orderLookupOptions}
          searchPlaceholder="Buscar por número"
          title="Ordens de serviço"
        />
      ) : null}

      {payTarget ? (
        <div aria-labelledby="os-pay-title" aria-modal="true" className="os-anexo-lightbox" role="dialog">
          <button
            aria-label="Fechar pagamento"
            className="os-anexo-lightbox__backdrop"
            onClick={() => setPayTarget(null)}
            type="button"
          />
          <div className="os-anexo-lightbox__card">
            <OsPayPanel
              orderNo={payTarget.orderNo}
              branchId={payTarget.branchId}
              canRefund={canRefund}
              summary={payTarget.summary}
              onClose={() => setPayTarget(null)}
              onPaid={(summary) => {
                const paid = Number(summary.outstandingBalance) <= 0;
                const closeOrderTab = osShouldCloseOrderTab({
                  outstandingBalance: summary.outstandingBalance,
                  openCharge: summary.openCharge,
                  fromList: isListWorkspace,
                });
                setPayTarget(paid ? null : { orderNo: payTarget.orderNo, branchId: payTarget.branchId, summary });
                setPaymentSummary(summary);
                setOrders((current) =>
                  current.map((order) =>
                    order.id === summary.serviceOrderId
                      ? {
                          ...order,
                          paymentStatus: summary.paymentStatus,
                          outstandingBalance: summary.outstandingBalance,
                          amountPaid: summary.amountPaid,
                        }
                      : order,
                  ),
                );
                notifyServiceOrderList();
                const amountPaidNow = Number(summary.amountPaid);
                const amountPaidBefore = Number(paymentSummary?.amountPaid ?? 0);
                if (summary.openCharge) {
                  setMessage(`Cobrança da OS ${payTarget.orderNo} enviada. O sistema consulta a maquininha antes de cobrar de novo.`);
                } else if (paid) {
                  setMessage(`Pagamento da OS ${payTarget.orderNo} registrado. A OS está quitada.`);
                } else if (amountPaidNow < amountPaidBefore) {
                  setMessage(`Estorno da OS ${payTarget.orderNo} registrado. O saldo voltou a ficar em aberto.`);
                } else if (amountPaidNow > amountPaidBefore) {
                  setMessage(`Pagamento parcial da OS ${payTarget.orderNo} registrado.`);
                }
                if (closeOrderTab) {
                  closeSavedServiceOrderTab();
                }
              }}
            />
          </div>
        </div>
      ) : null}

        {!isListWorkspace ? (
        <article className="mini-card cadastro-form os-form">
          <div className="workspace-toolbar">
            <div className="workspace-toolbar__copy">
              <h3>{showCreateForm ? "Nova OS" : selectedOrder ? `OS ${selectedOrder.orderNo}` : "Ordem de serviço"}</h3>
              <p>
                {showCreateForm
                  ? `Cada linha é uma peça. Cada versão aceita até ${maxPiecesPerBag} peças. Salvar grava rascunho. Fechar sacola só trava.`
                  : selectedOrder?.bagClosed
                    ? `Sacola fechada. Esta versão está travada. Se errou, abra a sacola. Gravar imprime a OP, atualiza a grade e fecha esta aba. Gravar e Continuar faz o mesmo e abre uma OS nova.`
                    : selectedOrder
                      ? `Cada linha é uma peça. Cada versão aceita até ${maxPiecesPerBag} peças. Salvar alterações grava rascunho. Fechar sacola trava; a OP só sai ao gravar depois.`
                      : "Abra uma OS na grade ou cadastre uma nova."}
              </p>
              {!showCreateForm && selectedOrder?.publicToken ? (
                <p className="table-subtle">
                  Link para colar no WhatsApp Web:{" "}
                  <button className="button-ghost" onClick={() => void copyPublicLink()} type="button">
                    Copiar link
                  </button>
                </p>
              ) : null}
              {!showCreateForm && details?.customer?.whatsappConsent === false ? (
                <p className="os-rule-banner">Sem aviso: cliente não autorizou WhatsApp.</p>
              ) : null}
              {!showCreateForm && details?.origin ? (
                <p className="table-subtle">
                  Retorno{osReturnKindLabel(selectedOrder?.returnKind) ? ` (${osReturnKindLabel(selectedOrder?.returnKind)})` : ""} da{" "}
                  <button
                    className="button-ghost"
                    onClick={() => openServiceOrderWorkspace(details.origin!)}
                    type="button"
                  >
                    {details.origin.orderNo}
                  </button>
                </p>
              ) : null}
              {!showCreateForm && selectedOrder?.returnKind && selectedOrder.returnKind !== "counter" ? (
                <p className="table-subtle">
                  Técnica original: {selectedOrder.originFloorNames?.trim() || "Ninguém terminou esta OS no chão."}
                  {selectedOrder.chargeWaivedReason ? ` · Aberta sem valor. Motivo: ${selectedOrder.chargeWaivedReason}` : ""}
                </p>
              ) : null}
              {!showCreateForm && details?.linkedReturns && details.linkedReturns.length > 0 ? (
                <p className="table-subtle">
                  Retornos:{" "}
                  {details.linkedReturns.map((linked, index) => (
                    <span key={linked.id}>
                      {index > 0 ? " · " : null}
                      <button
                        className="button-ghost"
                        onClick={() => openServiceOrderWorkspace(linked)}
                        type="button"
                      >
                        {linked.orderNo}
                      </button>
                      {osReturnKindLabel(linked.returnKind) ? ` (${osReturnKindLabel(linked.returnKind)})` : ""}
                    </span>
                  ))}
                </p>
              ) : null}
              {!showCreateForm && details?.groupVersions && details.groupVersions.length > 1 ? (
                <p className="table-subtle">
                  Versões ligadas:{" "}
                  {details.groupVersions.map((version, index) => (
                    <span key={version.id}>
                      {index > 0 ? " · " : null}
                      {version.id === selectedOrder?.id ? (
                        <strong>{version.orderNo}</strong>
                      ) : (
                        <button
                          className="button-ghost"
                          onClick={() => {
                            setActiveOrderId(version.id);
                            void loadDetails(version.id);
                          }}
                          type="button"
                        >
                          {version.orderNo}
                        </button>
                      )}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
            {!showCreateForm && selectedOrder && canWrite ? (
              <button className="button-secondary" onClick={openCreateWorkspace} type="button">
                Nova OS
              </button>
            ) : null}
          </div>

          {detailLoading && !showCreateForm ? <div className="empty-state">Carregando a OS…</div> : null}

          {returnPickerOpen && selectedOrder ? (
            <OsClientReturnPanel
              canWaiveCharge={canRelease}
              floorFinishNames={details?.floorFinishNames ?? []}
              items={details?.items ?? []}
              maxPiecesPerBag={maxPiecesPerBag}
              orderNo={selectedOrder.orderNo}
              preview={details?.clientReturnPreview ?? null}
              saving={saving}
              onClose={() => setReturnPickerOpen(false)}
              onConfirm={(itemIds) => handleClientReturn(itemIds)}
              onWaive={(itemIds, reason) => handleClientReturn(itemIds, { waiveCharge: true, reason })}
            />
          ) : null}

          {counterPickerOpen && selectedOrder ? (
            <OsClientReturnPanel
              items={details?.items ?? []}
              maxPiecesPerBag={maxPiecesPerBag}
              mode="counter"
              orderNo={selectedOrder.orderNo}
              preview={null}
              saving={saving}
              onClose={() => setCounterPickerOpen(false)}
              onConfirm={(itemIds, reason) => handleCounterRework(itemIds, reason)}
            />
          ) : null}

          {proofPickerOpen && selectedOrder ? (
            <OsProofNotesPanel
              items={details?.items ?? []}
              orderNo={selectedOrder.orderNo}
              saving={saving}
              onClose={() => setProofPickerOpen(false)}
              onConfirm={(notes) => handleCompleteProof(notes)}
            />
          ) : null}

          {pickupPickerOpen && selectedOrder ? (
            <OsPickupPanel
              canRelease={canRelease}
              deliveryRelease={details?.deliveryRelease ?? null}
              orderNo={selectedOrder.orderNo}
              payment={paymentSummary}
              pickup={details?.pickup ?? null}
              saving={saving}
              onClose={() => setPickupPickerOpen(false)}
              onComplete={(input) => handleCompletePickup(input)}
              onRelease={(reason) => handleReleaseDelivery(reason)}
            />
          ) : null}

          {approvalPickerOpen && selectedOrder ? (
            <OsApprovalPanel
              orderNo={selectedOrder.orderNo}
              approval={details?.approval ?? null}
              saving={saving}
              onClose={() => setApprovalPickerOpen(false)}
              onComplete={(input) => handleCompleteApproval(input)}
            />
          ) : null}

          {showCreateForm || selectedOrder ? (
            <form
              className="form-grid"
              onSubmit={(event) => {
                if (!showCreateForm && bagClosed) {
                  event.preventDefault();
                  void handleClosedBagSave("close");
                  return;
                }
                if (showCreateForm) {
                  void handleCreate(event);
                  return;
                }
                void handleUpdate(event);
              }}
            >
              <div className="mini-section">
                <h4>Cliente</h4>
                <div className="os-client-row">
                  <div className="field">
                    <SmartLookup
                      allowClear={false}
                      canCreate={canWriteCustomers}
                      createLabel="Cadastrar"
                      disabled={saving || (!showCreateForm && !canEditSelectedOrder) || !canReadCustomers}
                      emptyMessage={
                        loadingCustomers
                          ? "Carregando clientes…"
                          : canReadCustomers
                            ? "Nenhum cliente encontrado."
                            : "A busca de cliente depende da permissão de Clientes."
                      }
                      entityType="customers"
                      label="Cliente"
                      onChange={(option) => setHeaderForm((current) => ({ ...current, customerId: option?.id ?? "" }))}
                      onCreate={openCreateCustomerFromLookup}
                      onOpen={() => {
                        void loadCustomers();
                      }}
                      options={customerLookupOptions}
                      required
                      searchPlaceholder="Digite o nome do cliente"
                      value={headerForm.customerId}
                    />
                  </div>
                  <div className="button-row">
                    <button
                      className="button-secondary"
                      disabled={!selectedCustomerId}
                      onClick={() => openRelatedCustomerWorkspace()}
                      type="button"
                    >
                      Abrir cliente
                    </button>
                    <button
                      className="button-secondary"
                      disabled={!selectedCustomerId}
                      onClick={() => openRelatedCustomerWorkspace("measurements")}
                      type="button"
                    >
                      Abrir medidas
                    </button>
                  </div>
                </div>
              </div>

              <div className="mini-section">
                <h4>Ordem de serviço</h4>
                <div className="os-stack">
                  <div className="os-box">
                    <p className="os-box__title">Identificação</p>
                    <div className="os-id-row">
                      <label className="field">
                        <span>Número</span>
                        <input disabled value={selectedOrder?.orderNo ?? previewOrderNo} />
                      </label>
                      <label className="field">
                        <span>Status</span>
                        <input disabled value={selectedOrder ? osStatusLabel(selectedOrder.status) : "Aberta"} />
                      </label>
                      <div className="field">
                        <span>Entrada</span>
                        <div className="os-datetime">
                          <input
                            disabled
                            type="date"
                            value={selectedOrder ? toDateInput(selectedOrder.openedAt) : nowDateInput()}
                          />
                          <input
                            disabled
                            type="time"
                            value={selectedOrder ? toTimeInput(null, selectedOrder.openedAt) : nowTimeInput()}
                          />
                        </div>
                      </div>
                      <div className="field" title="Preenche quando o cliente assina a retirada ou o atendente registra Recebido.">
                        <span>Saída</span>
                        <div className="os-datetime">
                          <input
                            disabled
                            type="date"
                            value={toDateInput(selectedOrder?.actualDeliveryDate)}
                          />
                          <input
                            disabled
                            type="time"
                            value={toTimeInput(selectedOrder?.actualDeliveryTime)}
                          />
                        </div>
                      </div>
                      <div className="field" title="Data e hora em que o cliente concordou com o serviço e o valor, ou a produção foi liberada.">
                        <span>Aprovação</span>
                        <div className="os-datetime">
                          <input
                            disabled
                            type="date"
                            value={toDateInput(details?.approval?.confirmedAt as string | undefined)}
                          />
                          <input
                            disabled
                            type="time"
                            value={toTimeInput(null, details?.approval?.confirmedAt as string | undefined)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="os-box">
                    <p className="os-box__title">Previsão de entrega</p>
                    <div className="os-forecast-row">
                      <label className="field field--required">
                        <span>Tipo</span>
                        <select
                          disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                          required
                          value={headerForm.deliveryType}
                          onChange={(event) => {
                            const deliveryType = event.target.value as ServiceOrderHeaderForm["deliveryType"];
                            setHeaderForm((current) => ({ ...current, deliveryType }));
                            if (session?.activeBranchId) {
                              const params = new URLSearchParams({
                                branchId: session.activeBranchId,
                                deliveryType,
                                itemCount: String(visibleItemRows.length || 1),
                              });
                              void apiJson<{ promisedDeliveryDate: string; promisedDeliveryTime: string }>(
                                `/service-orders/delivery-preview?${params.toString()}`,
                              )
                                .then((suggestion) => {
                                  setHeaderForm((current) => ({
                                    ...current,
                                    promisedDeliveryDate: suggestion.promisedDeliveryDate,
                                    promisedDeliveryTime: toTimeInput(suggestion.promisedDeliveryTime),
                                  }));
                                })
                                .catch(() => undefined);
                            }
                          }}
                        >
                          <option value="Standard">Normal</option>
                          <option value="Priority">Urgente</option>
                          <option value="Express">Expresso</option>
                        </select>
                      </label>
                      <label className="field field--required">
                        <span>Data</span>
                        <input
                          disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                          required
                          type="date"
                          value={headerForm.promisedDeliveryDate}
                          onChange={(event) =>
                            setHeaderForm((current) => ({ ...current, promisedDeliveryDate: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field field--required">
                        <span>Horário</span>
                        <input
                          disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                          required
                          type="time"
                          value={headerForm.promisedDeliveryTime}
                          onChange={(event) =>
                            setHeaderForm((current) => ({
                              ...current,
                              promisedDeliveryTime: toTimeInput(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Grau</span>
                        <select
                          disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                          value={headerForm.difficultyGrade}
                          onChange={(event) => setHeaderForm((current) => ({ ...current, difficultyGrade: event.target.value }))}
                        >
                          <option value="">Maior dos serviços</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Prioridade</span>
                        <input
                          disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                          placeholder="Opcional"
                          value={headerForm.operationalPriority}
                          onChange={(event) =>
                            setHeaderForm((current) => ({ ...current, operationalPriority: event.target.value }))
                          }
                        />
                      </label>
                      <div className="field">
                        <span>Prazo</span>
                        <button
                          className="button-secondary"
                          disabled={saving || !canWrite || (!showCreateForm && !canEditSelectedOrder)}
                          onClick={() => void handleRecalculateDelivery()}
                          type="button"
                        >
                          Recalcular prazo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="os-box">
                    <p className="os-box__title">Responsáveis</p>
                    <div className="os-people-row">
                      <div className="field">
                        <SmartLookup
                          allowClear={false}
                          canCreate={false}
                          disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                          emptyMessage="Nenhum atendente encontrado."
                          entityType="employees"
                          label="Atendente"
                          onChange={(option) => setHeaderForm((current) => ({ ...current, attendantId: option?.id ?? "" }))}
                          options={attendantLookupOptions}
                          searchPlaceholder="Quem está abrindo a OS"
                          value={headerForm.attendantId || session?.user?.id || ""}
                        />
                      </div>
                      <label className="field">
                        <span>Técnico</span>
                        <input
                          disabled
                          placeholder="Assume ao ler o QR"
                          value={details?.productionTechnician?.displayName ?? ""}
                        />
                      </label>
                      <label className="field">
                        <span>Qualidade</span>
                        <input
                          disabled
                          placeholder="Ao revisar e aprovar"
                          value={details?.qualityReviewer?.displayName ?? ""}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="mini-section os-items-section"
                onFocusCapture={(event) => {
                  const target = event.target;
                  window.requestAnimationFrame(() => scrollFieldIntoOsGrid(target));
                }}
              >
                <div className="workspace-toolbar">
                  <div className="workspace-toolbar__copy">
                    <h4>Serviços e mão de obra</h4>
                    <p>
                      Cada linha é uma peça (quantidade 1). A marca é obrigatória; modelo e série são opcionais. Até {maxPiecesPerBag} peças nesta versão. Fechar trava;
                      Abrir sacola desfaz. Gravar com a sacola fechada imprime a OP.
                    </p>
                  </div>
                </div>

                <div className="data-table-wrapper os-items-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th title="Sequência">S</th>
                        <th>Produto</th>
                        <th>Serviço</th>
                        <th>Detalhar o serviço</th>
                        <th>Marca</th>
                        <th>Modelo</th>
                        <th>Série</th>
                        <th title="Tempo previsto do combo produto + serviço">Tempo (min)</th>
                        <th>Valor</th>
                        <th>Desconto</th>
                        <th>Subtotal</th>
                        <th className="os-add-piece-col">
                          <span className="sr-only">Adicionar peça</span>
                        </th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItemRows.map((row, index) => {
                        const editable = saving ? false : showCreateForm || row.isEditing;
                        const canMutateRow = showCreateForm || canEditSelectedOrder;
                        const sequence = index + 1;
                        return (
                          <tr data-os-item-row={row.localId} key={row.localId}>
                            <td className="os-item-seq" title={`Sequência ${sequence}`}>
                              {sequence}
                            </td>
                            <td>
                              <SmartLookup
                                compact
                                canCreate={canWrite}
                                createLabel="Cadastrar"
                                disabled={!editable}
                                entityType="products"
                                label="Produto"
                                required
                                onChange={(option) =>
                                  setItemRows((current) => {
                                    const nextProductId = option?.id ?? "";
                                    const stillValid = Boolean(
                                      row.serviceId &&
                                        productPrices.some(
                                          (price) =>
                                            price.productId === nextProductId &&
                                            price.serviceId === row.serviceId &&
                                            price.status !== "inactive",
                                        ),
                                    );
                                    return updateServiceOrderItemGridRow(current, row.localId, {
                                      productId: nextProductId,
                                      itemType: option?.label ?? "",
                                      ...(stillValid
                                        ? {
                                            unitPrice: suggestedPriceFor(nextProductId, row.serviceId),
                                            timeMinutes: estimatedMinutesFor(nextProductId, row.serviceId),
                                          }
                                        : { serviceId: "", description: "", unitPrice: "", timeMinutes: "" }),
                                    });
                                  })
                                }
                                onCreate={(query) => {
                                  const params = new URLSearchParams();
                                  params.set("workspaceMode", "new");
                                  if (query.trim()) params.set("prefillName", query.trim());
                                  const targetPath = `/products?${params.toString()}`;
                                  if (isMobile) {
                                    navigateWithinWorkspace(targetPath);
                                    return;
                                  }
                                  openWorkspaceInNewTab(targetPath, "Produto: Novo", { cloneCurrent: false, subtitle: "Novo cadastro" });
                                }}
                                onOpen={() => {
                                  void loadCatalogs();
                                }}
                                options={productLookupOptions}
                                placeholder="Calça, saia, vestido"
                                searchPlaceholder="Digite o produto"
                                value={row.productId}
                              />
                            </td>
                            <td>
                              <SmartLookup
                                compact
                                canCreate={canWrite && Boolean(row.productId)}
                                createLabel="Cadastrar"
                                disabled={!editable || !row.productId}
                                emptyMessage={
                                  row.productId
                                    ? "Nenhum serviço cadastrado para este produto."
                                    : "Escolha o produto primeiro."
                                }
                                entityType="services"
                                label="Serviço"
                                required
                                onChange={(option) => {
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, {
                                      serviceId: option?.id ?? "",
                                      description: option?.label ?? "",
                                      unitPrice: option?.id ? suggestedPriceFor(row.productId, option.id) : "",
                                      timeMinutes: option?.id ? estimatedMinutesFor(row.productId, option.id) : "",
                                    }),
                                  );
                                }}
                                onOpen={() => {
                                  void loadCatalogs();
                                }}
                                options={serviceLookupOptionsFor(row)}
                                placeholder={row.productId ? "Serviços deste produto" : "Escolha o produto"}
                                searchPlaceholder="Digite o serviço"
                                value={row.serviceId}
                                renderQuickCreate={
                                  row.productId
                                    ? ({ cancelCreate, completeCreate, initialValue }) => (
                                        <OsProductPriceQuickCreate
                                          initialServiceName={initialValue}
                                          productId={row.productId}
                                          productName={row.itemType || "Produto"}
                                          onCancel={cancelCreate}
                                          onCreated={(created) => {
                                            setProductPrices((current) => [
                                              created,
                                              ...current.filter((item) => item.id !== created.id),
                                            ]);
                                            setItemRows((current) =>
                                              updateServiceOrderItemGridRow(current, row.localId, {
                                                serviceId: created.serviceId,
                                                description: created.serviceName,
                                                unitPrice: formatSuggestedPrice(created.suggestedPrice),
                                                timeMinutes: String(created.estimatedMinutes),
                                              }),
                                            );
                                            completeCreate({
                                              id: created.serviceId,
                                              label: created.serviceName,
                                              hint: formatOsMoney(Number(created.suggestedPrice)),
                                            });
                                          }}
                                        />
                                      )
                                    : undefined
                                }
                              />
                            </td>
                            <td>
                              <OsWorkTextarea
                                disabled={!editable}
                                sequence={sequence}
                                value={row.complement}
                                onChange={(complement) =>
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, { complement }),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="os-item-input"
                                disabled={!editable}
                                placeholder="Marca"
                                required
                                value={row.brand}
                                onChange={(event) =>
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, { brand: event.target.value }),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="os-item-input"
                                disabled={!editable}
                                placeholder="Modelo"
                                value={row.model}
                                onChange={(event) =>
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, { model: event.target.value }),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="os-item-input"
                                disabled={!editable}
                                placeholder="Série"
                                value={row.serialNo}
                                onChange={(event) =>
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, { serialNo: event.target.value }),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="os-item-input os-item-input--minutes"
                                disabled={!editable}
                                inputMode="numeric"
                                placeholder="0"
                                title="Tempo previsto em minutos"
                                value={row.timeMinutes ?? ""}
                                onChange={(event) => {
                                  const nextTime = event.target.value.replace(/\D/g, "").slice(0, 4);
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, {
                                      timeMinutes: nextTime,
                                      unitPrice: applyTimePricingToUnitPrice({
                                        timeMinutes: nextTime,
                                        minuteRate: minuteRateValue,
                                        comboUnitPrice: suggestedPriceFor(row.productId, row.serviceId),
                                      }),
                                    }),
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="os-item-input os-item-input--money"
                                disabled={!editable}
                                inputMode="numeric"
                                placeholder="0,00"
                                value={row.unitPrice}
                                onChange={(event) =>
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, {
                                      unitPrice: applyOsMoneyTyping(event.target.value),
                                    }),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="os-item-input os-item-input--money"
                                disabled={!editable}
                                inputMode="numeric"
                                placeholder="0,00"
                                value={row.discountValue}
                                onChange={(event) =>
                                  setItemRows((current) =>
                                    updateServiceOrderItemGridRow(current, row.localId, {
                                      discountValue: applyOsMoneyTyping(event.target.value),
                                    }),
                                  )
                                }
                              />
                            </td>
                            <td>{formatOsMoney(calculateServiceOrderItemSubtotal(row))}</td>
                            <td className="os-add-piece-col">
                              {canMutateItems && row.localId === addPieceRowId ? (
                                <button
                                  aria-label="Adicionar peça"
                                  className="os-add-piece"
                                  disabled={saving || !canAddServiceOrderItemGridRow(itemRows, maxPiecesPerBag)}
                                  onClick={() => {
                                    addPieceRow();
                                  }}
                                  type="button"
                                >
                                  +
                                </button>
                              ) : null}
                            </td>
                            <td>
                              <div className="os-item-actions">
                                {canMutateRow ? (
                                  <button
                                    className="button-ghost"
                                    disabled={saving}
                                    onClick={() => {
                                      setItemRows((current) =>
                                        updateServiceOrderItemGridRow(current, row.localId, { isEditing: true }),
                                      );
                                      focusItemRow(row.localId);
                                    }}
                                    type="button"
                                  >
                                    Editar
                                  </button>
                                ) : null}
                                {canMutateRow ? (
                                  <button
                                    className="button-ghost"
                                    disabled={saving}
                                    onClick={() => setItemRows((current) => removeServiceOrderItemGridRow(current, row.localId))}
                                    type="button"
                                  >
                                    Excluir
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {visibleItemRows.length === 0 ? (
                        <tr>
                          <td colSpan={13}>
                            <div className="empty-state">
                              Nenhuma peça na grade.
                              {canMutateItems ? (
                                <button
                                  aria-label="Adicionar peça"
                                  className="os-add-piece"
                                  disabled={saving || !canAddServiceOrderItemGridRow(itemRows, maxPiecesPerBag)}
                                  onClick={() => {
                                    addPieceRow();
                                  }}
                                  type="button"
                                >
                                  +
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="os-items-footer">
                  {canMutateItems ? (
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={saving || visibleItemRows.length === 0}
                        onClick={() => {
                          void handleCloseBag();
                        }}
                        type="button"
                      >
                        Fechar sacola
                      </button>
                    </div>
                  ) : bagClosed && canReopenSelectedBag ? (
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={saving}
                        onClick={() => {
                          void handleOpenBag();
                        }}
                        type="button"
                      >
                        Abrir sacola
                      </button>
                      <button
                        aria-pressed={wantsNextVersion}
                        className={wantsNextVersion ? "button" : "button-secondary"}
                        disabled={saving}
                        onClick={() => setWantsNextVersion((current) => !current)}
                        type="button"
                      >
                        Abrir nova versão
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                  <strong className="os-labor-total">Total de mão de obra {formatOsMoney(laborTotal)}</strong>
                </div>
              </div>

              <div className="mini-section">
                <h4>Total da ordem de serviço</h4>
                <div className="os-totals-grid">
                  <label className="field">
                    <span>Mão de obra</span>
                    <input disabled value={formatOsMoney(laborTotal)} />
                  </label>
                  <label className="field">
                    <span>Desconto</span>
                    <input disabled value={formatOsMoney(Math.max(laborTotal - Number(selectedOrder?.totalValue ?? laborTotal), 0))} />
                  </label>
                  <label className="field">
                    <span>Valor total</span>
                    <input disabled value={formatOsMoney(Number(selectedOrder?.totalValue ?? laborTotal))} />
                  </label>
                </div>
                {osShowsFaltaPagamento(paymentSummary) ? (
                  <p className="os-rule-banner">Falta pagamento. Isso não muda o status da OS.</p>
                ) : null}
                <div className="os-pay-row">
                  <label className="field">
                    <span>Condição</span>
                    <input
                      disabled
                      value={osOpHeaderTerm({
                        returnKind: selectedOrder?.returnKind,
                        paymentStatus: paymentSummary?.paymentStatus,
                      })}
                    />
                  </label>
                  <label className="field">
                    <span>Já pago</span>
                    <input disabled value={formatOsMoney(Number(paymentSummary?.amountPaid ?? 0))} />
                  </label>
                  <label className="field">
                    <span>Saldo em aberto</span>
                    <input
                      disabled
                      value={formatOsMoney(
                        Number(paymentSummary?.outstandingBalance ?? selectedOrder?.totalValue ?? laborTotal),
                      )}
                    />
                  </label>
                </div>
                {(paymentSummary?.payments ?? []).length > 0 ? (
                  <ul className="os-pay-history">
                    {(paymentSummary?.payments ?? []).map((payment) => (
                      <li key={payment.id}>
                        <span>
                          {osPaymentHistoryLabel(payment)}
                          {formatOsInstant(payment.receivedAt) ? ` · ${formatOsInstant(payment.receivedAt)}` : ""}
                        </span>
                        <strong>{formatOsMoney(Number(payment.paymentAmount))}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="table-subtle">Nenhum pagamento registrado. O Pagar só anota o que já entrou no caixa.</p>
                )}
                {selectedOrder && (canWriteFinance || canRefund) ? (
                  <div className="os-pay-actions">
                    {canWriteFinance && osCanOpenPay({
                      status: selectedOrder.status,
                      paymentStatus: paymentSummary?.paymentStatus ?? selectedOrder.paymentStatus,
                      payLockedOnParent:
                        selectedOrder.payLockedOnParent ?? details?.payLockedOnParent ?? details?.serviceOrder.payLockedOnParent,
                    }) ? (
                      <button
                        className="button"
                        disabled={saving}
                        onClick={() => {
                          void openPay(selectedOrder);
                        }}
                        type="button"
                      >
                        Pagar
                      </button>
                    ) : null}
                    {canRefund && (paymentSummary?.payments ?? []).some((payment) => payment.status === "received" || payment.status === "settled") ? (
                      <button
                        className="button-secondary"
                        disabled={saving}
                        onClick={() => {
                          void openPay(selectedOrder);
                        }}
                        type="button"
                      >
                        Estornar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mini-section">
                <h4>Observação e observação interna</h4>
                <p className="os-rule-banner">
                  A observação sai na OS do cliente. A observação interna não imprime e não vai para a Ordem de Produção.
                </p>
                <div className="os-notes-grid">
                  <label className="field os-note-box">
                    <span>Observação</span>
                    <textarea
                      disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                      rows={5}
                      value={headerForm.customerNotes}
                      onChange={(event) => setHeaderForm((current) => ({ ...current, customerNotes: event.target.value }))}
                    />
                  </label>
                  <label className="field os-note-box os-note-box--internal">
                    <span>Observação interna</span>
                    <textarea
                      disabled={saving || (!showCreateForm && !canEditSelectedOrder)}
                      placeholder="Uso interno, não sai na impressão"
                      rows={5}
                      value={headerForm.commercialNotes}
                      onChange={(event) => setHeaderForm((current) => ({ ...current, commercialNotes: event.target.value }))}
                    />
                  </label>
                </div>
              </div>

              {!showCreateForm && (details?.approval?.method || details?.approval?.signed) ? (
                <div className="mini-section">
                  <h4>Aprovação</h4>
                  <p className="os-rule-banner">
                    {details.approval.releasedWithoutSignature
                      ? "Produção liberada sem assinatura"
                      : approvalMethodLabel(details.approval.method)}
                    {formatOsInstant(details.approval.confirmedAt)
                      ? ` · ${formatOsInstant(details.approval.confirmedAt)}`
                      : ""}
                    {details.approval.acceptedText ? ` · ${details.approval.acceptedText}` : ""}
                    {details.approval.releaseReason ? ` · ${details.approval.releaseReason}` : ""}
                    {details.approval.measurementsLocked ? " · Medida travada" : ""}
                  </p>
                  {approvalPhoto ? <img alt="Foto da OS assinada" className="os-pickup-photo" src={approvalPhoto} /> : null}
                </div>
              ) : null}

              {!showCreateForm && details?.pickup?.method ? (
                <div className="mini-section">
                  <h4>Retirada</h4>
                  <p className="os-rule-banner">
                    {pickupMethodLabel(details.pickup.method)}
                    {details.pickup.confirmedAt ? ` · ${formatDateTime(details.pickup.confirmedAt)}` : ""}
                    {details.pickup.customerPhone ? ` · ${details.pickup.customerPhone}` : ""}
                    {details.pickup.acceptedText ? ` · ${details.pickup.acceptedText}` : ""}
                  </p>
                  {pickupPhoto ? <img alt="Foto da OP assinada" className="os-pickup-photo" src={pickupPhoto} /> : null}
                </div>
              ) : null}

              {!showCreateForm && details?.proofNotes && details.proofNotes.length > 0 ? (
                <div className="mini-section">
                  <h4>Anotações de prova</h4>
                  <p className="os-rule-banner">
                    Histórico da nova medição. Não mistura com Observação nem com Detalhar o serviço.
                  </p>
                  <div className="os-return-items">
                    {details.proofNotes.map((batch) => (
                      <article className="os-proof-history" key={batch.batchId}>
                        <p className="table-subtle">
                          {formatDateTime(batch.createdAt)} · {batch.createdByName}
                        </p>
                        <ul>
                          {batch.items.map((item) => (
                            <li key={`${batch.batchId}-${item.itemId}`}>
                              <strong>
                                S{item.itemNo} · {item.itemType}
                              </strong>
                              {` · ${item.description} · ${item.note}`}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="os-form-footer">
                {message ? (
                  <div className="os-form-footer__notice">
                    <WorkspaceFlash message={message} />
                  </div>
                ) : null}
                {selectedOrder && bagClosed && wantsNextVersion ? (
                  <p className="os-rule-banner os-form-footer__notice">
                    Ao salvar, será gerada a nova versão <strong>{nextVersionNo}</strong>. Ela abre em outra aba. Esta OS imprime a OP.
                  </p>
                ) : null}
                <div className="button-row">
                  {showCreateForm ? (
                    <>
                      <button className="button" disabled={saving || !canWrite} type="submit">
                        {saving ? "Salvando…" : "Salvar"}
                      </button>
                      <button
                        className="button"
                        disabled={saving || !canWrite || visibleItemRows.length === 0}
                        onClick={() => {
                          void handleCloseBag();
                        }}
                        type="button"
                      >
                        Fechar sacola
                      </button>
                      <button className="button-secondary" onClick={() => closeServiceOrderWorkspace()} type="button">
                        Cancelar
                      </button>
                    </>
                  ) : selectedOrder && bagClosed ? (
                    <>
                      <button className="button" disabled={saving || !canWrite} type="submit">
                        {saving ? "Gravando…" : "Gravar"}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={saving || !canWrite}
                        onClick={() => {
                          void handleClosedBagSave("continue");
                        }}
                        type="button"
                      >
                        {saving ? "Gravando…" : "Gravar e Continuar"}
                      </button>
                      {canReopenSelectedBag ? (
                      <button
                        className="button"
                        disabled={saving || !canWrite}
                        onClick={() => {
                          void handleOpenBag();
                        }}
                        type="button"
                      >
                        Abrir sacola
                      </button>
                      ) : null}
                      <button className="button-secondary" onClick={() => closeServiceOrderWorkspace()} type="button">
                        Cancelar
                      </button>
                      {canSendToProof(selectedOrder.status, bagClosed) && canWriteProof ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => {
                            void handleProofAction(selectedOrder, "send_to_proof");
                          }}
                          type="button"
                        >
                          {proofActionLabel("send_to_proof")}
                        </button>
                      ) : null}
                      {canActOnProof(selectedOrder.status) && canWriteProof ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => {
                            void handleProofAction(selectedOrder, "complete_proof");
                          }}
                          type="button"
                        >
                          {proofActionLabel("complete_proof")}
                        </button>
                      ) : null}
                      {canRecordOsApproval(selectedOrder.status) && canWrite ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => openApprovalPanel(selectedOrder)}
                          type="button"
                        >
                          Aprovação
                        </button>
                      ) : null}
                      {selectedOrder.status === "ready_for_pickup" && canWrite ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => openPickupPanel(selectedOrder)}
                          type="button"
                        >
                          Retirada
                        </button>
                      ) : null}
                      {selectedOrder.status === "ready_for_pickup" && canWrite ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => setCounterPickerOpen(true)}
                          type="button"
                        >
                          Refação no balcão
                        </button>
                      ) : null}
                      {selectedOrder.status === "picked_up" && canWrite ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => setReturnPickerOpen(true)}
                          type="button"
                        >
                          Cliente voltou
                        </button>
                      ) : null}
                      <RowOverflowMenu items={buildOsRowMenu(selectedOrder)} label={`Opções da OS ${selectedOrder.orderNo}`} />
                      <OsAnexoButton
                        disabled={Boolean(anexoViewer?.loading)}
                        hasAttachments={Boolean(
                          approvalPhoto || pickupPhoto || details?.approval?.photoAvailable || details?.pickup?.photoAvailable,
                        )}
                        onClick={() => {
                          void openAnexoPanel(selectedOrder);
                        }}
                      />
                    </>
                  ) : selectedOrder ? (
                    <>
                      <button className="button" disabled={saving || !canEditSelectedOrder} type="submit">
                        {saving ? "Salvando…" : "Salvar alterações"}
                      </button>
                      <button
                        className="button"
                        disabled={saving || !canEditSelectedOrder || visibleItemRows.length === 0}
                        onClick={() => {
                          void handleCloseBag();
                        }}
                        type="button"
                      >
                        Fechar sacola
                      </button>
                      <button className="button-secondary" onClick={() => closeServiceOrderWorkspace()} type="button">
                        Cancelar
                      </button>
                      {canRecordOsApproval(selectedOrder.status) && canWrite ? (
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => openApprovalPanel(selectedOrder)}
                          type="button"
                        >
                          Aprovação
                        </button>
                      ) : null}
                      <RowOverflowMenu items={buildOsRowMenu(selectedOrder)} label={`Opções da OS ${selectedOrder.orderNo}`} />
                      <OsAnexoButton
                        disabled={Boolean(anexoViewer?.loading)}
                        hasAttachments={Boolean(
                          approvalPhoto || pickupPhoto || details?.approval?.photoAvailable || details?.pickup?.photoAvailable,
                        )}
                        onClick={() => {
                          void openAnexoPanel(selectedOrder);
                        }}
                      />
                    </>
                  ) : null}
                </div>
                <strong className="os-form-footer__total">{formatOsMoney(Number(selectedOrder?.totalValue ?? laborTotal))}</strong>
              </div>
            </form>
          ) : detailLoading ? null : (
            <div className="empty-state">Abra uma OS na grade ou clique em Nova OS para começar.</div>
          )}
        </article>
        ) : null}
    </>
  );
}

export default ServiceOrdersWorkspace;
