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

export type AtelierCatalogRecord = {
  id: string;
  code: string;
  displayName: string;
  defaultPrice: string | null;
  sortOrder: number;
  status: "active" | "inactive";
  difficultyGrade?: number | null;
  fiscalCode?: string | null;
  nationalNfseCode?: string | null;
  municipalCode?: string | null;
  issRate?: string | null;
  issWithheld?: boolean;
  operationNature?: string | null;
  fiscalDescription?: string | null;
};

export function atelierCatalogStatusLabel(status: AtelierCatalogRecord["status"]) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export function applyAtelierCatalogFilters(
  records: AtelierCatalogRecord[],
  filters: Record<string, string>,
): AtelierCatalogRecord[] {
  const nameQuery = (filters.name ?? "").trim().toLowerCase();
  const codeQuery = (filters.code ?? "").trim().toLowerCase();
  const statusQuery = (filters.status ?? "").trim();

  return records.filter((record) => {
    if (nameQuery && !includesNormalized(record.displayName, nameQuery) && !includesNormalized(record.code, nameQuery)) {
      return false;
    }
    if (codeQuery && !includesNormalized(record.code, codeQuery)) {
      return false;
    }
    if (statusQuery && record.status !== statusQuery) {
      return false;
    }
    return true;
  });
}

export function buildAtelierCatalogExcelCsv(records: AtelierCatalogRecord[], includePrice = false) {
  const header = includePrice ? ["Nome", "Código", "Preço padrão", "Ordem", "Status"] : ["Nome", "Código", "Ordem", "Status"];
  const rows = records.map((record) => {
    const base = [record.displayName, record.code];
    if (includePrice) {
      base.push(record.defaultPrice ?? "");
    }
    return [...base, String(record.sortOrder), atelierCatalogStatusLabel(record.status)];
  });
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
