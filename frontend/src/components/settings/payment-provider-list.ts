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

export type PaymentProviderConfigRecord = {
  id: string;
  companyId: string;
  companyName: string;
  provider: string;
  environment: string;
  credentials: Record<string, string>;
  status: "active" | "inactive";
  createdAt: string;
};

export const PAYMENT_PROVIDER_OPTIONS = [
  { value: "cielo", label: "Cielo" },
  { value: "stone", label: "Stone" },
  { value: "pagbank", label: "PagBank" },
] as const;

export const PAYMENT_PROVIDER_ENVIRONMENT_OPTIONS = [
  { value: "sandbox", label: "Sandbox (teste)" },
  { value: "production", label: "Produção" },
] as const;

export function paymentProviderLabel(provider: string) {
  return PAYMENT_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

export function paymentProviderEnvironmentLabel(environment: string) {
  return environment === "production" ? "Produção" : "Sandbox";
}

export function paymentProviderConfigStatusLabel(status: PaymentProviderConfigRecord["status"]) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export function applyPaymentProviderConfigFilters(
  records: PaymentProviderConfigRecord[],
  filters: Record<string, string>,
): PaymentProviderConfigRecord[] {
  const companyQuery = (filters.q ?? filters.company ?? "").trim();
  const providerQuery = (filters.provider ?? "").trim();
  const statusQuery = (filters.status ?? "").trim();

  return records.filter((record) => {
    if (companyQuery && !includesNormalized(record.companyName, companyQuery)) {
      return false;
    }
    if (providerQuery && record.provider !== providerQuery) {
      return false;
    }
    if (statusQuery && record.status !== statusQuery) {
      return false;
    }
    return true;
  });
}

export function buildPaymentProviderConfigExcelCsv(records: PaymentProviderConfigRecord[]) {
  const header = ["Empresa", "Operadora", "Ambiente", "Status", "Cadastrada em"];
  const rows = records.map((record) => [
    record.companyName,
    paymentProviderLabel(record.provider),
    paymentProviderEnvironmentLabel(record.environment),
    paymentProviderConfigStatusLabel(record.status),
    record.createdAt ? new Date(record.createdAt).toLocaleDateString("pt-BR") : "",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
