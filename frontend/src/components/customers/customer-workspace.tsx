"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import {
  MasterDataDuplicateGuard,
  normalizeBodyPartCodeValue,
  normalizeCodeValue,
  normalizeDocumentValue,
} from "@/components/ui/master-data-duplicate-guard";
import { DependencyGuardPanel, type DependencyValidationResult } from "@/components/ui/dependency-guard-panel";
import { SmartLookup, type SmartLookupOption } from "@/components/ui/smart-lookup";
import { CustomerListPanel } from "@/components/customers/customer-list-panel";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type CustomerType = "person" | "company";
type CustomerStatus = "active" | "inactive" | "blocked";

type CustomerRecord = {
  id: string;
  customerType: CustomerType;
  legalName: string;
  tradeName: string | null;
  cpfCnpj: string | null;
  email: string | null;
  phone: string;
  birthDate: string | null;
  postalCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  observations: string | null;
  status: CustomerStatus;
  whatsappConsent?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type CustomerContact = {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

type CustomerInteraction = {
  id: string;
  interactionType: string;
  summary: string;
  detail: string | null;
  occurredAt: string;
};

type MeasurementRecord = {
  id: string;
  measurementLabel: string;
  measurementSetId: string;
  measurementData: {
    value?: number;
    unit?: string | null;
    notes?: string | null;
    displayName?: string | null;
    bodyPartId?: string | null;
    unitId?: string | null;
  };
  versionNo: number;
  measuredAt: string;
};

type MeasurementSetItem = {
  id: string;
  bodyPartId: string;
  bodyPartCode: string;
  bodyPartDisplayName: string;
  measurementUnitId: string;
  measurementUnitCode: string;
  measurementUnitDisplayName: string;
  measuredValue: number;
  notes: string | null;
};

type MeasurementSet = {
  id: string;
  customerId: string;
  measurementDate: string;
  notes: string | null;
  createdBy: string;
  versionNo: number;
  items: MeasurementSetItem[];
};

type BodyPartRecord = {
  id: string;
  code: string;
  displayName: string;
  sortOrder: number;
};

type MeasurementUnitRecord = {
  id: string;
  code: string;
  displayName: string;
  sortOrder: number;
};

type MeasurementCatalogResponse = {
  bodyParts: BodyPartRecord[];
  units: MeasurementUnitRecord[];
  defaultUnitCode: string;
  defaultUnitId: string | null;
};

type CustomerProfileResponse = {
  customer: CustomerRecord;
  contacts: CustomerContact[];
  interactions: CustomerInteraction[];
  latestMeasurements: MeasurementRecord[];
};

type MeasurementHistoryResponse = {
  history: MeasurementRecord[];
  latestByLabel: MeasurementRecord[];
  measurementSets: MeasurementSet[];
};

type CustomerFormState = {
  customerType: CustomerType;
  fullName: string;
  tradeName: string;
  mobilePhone: string;
  cpf: string;
  email: string;
  birthDate: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
  observations: string;
  status: CustomerStatus;
  whatsappConsent: boolean;
};

type MeasurementDraft = {
  bodyPartId: string;
  unitId: string;
  value: string;
  notes: string;
};

const defaultCustomerForm = (): CustomerFormState => ({
  customerType: "person",
  fullName: "",
  tradeName: "",
  mobilePhone: "",
  cpf: "",
  email: "",
  birthDate: "",
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
  observations: "",
  status: "active",
  whatsappConsent: false,
});

const EMPTY_CUSTOMER_LIST_QUERY = { q: "", status: "", customerType: "" };

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

function normalizePostalCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

function createMeasurementDraft(defaultUnitId?: string | null): MeasurementDraft {
  return {
    bodyPartId: "",
    unitId: defaultUnitId ?? "",
    value: "",
    notes: "",
  };
}

function formatPhone(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length === 11) {
    return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
  }
  if (value.length === 10) {
    return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  }
  return value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function mapCustomerToForm(customer: CustomerRecord): CustomerFormState {
  return {
    customerType: customer.customerType,
    fullName: customer.legalName,
    tradeName: customer.tradeName ?? "",
    mobilePhone: customer.phone ?? "",
    cpf: customer.cpfCnpj ?? "",
    email: customer.email ?? "",
    birthDate: customer.birthDate ?? "",
    postalCode: customer.postalCode ?? "",
    street: customer.street ?? "",
    number: customer.number ?? "",
    complement: customer.complement ?? "",
    district: customer.district ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    country: customer.country ?? "Brasil",
    observations: customer.observations ?? "",
    status: customer.status,
    whatsappConsent: customer.whatsappConsent === true,
  };
}

function formatCustomerSaveError(error: unknown) {
  const fallback =
    "Não foi possível gravar o cliente. Algum campo do cadastro está faltando ou inválido. Revise nome, contato, endereço e documento e tente de novo.";
  if (!(error instanceof Error)) {
    return fallback;
  }

  const technicalValidationHints = ["property ", "should not exist", "must be a", "must be a string"];
  if (technicalValidationHints.some((hint) => error.message.includes(hint))) {
    return fallback;
  }

  return error.message;
}

export function CustomerWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { hasAnyPermission, apiJson } = useSession();
  const { isMobile } = useWorkspaceViewportMode();
  const canWriteCustomers = hasAnyPermission("customers.write");
  const canReadMeasurements = hasAnyPermission("measurements.read");
  const canWriteMeasurements = hasAnyPermission("measurements.write");
  const focusCustomerId = searchParams.get("focusCustomerId");
  const focusSection = searchParams.get("focusSection");
  const workspaceMode = searchParams.get("workspaceMode");
  const prefillName = searchParams.get("prefillName") ?? "";

  const [listQuery, setListQuery] = useWorkspaceScopedState("customers.listQuery", EMPTY_CUSTOMER_LIST_QUERY);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [activeCustomerId, setActiveCustomerId] = useWorkspaceScopedState<string | null>("customers.activeCustomerId", null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfileResponse | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementHistoryResponse | null>(null);
  const [catalog, setCatalog] = useState<MeasurementCatalogResponse | null>(null);
  const [showCreateForm, setShowCreateForm] = useWorkspaceScopedState("customers.showCreateForm", false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [consentText, setConsentText] = useState("");
  const [savingMeasurements, setSavingMeasurements] = useState(false);
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useWorkspaceScopedState<CustomerFormState>("customers.customerForm", defaultCustomerForm());
  const [customerDuplicateStatus, setCustomerDuplicateStatus] = useState<"idle" | "checking" | "duplicate">("idle");
  const [customerDuplicateMatch, setCustomerDuplicateMatch] = useState<CustomerRecord | null>(null);
  const customerDuplicateCheckRef = useRef(0);
  const [actingCustomerId, setActingCustomerId] = useState<string | null>(null);
  const [measurementForm, setMeasurementForm] = useWorkspaceScopedState("customers.measurementForm", {
    measurementDate: todayIsoDate(),
    notes: "",
    items: [createMeasurementDraft(null)] as MeasurementDraft[],
  });
  const [dependencyValidation, setDependencyValidation] = useState<DependencyValidationResult | null>(null);

  const bodyPartOptions = useMemo(() => catalog?.bodyParts ?? [], [catalog]);
  const unitOptions = useMemo(() => catalog?.units ?? [], [catalog]);
  const bodyPartLookupOptions = useMemo<SmartLookupOption[]>(
    () =>
      bodyPartOptions.map((bodyPart) => ({
        id: bodyPart.id,
        label: bodyPart.displayName,
        hint: bodyPart.code,
      })),
    [bodyPartOptions],
  );
  const unitLookupOptions = useMemo<SmartLookupOption[]>(
    () =>
      unitOptions.map((unit) => ({
        id: unit.id,
        label: unit.code,
        hint: unit.displayName,
      })),
    [unitOptions],
  );

  const resetMeasurementForm = useCallback(
    () =>
      setMeasurementForm({
        measurementDate: todayIsoDate(),
        notes: "",
        items: [createMeasurementDraft(catalog?.defaultUnitId)],
      }),
    [catalog?.defaultUnitId, setMeasurementForm],
  );

  const clearCustomerDuplicate = useCallback(() => {
    customerDuplicateCheckRef.current += 1;
    setCustomerDuplicateStatus("idle");
    setCustomerDuplicateMatch(null);
  }, []);

  const selectedCustomer = profile?.customer ?? null;
  const { closeWorkspace } = useWorkspaceManager();
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: showCreateForm ? "Cliente: Novo" : selectedCustomer ? `Cliente: ${selectedCustomer.legalName}` : "Clientes",
    subtitle: showCreateForm ? "Novo cadastro" : focusSection === "measurements" && selectedCustomer ? "Medidas" : selectedCustomer?.cpfCnpj ?? null,
  });
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusCustomerId);
  const isListWorkspace = !isFormWorkspace;

  const loadCatalog = useCallback(async () => {
    if (!canReadMeasurements) return;
    try {
      const response = await apiJson<MeasurementCatalogResponse>("/measurement-catalog");
      setCatalog(response);
      setMeasurementForm((current) => ({
        ...current,
        items:
          current.items.length > 0
            ? current.items.map((item) => ({ ...item, unitId: item.unitId || response.defaultUnitId || "" }))
            : [createMeasurementDraft(response.defaultUnitId)],
      }));
    } catch (error) {
      setWorkspaceMessage(describeWorkspaceError(error, "O catálogo de medidas não pôde ser carregado."));
    }
  }, [apiJson, canReadMeasurements, setMeasurementForm]);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
      if (listQuery.q.trim()) params.set("q", listQuery.q.trim());
      if (listQuery.status) params.set("status", listQuery.status);
      if (listQuery.customerType) params.set("customerType", listQuery.customerType);
      const suffix = params.toString() ? `?${params}` : "";
      const response = await apiJson<CustomerRecord[]>(`/customers${suffix}`);
      setCustomers(response);
      setWorkspaceMessage(null);
    } catch (error) {
      setWorkspaceMessage(describeWorkspaceError(error, "Os clientes não puderam ser carregados."));
    } finally {
      setLoadingCustomers(false);
    }
  }, [apiJson, listQuery]);

  useCadastroListRefresh("/customers", isListWorkspace, loadCustomers);

  const loadCustomerDetails = useCallback(
    async (customerId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [profileResponse, measurementResponse] = await Promise.all([
          apiJson<CustomerProfileResponse>(`/customers/${customerId}`),
          canReadMeasurements ? apiJson<MeasurementHistoryResponse>(`/customers/${customerId}/measurements`) : Promise.resolve(null),
        ]);

        setProfile(profileResponse);
        setMeasurements(measurementResponse);
        setCustomerForm(mapCustomerToForm(profileResponse.customer));
        setActiveCustomerId(customerId);
        setShowCreateForm(false);
        resetMeasurementForm();
        if (focusCustomerId !== customerId || workspaceMode === "new") {
          const params = new URLSearchParams();
          params.set("focusCustomerId", customerId);
          if (focusSection === "measurements") {
            params.set("focusSection", "measurements");
          }
          navigateWithinWorkspace(`/customers?${params.toString()}`);
        }
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "Não foi possível carregar os dados do cliente.");
      } finally {
        setDetailLoading(false);
      }
    },
    [apiJson, canReadMeasurements, focusCustomerId, focusSection, navigateWithinWorkspace, resetMeasurementForm, setActiveCustomerId, setCustomerForm, setShowCreateForm, workspaceMode],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCatalog();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCatalog]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCustomers();
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadCustomers]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void apiJson<{ consentText: string }>("/whatsapp/consent-text")
        .then((response) => setConsentText(response.consentText))
        .catch(() => setConsentText(""));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [apiJson]);

  useEffect(() => {
    if (!focusCustomerId || focusCustomerId === activeCustomerId || showCreateForm) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadCustomerDetails(focusCustomerId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeCustomerId, focusCustomerId, loadCustomerDetails, showCreateForm]);

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }

    setShowCreateForm(false);
    setActiveCustomerId(null);
    setProfile(null);
    setMeasurements(null);
    setDetailError(null);
  }, [isListWorkspace, setActiveCustomerId, setMeasurements, setProfile, setShowCreateForm]);

  const openCreateCustomerForm = useCallback((prefillName?: string) => {
    setShowCreateForm(true);
    setActiveCustomerId(null);
    setProfile(null);
    setMeasurements(null);
    setCustomerForm({ ...defaultCustomerForm(), fullName: prefillName?.trim() ?? "" });
    clearCustomerDuplicate();
    resetMeasurementForm();
  }, [clearCustomerDuplicate, resetMeasurementForm, setActiveCustomerId, setCustomerForm, setMeasurements, setProfile, setShowCreateForm]);

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      openCreateCustomerForm(prefillName);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [openCreateCustomerForm, prefillName, workspaceMode]);

  const openCreateCustomerWorkspace = useCallback(
    (prefillName?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (prefillName?.trim()) {
        params.set("prefillName", prefillName.trim());
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

  const openCustomerWorkspace = useCallback(
    (customer: CustomerRecord) => {
      const targetPath = `/customers?focusCustomerId=${encodeURIComponent(customer.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }

      openWorkspaceInNewTab(targetPath, `Cliente: ${customer.legalName}`, {
        cloneCurrent: false,
        subtitle: customer.cpfCnpj ?? undefined,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const handleInactivateCustomer = useCallback(
    async (customer: CustomerRecord) => {
      if (customer.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar ${customer.legalName}? O cadastro deixa de aparecer como ativo.`)) {
        return;
      }

      setActingCustomerId(customer.id);
      setWorkspaceMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(
          `/customers/${customer.id}/dependency-check?action=inactivate`,
        );
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setWorkspaceMessage(validation.message);
          return;
        }
        await apiJson<CustomerRecord>(`/customers/${customer.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setWorkspaceMessage(`${customer.legalName} foi inativado.`);
        await loadCustomers();
      } catch (error) {
        setWorkspaceMessage(error instanceof Error ? error.message : "O cliente não pôde ser inativado.");
      } finally {
        setActingCustomerId(null);
      }
    },
    [apiJson, loadCustomers],
  );

  const handleDeleteCustomer = useCallback(
    async (customer: CustomerRecord, options: { skipConfirm?: boolean } = {}) => {
      if (
        !options.skipConfirm &&
        !window.confirm(
          `Excluir ${customer.legalName}? Só é possível se não houver OS, medidas ou financeiro. O cliente some da lista.`,
        )
      ) {
        return false;
      }

      setActingCustomerId(customer.id);
      setWorkspaceMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(
          `/customers/${customer.id}/dependency-check?action=delete`,
        );
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setWorkspaceMessage(validation.message);
          return false;
        }
        await apiJson(`/customers/${customer.id}`, { method: "DELETE" });
        setWorkspaceMessage(`${customer.legalName} foi excluído da lista.`);
        await loadCustomers();
        return true;
      } catch (error) {
        setWorkspaceMessage(error instanceof Error ? error.message : "O cliente não pôde ser excluído.");
        return false;
      } finally {
        setActingCustomerId(null);
      }
    },
    [apiJson, loadCustomers],
  );

  const handleDeleteCustomers = useCallback(
    async (selected: CustomerRecord[]) => {
      if (selected.length === 0) {
        return;
      }
      if (
        !window.confirm(
          `Excluir ${selected.length} cliente(s) selecionado(s)? Só é possível se não houver OS, medidas ou financeiro.`,
        )
      ) {
        return;
      }

      let deleted = 0;
      for (const customer of selected) {
        const ok = await handleDeleteCustomer(customer, { skipConfirm: true });
        if (ok) {
          deleted += 1;
        } else {
          break;
        }
      }
      if (deleted > 1) {
        setWorkspaceMessage(`${deleted} cliente(s) foram excluídos da lista.`);
      }
    },
    [handleDeleteCustomer],
  );

  const closeCustomerWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      setShowCreateForm(false);
      setActiveCustomerId(null);
      setProfile(null);
      setMeasurements(null);
      setDetailError(null);
      navigateWithinWorkspace("/customers");
      return;
    }

    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/customers", "Clientes", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [
    closeWorkspace,
    currentTabId,
    isMobile,
    navigateWithinWorkspace,
    openWorkspaceInNewTab,
    setActiveCustomerId,
    setMeasurements,
    setProfile,
    setShowCreateForm,
  ]);

  useEffect(() => {
    if (focusSection !== "measurements" || selectedCustomer?.id !== focusCustomerId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById("customer-measurements-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusCustomerId, focusSection, selectedCustomer?.id]);

  const handlePostalCodeLookup = useCallback(async () => {
    const postalCode = normalizePostalCode(customerForm.postalCode);
    if (postalCode.length !== 8) {
      return;
    }

    setLookingUpPostalCode(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      if (!response.ok) {
        throw new Error("Não foi possível consultar o CEP.");
      }

      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        complemento?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      if (data.erro) {
        throw new Error("CEP não encontrado.");
      }

      setCustomerForm((current) => ({
        ...current,
        postalCode,
        street: data.logradouro?.trim() || current.street,
        complement: data.complemento?.trim() || current.complement,
        district: data.bairro?.trim() || current.district,
        city: data.localidade?.trim() || current.city,
        state: data.uf?.trim() || current.state,
        country: current.country || "Brasil",
      }));
      setWorkspaceMessage(null);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Não foi possível concluir a consulta do CEP.");
    } finally {
      setLookingUpPostalCode(false);
    }
  }, [customerForm.postalCode, setCustomerForm]);

  const handleCustomerDocumentBlur = useCallback(async () => {
    const normalizedDocument = normalizeDocumentValue(customerForm.cpf);
    const currentCustomerId = showCreateForm ? null : selectedCustomer?.id ?? null;
    if (!normalizedDocument) {
      clearCustomerDuplicate();
      return;
    }

    const requestId = customerDuplicateCheckRef.current + 1;
    customerDuplicateCheckRef.current = requestId;
    setCustomerDuplicateStatus("checking");
    try {
      const response = await apiJson<CustomerRecord[]>(`/customers?q=${encodeURIComponent(normalizedDocument)}`);
      if (customerDuplicateCheckRef.current !== requestId) {
        return;
      }
      const duplicate =
        response.find(
          (customer) => normalizeDocumentValue(customer.cpfCnpj) === normalizedDocument && customer.id !== currentCustomerId,
        ) ?? null;
      setCustomerDuplicateMatch(duplicate);
      setCustomerDuplicateStatus(duplicate ? "duplicate" : "idle");
    } catch (error) {
      if (customerDuplicateCheckRef.current !== requestId) {
        return;
      }
      clearCustomerDuplicate();
      setWorkspaceMessage(error instanceof Error ? error.message : "A validação de duplicidade do cliente não pôde ser concluída.");
    }
  }, [apiJson, clearCustomerDuplicate, customerForm.cpf, selectedCustomer?.id, showCreateForm]);

  function finishCustomerSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/customers",
      openCreate: () => openCreateCustomerWorkspace(),
      navigateToList: () => {
        setShowCreateForm(false);
        setActiveCustomerId(null);
        setProfile(null);
        setMeasurements(null);
        setDetailError(null);
        navigateWithinWorkspace("/customers");
      },
    });
  }

  async function handleCreateCustomer(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (customerDuplicateStatus !== "idle") {
      setWorkspaceMessage("Revise a duplicidade detectada do cliente antes de salvar.");
      return;
    }
    setSavingCustomer(true);
    setWorkspaceMessage(null);
    setDependencyValidation(null);
    try {
      const created = await apiJson<CustomerRecord>("/customers", {
        method: "POST",
        body: JSON.stringify({
          customerType: customerForm.customerType,
          fullName: customerForm.fullName,
          tradeName: customerForm.tradeName || undefined,
          mobilePhone: customerForm.mobilePhone,
          cpf: customerForm.cpf || undefined,
          email: customerForm.email || undefined,
          birthDate: customerForm.birthDate || undefined,
          postalCode: customerForm.postalCode || undefined,
          street: customerForm.street,
          number: customerForm.number,
          complement: customerForm.complement,
          district: customerForm.district,
          city: customerForm.city,
          state: customerForm.state,
          country: customerForm.country,
          observations: customerForm.observations || undefined,
          whatsappConsent: customerForm.whatsappConsent,
        }),
      });
      await loadCustomers();
      setWorkspaceMessage("Cliente gravado.");
      finishCustomerSave(intent);
    } catch (error) {
      setWorkspaceMessage(formatCustomerSaveError(error));
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleUpdateCustomer(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!selectedCustomer) return;
    if (customerDuplicateStatus !== "idle") {
      setWorkspaceMessage("Revise a duplicidade detectada do cliente antes de salvar.");
      return;
    }
    setSavingCustomer(true);
    setWorkspaceMessage(null);
    setDependencyValidation(null);
    try {
      const nextStatus = customerForm.status === "blocked" ? undefined : customerForm.status;
      if (nextStatus === "inactive" && selectedCustomer.status !== "inactive") {
        const validation = await apiJson<DependencyValidationResult>(`/customers/${selectedCustomer.id}/dependency-check?action=inactivate`);
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setWorkspaceMessage(validation.message);
          return;
        }
      }
      await apiJson<CustomerRecord>(`/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerType: customerForm.customerType,
          fullName: customerForm.fullName,
          tradeName: customerForm.tradeName || null,
          mobilePhone: customerForm.mobilePhone,
          cpf: customerForm.cpf || null,
          email: customerForm.email || null,
          birthDate: customerForm.birthDate || null,
          postalCode: customerForm.postalCode || null,
          street: customerForm.street || null,
          number: customerForm.number || null,
          complement: customerForm.complement || null,
          district: customerForm.district || null,
          city: customerForm.city || null,
          state: customerForm.state || null,
          country: customerForm.country || null,
          observations: customerForm.observations || null,
          status: nextStatus,
          whatsappConsent: customerForm.whatsappConsent,
        }),
      });
      await loadCustomers();
      setWorkspaceMessage("Cliente gravado.");
      finishCustomerSave(intent);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Não foi possível atualizar o cliente.");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleCreateMeasurements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setSavingMeasurements(true);
    setWorkspaceMessage(null);
    setDependencyValidation(null);
    try {
      const items = measurementForm.items
        .filter((item) => item.bodyPartId && item.value.trim())
        .map((item) => ({
          bodyPartId: item.bodyPartId,
          unitId: item.unitId || undefined,
          value: Number(item.value),
          notes: item.notes || undefined,
        }));

      if (items.length === 0) {
        throw new Error("Inclua ao menos uma medida válida antes de gravar o conjunto.");
      }

      await apiJson<MeasurementSet>(`/customers/${selectedCustomer.id}/measurements`, {
        method: "POST",
        body: JSON.stringify({
          measurementDate: measurementForm.measurementDate,
          notes: measurementForm.notes || undefined,
          items,
        }),
      });
      setWorkspaceMessage("Conjunto de medidas gravado.");
      resetMeasurementForm();
      await loadCustomerDetails(selectedCustomer.id);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Não foi possível gravar as medidas.");
    } finally {
      setSavingMeasurements(false);
    }
  }

  if (!hasAnyPermission("customers.read")) {
    return (
      <section className="mini-card">
        <h3>Clientes indisponíveis</h3>
        <p>Você não possui acesso ao cadastro de clientes no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Módulo operacional</div>
          <h1 className="title">Cadastro de clientes</h1>
          <p>Cadastre os clientes da conta, pesquise rápido, edite o cadastro completo e mantenha os conjuntos de medidas versionados, com partes do corpo e unidades padronizadas.</p>
        </section>
      ) : null}

      {dependencyValidation && !dependencyValidation.allowed ? <DependencyGuardPanel validation={dependencyValidation} /> : null}

      {workspaceMessage ? <WorkspaceFlash message={workspaceMessage} /> : null}

      {isListWorkspace ? (
        <CustomerListPanel
          actingCustomerId={actingCustomerId}
          canWrite={canWriteCustomers}
          customers={customers}
          loading={loadingCustomers}
          onApplyQuery={(query) => setListQuery(query)}
          onCreate={openCreateCustomerWorkspace}
          onDelete={(row) => {
            const customer = customers.find((item) => item.id === row.id);
            if (customer) void handleDeleteCustomer(customer);
          }}
          onDeleteMany={(rows) => {
            const selected = rows
              .map((row) => customers.find((item) => item.id === row.id))
              .filter((item): item is CustomerRecord => Boolean(item));
            void handleDeleteCustomers(selected);
          }}
          onEdit={(row) => {
            const customer = customers.find((item) => item.id === row.id);
            if (customer) openCustomerWorkspace(customer);
          }}
          onInactivate={(row) => {
            const customer = customers.find((item) => item.id === row.id);
            if (customer) void handleInactivateCustomer(customer);
          }}
          onImported={async (message) => {
            setWorkspaceMessage(message);
            await loadCustomers();
          }}
        />
      ) : null}

        {!isListWorkspace ? (
        <div className="workspace-stack">
          {showCreateForm ? (
            <article className="mini-card cadastro-form">
              <h3>Novo cliente</h3>
              <p className="subtitle">Cadastre o cliente uma única vez na conta e mantenha o endereço completo para o uso do dia a dia.</p>
              <form className="form-grid" onSubmit={handleCreateCustomer}>
                <CustomerFields
                  duplicateGuard={
                    <MasterDataDuplicateGuard
                      entityLabel="cliente"
                      match={
                        customerDuplicateMatch
                          ? {
                              id: customerDuplicateMatch.id,
                              title: customerDuplicateMatch.legalName,
                              subtitle: customerDuplicateMatch.cpfCnpj ?? customerDuplicateMatch.email ?? "Cadastro existente",
                            }
                          : null
                      }
                      onCancel={() => {
                        setCustomerForm((current) => ({ ...current, cpf: "" }));
                        clearCustomerDuplicate();
                      }}
                      onEdit={
                        customerDuplicateMatch
                          ? () => {
                              clearCustomerDuplicate();
                              void loadCustomerDetails(customerDuplicateMatch.id);
                            }
                          : undefined
                      }
                      onView={
                        customerDuplicateMatch
                          ? () => {
                              clearCustomerDuplicate();
                              void loadCustomerDetails(customerDuplicateMatch.id);
                            }
                          : undefined
                      }
                      status={customerDuplicateStatus}
                    />
                  }
                  form={customerForm}
                  lookingUpPostalCode={lookingUpPostalCode}
                  onChange={setCustomerForm}
                  onDocumentBlur={() => void handleCustomerDocumentBlur()}
                  onDocumentChange={() => clearCustomerDuplicate()}
                  onPostalCodeLookup={() => void handlePostalCodeLookup()}
                  showStatus={false}
                  consentText={consentText}
                />
                <div className="button-row">
                  <button className="button" disabled={savingCustomer || customerDuplicateStatus !== "idle"} type="submit">
                    {savingCustomer ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={savingCustomer || customerDuplicateStatus !== "idle"}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleCreateCustomer);
                    }}
                    type="button"
                  >
                    {savingCustomer ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeCustomerWorkspace} type="button">
                    Fechar
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {!showCreateForm ? (
            <article className="mini-card cadastro-form">
              <div className="workspace-toolbar">
                <div className="workspace-toolbar__copy">
                  <h3>Detalhes do cliente</h3>
                  <p>{selectedCustomer ? "Revise o cadastro, o histórico e os conjuntos de medidas." : "Selecione um cliente na grade."}</p>
                </div>
              </div>

              {detailLoading ? <div className="empty-state">Carregando detalhes do cliente…</div> : null}
              {detailError ? <div className="error-banner">{detailError}</div> : null}

              {selectedCustomer ? (
                <div className="detail-stack">
                  <div className="detail-summary">
                    <div>
                      <div className="eyebrow">Cliente</div>
                      <h2>{selectedCustomer.legalName}</h2>
                      <p className="subtitle">{selectedCustomer.tradeName ?? "Visão geral do relacionamento"}</p>
                    </div>
                    <span className={`status-chip status-chip--${selectedCustomer.status}`}>
                      {selectedCustomer.status === "inactive" ? "Inativo" : selectedCustomer.status === "blocked" ? "Bloqueado" : "Ativo"}
                    </span>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-field">
                      <span>Telefone</span>
                      <strong>{formatPhone(selectedCustomer.phone)}</strong>
                    </div>
                    <div className="detail-field">
                      <span>E-mail</span>
                      <strong>{selectedCustomer.email ?? "—"}</strong>
                    </div>
                    <div className="detail-field">
                      <span>Documento</span>
                      <strong>{selectedCustomer.cpfCnpj ?? "—"}</strong>
                    </div>
                    <div className="detail-field">
                      <span>Disponibilidade</span>
                      <strong>Cliente disponível para toda a conta</strong>
                    </div>
                    <div className="detail-field">
                      <span>Endereço</span>
                      <strong>
                         {[selectedCustomer.street, selectedCustomer.number, selectedCustomer.complement, selectedCustomer.district, selectedCustomer.city, selectedCustomer.state, selectedCustomer.country]
                           .filter(Boolean)
                           .join(" · ") || "—"}
                      </strong>
                    </div>
                  </div>

                  {canWriteCustomers ? (
                    <form className="form-grid" onSubmit={handleUpdateCustomer}>
                      <CustomerFields
                        duplicateGuard={
                          <MasterDataDuplicateGuard
                            entityLabel="cliente"
                            match={
                              customerDuplicateMatch
                                ? {
                                    id: customerDuplicateMatch.id,
                                    title: customerDuplicateMatch.legalName,
                                    subtitle: customerDuplicateMatch.cpfCnpj ?? customerDuplicateMatch.email ?? "Cadastro existente",
                                  }
                                : null
                            }
                            onCancel={() => {
                              setCustomerForm((current) => ({ ...current, cpf: selectedCustomer.cpfCnpj ?? "" }));
                              clearCustomerDuplicate();
                            }}
                            onEdit={
                              customerDuplicateMatch
                                ? () => {
                                    clearCustomerDuplicate();
                                    void loadCustomerDetails(customerDuplicateMatch.id);
                                  }
                                : undefined
                            }
                            onView={
                              customerDuplicateMatch
                                ? () => {
                                    clearCustomerDuplicate();
                                    void loadCustomerDetails(customerDuplicateMatch.id);
                                  }
                                : undefined
                            }
                            status={customerDuplicateStatus}
                          />
                        }
                        form={customerForm}
                        lookingUpPostalCode={lookingUpPostalCode}
                        onChange={setCustomerForm}
                        onDocumentBlur={() => void handleCustomerDocumentBlur()}
                        onDocumentChange={() => clearCustomerDuplicate()}
                        onPostalCodeLookup={() => void handlePostalCodeLookup()}
                        showStatus
                        consentText={consentText}
                      />
                      <div className="button-row">
                        <button className="button" disabled={savingCustomer || customerDuplicateStatus !== "idle"} type="submit">
                          {savingCustomer ? "Gravando…" : "Gravar"}
                        </button>
                        <button
                          className="button-secondary"
                          disabled={savingCustomer || customerDuplicateStatus !== "idle"}
                          onClick={(event) => {
                            requestCadastroContinue(event, handleUpdateCustomer);
                          }}
                          type="button"
                        >
                          {savingCustomer ? "Gravando…" : "Gravar e Continuar"}
                        </button>
                        <button className="button-secondary" onClick={closeCustomerWorkspace} type="button">
                          Fechar
                        </button>
                      </div>
                    </form>
                  ) : null}

                  <section className="mini-section" id="customer-measurements-section">
                    <h4>Contatos principais</h4>
                    <ul className="placeholder-list">
                      {(profile?.contacts ?? []).map((contact) => (
                        <li key={contact.id}>
                          <strong>{contact.contactName}</strong> · {contact.email ?? "Sem e-mail"} · {formatPhone(contact.phone)}
                        </li>
                      ))}
                    </ul>
                  </section>

                  {canReadMeasurements ? (
                    <section className="mini-section">
                      <div className="workspace-toolbar">
                        <div className="workspace-toolbar__copy">
                          <h4>Gestão de medidas</h4>
                          <p>Registre conjuntos de medidas com data, observações, partes do corpo padronizadas e a unidade padrão.</p>
                        </div>
                      </div>

                      <div className="measurement-grid">
                        {(measurements?.latestByLabel ?? []).map((measurement) => (
                          <div className="measurement-card" key={measurement.id}>
                            <span>{measurement.measurementData.displayName ?? measurement.measurementLabel}</span>
                            <strong>
                              {String(measurement.measurementData?.value ?? "—")} {measurement.measurementData?.unit ?? ""}
                            </strong>
                            <small>v{measurement.versionNo} · {formatDate(measurement.measuredAt)}</small>
                          </div>
                        ))}
                        {(measurements?.latestByLabel ?? []).length === 0 ? <div className="empty-state">Nenhuma medida registrada ainda.</div> : null}
                      </div>

                      {canWriteMeasurements ? (
                        <form className="form-grid" onSubmit={handleCreateMeasurements}>
                          <div className="filters-grid">
                            <label className="field">
                              <span>Data da medição</span>
                              <input type="date" value={measurementForm.measurementDate} onChange={(event) => setMeasurementForm((current) => ({ ...current, measurementDate: event.target.value }))} />
                            </label>
                            <label className="field">
                              <span>Unidade padrão</span>
                              <input disabled value={catalog?.defaultUnitCode ?? "CM"} />
                            </label>
                          </div>

                          <label className="field">
                            <span>Observações do conjunto</span>
                            <textarea rows={3} value={measurementForm.notes} onChange={(event) => setMeasurementForm((current) => ({ ...current, notes: event.target.value }))} />
                          </label>

                          {measurementForm.items.map((item, index) => (
                            <div className="custom-measurement-row" key={`measurement-item-${index}`}>
                              <div className="field">
                                <SmartLookup
                                  canCreate={canWriteMeasurements}
                                  createLabel="Cadastrar"
                                  entityType="body-parts"
                                  label="Parte do corpo"
                                  options={bodyPartLookupOptions}
                                  value={item.bodyPartId}
                                  onChange={(option) =>
                                    setMeasurementForm((current) => ({
                                      ...current,
                                      items: current.items.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, bodyPartId: option?.id ?? "" } : entry,
                                      ),
                                    }))
                                  }
                                  renderQuickCreate={({ cancelCreate, completeCreate, initialValue }) => (
                                    <MeasurementCatalogQuickCreate
                                      endpoint="/measurement-body-parts"
                                      existingRecords={bodyPartOptions}
                                      initialCode={initialValue.toUpperCase().replace(/\s+/g, "_")}
                                      initialDisplayName={initialValue}
                                      kind="body-part"
                                      onCancel={cancelCreate}
                                      onCreated={async (created) => {
                                        await loadCatalog();
                                        completeCreate({
                                          id: created.id,
                                          label: created.displayName,
                                          hint: created.code,
                                        });
                                      }}
                                      sortOrder={bodyPartOptions.length + 1}
                                    />
                                  )}
                                />
                              </div>
                              <label className="field">
                                <span>Valor</span>
                                <input
                                  inputMode="decimal"
                                  placeholder="86"
                                  required
                                  value={item.value}
                                  onChange={(event) =>
                                    setMeasurementForm((current) => ({
                                      ...current,
                                      items: current.items.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, value: event.target.value } : entry,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                              <div className="field">
                                <SmartLookup
                                  allowClear
                                  canCreate={canWriteMeasurements}
                                  createLabel="Cadastrar"
                                  entityType="measurement-units"
                                  label={`Unidade (padrão ${catalog?.defaultUnitCode ?? "CM"})`}
                                  options={unitLookupOptions}
                                  value={item.unitId}
                                  onChange={(option) =>
                                    setMeasurementForm((current) => ({
                                      ...current,
                                      items: current.items.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, unitId: option?.id ?? "" } : entry,
                                      ),
                                    }))
                                  }
                                  renderQuickCreate={({ cancelCreate, completeCreate, initialValue }) => (
                                    <MeasurementCatalogQuickCreate
                                      endpoint="/measurement-units"
                                      existingRecords={unitOptions}
                                      initialCode={initialValue.toUpperCase()}
                                      initialDisplayName={initialValue}
                                      kind="unit"
                                      onCancel={cancelCreate}
                                      onCreated={async (created) => {
                                        await loadCatalog();
                                        completeCreate({
                                          id: created.id,
                                          label: created.code,
                                          hint: created.displayName,
                                        });
                                      }}
                                      sortOrder={unitOptions.length + 1}
                                    />
                                  )}
                                />
                              </div>
                              <label className="field">
                                <span>Observações</span>
                                <input
                                  placeholder="Observações opcionais"
                                  value={item.notes}
                                  onChange={(event) =>
                                    setMeasurementForm((current) => ({
                                      ...current,
                                      items: current.items.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                              <div className="button-row" style={{ alignItems: "end" }}>
                                <button
                                  className="button-secondary"
                                  onClick={() =>
                                    setMeasurementForm((current) => ({
                                      ...current,
                                      items:
                                        current.items.length === 1
                                          ? [createMeasurementDraft(catalog?.defaultUnitId)]
                                          : current.items.filter((_, entryIndex) => entryIndex !== index),
                                    }))
                                  }
                                  type="button"
                                >
                                  Remover
                                </button>
                              </div>
                            </div>
                          ))}

                          <div className="button-row">
                            <button
                              className="button-secondary"
                              onClick={() =>
                                setMeasurementForm((current) => ({
                                  ...current,
                                  items: [...current.items, createMeasurementDraft(catalog?.defaultUnitId)],
                                }))
                              }
                              type="button"
                            >
                              Adicionar item ao conjunto
                            </button>
                            <button className="button" disabled={savingMeasurements} type="submit">
                              {savingMeasurements ? "Salvando…" : "Registrar conjunto de medidas"}
                            </button>
                          </div>
                        </form>
                      ) : null}

                      <section className="mini-section">
                        <h4>Histórico completo</h4>
                        <ul className="placeholder-list">
                          {(measurements?.measurementSets ?? []).map((set) => (
                            <li key={set.id}>
                              <strong>Versão {set.versionNo}</strong> · {formatDate(set.measurementDate)} · {set.items.map((item) => `${item.bodyPartDisplayName}: ${item.measuredValue} ${item.measurementUnitCode}`).join(" | ")}
                              <div>{set.notes || `Conjunto de medidas ${set.id}`}</div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </section>
                  ) : null}

                  <section className="mini-section">
                    <h4>Últimas interações</h4>
                    <ul className="placeholder-list">
                      {(profile?.interactions ?? []).slice(0, 6).map((interaction) => (
                        <li key={interaction.id}>
                          <strong>{interaction.summary}</strong>
                          <div>{interaction.detail ?? interaction.interactionType}</div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              ) : !detailLoading && !detailError ? (
                <div className="empty-state">Selecione um cliente para abrir o cadastro completo.</div>
              ) : null}
            </article>
          ) : null}
        </div>
        ) : null}
    </>
  );
}

function CustomerFields({
  duplicateGuard,
  form,
  onChange,
  onDocumentBlur,
  onDocumentChange,
  onPostalCodeLookup,
  lookingUpPostalCode,
  showStatus,
  consentText,
}: {
  duplicateGuard?: ReactNode;
  form: CustomerFormState;
  onChange: Dispatch<SetStateAction<CustomerFormState>>;
  onDocumentBlur?: () => void;
  onDocumentChange?: () => void;
  onPostalCodeLookup: () => void;
  lookingUpPostalCode: boolean;
  showStatus: boolean;
  consentText: string;
}) {
  return (
    <>
      <div className="filters-grid">
        <label className="field">
          <span>Tipo de cliente</span>
          <select value={form.customerType} onChange={(event) => onChange((current) => ({ ...current, customerType: event.target.value as CustomerType }))}>
            <option value="person">Pessoa</option>
            <option value="company">Empresa</option>
          </select>
        </label>

        {showStatus ? (
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(event) => onChange((current) => ({ ...current, status: event.target.value as CustomerStatus }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>Nome completo / razão social</span>
          <input required value={form.fullName} onChange={(event) => onChange((current) => ({ ...current, fullName: event.target.value }))} />
        </label>
        <label className="field">
          <span>Nome fantasia</span>
          <input value={form.tradeName} onChange={(event) => onChange((current) => ({ ...current, tradeName: event.target.value }))} />
        </label>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>Celular / WhatsApp</span>
          <input required value={form.mobilePhone} onChange={(event) => onChange((current) => ({ ...current, mobilePhone: event.target.value }))} />
        </label>
        <label className="field">
          <span>{form.customerType === "company" ? "CNPJ" : "CPF"}</span>
          <input
            value={form.cpf}
            onBlur={onDocumentBlur}
            onChange={(event) => {
              onDocumentChange?.();
              onChange((current) => ({ ...current, cpf: event.target.value }));
            }}
          />
        </label>
      </div>
      <label className="field">
        <span>Autoriza aviso por WhatsApp</span>
        <input
          checked={form.whatsappConsent}
          type="checkbox"
          onChange={(event) => onChange((current) => ({ ...current, whatsappConsent: event.target.checked }))}
        />
        {consentText ? <small className="table-subtle">{consentText}</small> : null}
      </label>
      {duplicateGuard}

      <div className="filters-grid">
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={form.email} onChange={(event) => onChange((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label className="field">
          <span>Data de nascimento</span>
          <input type="date" value={form.birthDate} onChange={(event) => onChange((current) => ({ ...current, birthDate: event.target.value }))} />
        </label>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>CEP</span>
          <div className="button-row">
            <input
              required
              value={form.postalCode}
              onBlur={onPostalCodeLookup}
              onChange={(event) => onChange((current) => ({ ...current, postalCode: event.target.value }))}
            />
            <button className="button-secondary" disabled={lookingUpPostalCode} onClick={onPostalCodeLookup} type="button">
              {lookingUpPostalCode ? "Buscando…" : "Buscar CEP"}
            </button>
          </div>
        </label>
        <label className="field">
          <span>Rua</span>
          <input required value={form.street} onChange={(event) => onChange((current) => ({ ...current, street: event.target.value }))} />
        </label>
        <label className="field">
          <span>Número</span>
          <input required value={form.number} onChange={(event) => onChange((current) => ({ ...current, number: event.target.value }))} />
        </label>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>Complemento</span>
          <input value={form.complement} onChange={(event) => onChange((current) => ({ ...current, complement: event.target.value }))} />
        </label>
        <label className="field">
          <span>Bairro</span>
          <input required value={form.district} onChange={(event) => onChange((current) => ({ ...current, district: event.target.value }))} />
        </label>
        <label className="field">
          <span>Cidade</span>
          <input required value={form.city} onChange={(event) => onChange((current) => ({ ...current, city: event.target.value }))} />
        </label>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>Estado</span>
          <input required value={form.state} onChange={(event) => onChange((current) => ({ ...current, state: event.target.value.toUpperCase() }))} />
        </label>
        <label className="field">
          <span>País</span>
          <input required value={form.country} onChange={(event) => onChange((current) => ({ ...current, country: event.target.value }))} />
        </label>
      </div>

      <label className="field">
        <span>Observações</span>
        <textarea rows={4} value={form.observations} onChange={(event) => onChange((current) => ({ ...current, observations: event.target.value }))} />
      </label>
    </>
  );
}

function MeasurementCatalogQuickCreate({
  endpoint,
  existingRecords,
  initialCode,
  initialDisplayName,
  kind,
  sortOrder,
  onCancel,
  onCreated,
}: {
  endpoint: "/measurement-body-parts" | "/measurement-units";
  existingRecords: Array<{ id: string; code: string; displayName: string }>;
  initialCode: string;
  initialDisplayName: string;
  kind: "body-part" | "unit";
  sortOrder: number;
  onCancel: () => void;
  onCreated: (record: { id: string; code: string; displayName: string }) => Promise<void>;
}) {
  const { apiJson } = useSession();
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateStatus, setDuplicateStatus] = useState<"idle" | "checking" | "duplicate">("idle");
  const [duplicateMatch, setDuplicateMatch] = useState<{ id: string; code: string; displayName: string } | null>(null);

  const checkDuplicate = useCallback(() => {
    const duplicate =
      existingRecords.find((record) =>
        kind === "body-part"
          ? normalizeBodyPartCodeValue(record.displayName) === normalizeBodyPartCodeValue(displayName)
          : normalizeCodeValue(record.code) === normalizeCodeValue(code),
      ) ?? null;
    setDuplicateMatch(duplicate);
    setDuplicateStatus(duplicate ? "duplicate" : "idle");
  }, [code, displayName, existingRecords, kind]);

  return (
    <div className="form-grid">
      <h4>Cadastro rápido</h4>
      {kind === "unit" ? (
        <label className="field">
          <span>Código</span>
          <input
            required
            value={code}
            onBlur={checkDuplicate}
            onChange={(event) => {
              setDuplicateStatus("idle");
              setDuplicateMatch(null);
              setCode(event.target.value);
            }}
          />
        </label>
      ) : null}
      <label className="field">
        <span>{kind === "body-part" ? "Parte do corpo" : "Nome exibido"}</span>
        <input
          required
          value={displayName}
          onBlur={checkDuplicate}
          onChange={(event) => {
            setDuplicateStatus("idle");
            setDuplicateMatch(null);
            setDisplayName(event.target.value);
          }}
        />
      </label>
      <MasterDataDuplicateGuard
        entityLabel={kind === "body-part" ? "parte do corpo" : "unidade de medida"}
        match={
          duplicateMatch
            ? {
                id: duplicateMatch.id,
                title: kind === "body-part" ? duplicateMatch.displayName : duplicateMatch.code,
                subtitle: kind === "body-part" ? duplicateMatch.code : duplicateMatch.displayName,
              }
            : null
        }
        onCancel={() => {
          setDuplicateStatus("idle");
          setDuplicateMatch(null);
          if (kind === "body-part") {
            setDisplayName("");
          } else {
            setCode("");
          }
        }}
        status={duplicateStatus}
        variant="warning"
      />
      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      <div className="button-row">
        <button
          className="button"
          disabled={pending || duplicateStatus !== "idle"}
          onClick={async () => {
            if (duplicateStatus !== "idle") {
              setErrorMessage("Revise a duplicidade detectada antes de salvar.");
              return;
            }
            setPending(true);
            setErrorMessage(null);
            try {
              const created = await apiJson<{ id: string; code: string; displayName: string }>(endpoint, {
                method: "POST",
                body: JSON.stringify(
                  kind === "body-part"
                    ? { displayName, sortOrder }
                    : {
                        code,
                        displayName,
                        sortOrder,
                      },
                ),
              });
              await onCreated(created);
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : "O registro não pôde ser criado.");
            } finally {
              setPending(false);
            }
          }}
          type="button"
        >
          {pending ? "Salvando…" : "Salvar e selecionar"}
        </button>
        <button className="button-secondary" onClick={onCancel} type="button">
          Cancelar
        </button>
      </div>
    </div>
  );
}
