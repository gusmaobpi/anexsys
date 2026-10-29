function csvCell(value: string) {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const COLLABORATOR_PROFILES = ["tecnico", "qualidade", "gerente", "atendente"] as const;

export type CollaboratorProfile = (typeof COLLABORATOR_PROFILES)[number];

export type CollaboratorRecord = {
  id: string;
  userId: string;
  status: string;
  displayName: string;
  profile: CollaboratorProfile | null;
  dailyRate: number;
  piecesPerDay: number;
};

export const collaboratorProfileLabel: Record<CollaboratorProfile, string> = {
  tecnico: "Técnico",
  qualidade: "Qualidade",
  gerente: "Gerente",
  atendente: "Atendente",
};

export function collaboratorProfileText(profile: CollaboratorProfile | null) {
  return profile ? collaboratorProfileLabel[profile] : "Sem perfil";
}

export function collaboratorStatusLabel(status: string) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export function formatCollaboratorMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function applyCollaboratorFilters(records: CollaboratorRecord[], filters: Record<string, string>) {
  const query = (filters.q ?? "").trim().toLowerCase();
  const profile = (filters.profile ?? "").trim();
  const status = (filters.status ?? "").trim();
  return records.filter((record) => {
    if (query && !record.displayName.toLowerCase().includes(query)) {
      return false;
    }
    if (profile === "none" && record.profile) {
      return false;
    }
    if (profile && profile !== "none" && record.profile !== profile) {
      return false;
    }
    if (status && record.status !== status) {
      return false;
    }
    return true;
  });
}

export function buildCollaboratorExcelCsv(records: CollaboratorRecord[]) {
  const header = ["Pessoa", "Perfil", "Diária", "Peças por dia", "Situação"];
  const rows = records.map((record) => [
    record.displayName,
    collaboratorProfileText(record.profile),
    formatCollaboratorMoney(record.dailyRate),
    String(record.piecesPerDay),
    collaboratorStatusLabel(record.status),
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
