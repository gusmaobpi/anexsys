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

export type MinuteRateRecord = {
  id: string;
  companyId: string;
  companyName: string;
  valuePerMinute: string;
  status: "active" | "inactive";
  createdAt: string;
};

export function minuteRateStatusLabel(status: MinuteRateRecord["status"]) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export function applyMinuteRateFilters(
  records: MinuteRateRecord[],
  filters: Record<string, string>,
): MinuteRateRecord[] {
  const companyQuery = (filters.q ?? filters.company ?? "").trim();
  const statusQuery = (filters.status ?? "").trim();

  return records.filter((record) => {
    if (companyQuery && !includesNormalized(record.companyName, companyQuery)) {
      return false;
    }
    if (statusQuery && record.status !== statusQuery) {
      return false;
    }
    return true;
  });
}

export function buildMinuteRateExcelCsv(records: MinuteRateRecord[]) {
  const header = ["Empresa", "Valor por minuto", "Status", "Cadastrada em"];
  const rows = records.map((record) => [
    record.companyName,
    record.valuePerMinute,
    minuteRateStatusLabel(record.status),
    record.createdAt ? new Date(record.createdAt).toLocaleDateString("pt-BR") : "",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
