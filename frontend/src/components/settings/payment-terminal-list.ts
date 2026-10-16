import { paymentProviderLabel } from "@/components/settings/payment-provider-list";

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

export type PaymentTerminalRecord = {
  id: string;
  branchId: string;
  provider: string;
  name: string;
  terminalCode: string;
  isDefault: boolean;
  status: "active" | "inactive";
  createdAt: string;
};

export function paymentTerminalStatusLabel(status: PaymentTerminalRecord["status"]) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export function applyPaymentTerminalFilters(
  records: PaymentTerminalRecord[],
  filters: Record<string, string>,
): PaymentTerminalRecord[] {
  const nameQuery = (filters.q ?? filters.name ?? "").trim();
  const providerQuery = (filters.provider ?? "").trim();
  const statusQuery = (filters.status ?? "").trim();

  return records.filter((record) => {
    if (nameQuery && !includesNormalized(record.name, nameQuery) && !includesNormalized(record.terminalCode, nameQuery)) {
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

export function buildPaymentTerminalExcelCsv(records: PaymentTerminalRecord[]) {
  const header = ["Nome", "Identificação", "Operadora", "Padrão", "Status", "Cadastrado em"];
  const rows = records.map((record) => [
    record.name,
    record.terminalCode,
    paymentProviderLabel(record.provider),
    record.isDefault ? "Sim" : "Não",
    paymentTerminalStatusLabel(record.status),
    record.createdAt ? new Date(record.createdAt).toLocaleDateString("pt-BR") : "",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
