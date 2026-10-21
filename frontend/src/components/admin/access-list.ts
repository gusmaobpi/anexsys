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

export type AccessUserListRecord = {
  id: string;
  email: string;
  displayName: string;
  defaultBranchId: string | null;
  status: "active" | "invited" | "inactive";
  defaultBranchLabel?: string;
  isMaster?: boolean;
};

export function userStatusLabel(status: AccessUserListRecord["status"]) {
  if (status === "inactive") return "Inativo";
  if (status === "invited") return "Convidado";
  return "Ativo";
}

export function applyAccessUserListFilters(
  users: AccessUserListRecord[],
  filters: Record<string, string>,
): AccessUserListRecord[] {
  const nameQuery = (filters.name ?? "").trim().toLowerCase();
  const emailQuery = (filters.email ?? "").trim().toLowerCase();
  const statusQuery = (filters.status ?? "").trim();

  return users.filter((user) => {
    if (nameQuery && !includesNormalized(user.displayName, nameQuery) && !includesNormalized(user.email, nameQuery)) {
      return false;
    }
    if (emailQuery && !includesNormalized(user.email, emailQuery)) {
      return false;
    }
    if (statusQuery && user.status !== statusQuery) {
      return false;
    }
    return true;
  });
}

export function buildAccessUserExcelCsv(users: AccessUserListRecord[]) {
  const header = ["Nome", "E-mail", "Status", "Filial padrão"];
  const rows = users.map((user) => [user.displayName, user.email, userStatusLabel(user.status), user.defaultBranchLabel ?? ""]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}

export function buildAccessUserEmailCsv(users: AccessUserListRecord[]) {
  const header = ["Nome", "E-mail"];
  const rows = users.map((user) => [user.displayName, user.email]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}

export type AccessRoleListRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  status: "active" | "inactive";
  isSystemManaged: boolean;
};

export type AccessPermissionListRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
};

export type AccessCommunityListRecord = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  status: "active" | "inactive";
};

export function accessStatusLabel(status: "active" | "inactive") {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export function applyAccessRoleListFilters(
  roles: AccessRoleListRecord[],
  filters: Record<string, string>,
): AccessRoleListRecord[] {
  const nameQuery = (filters.name ?? "").trim().toLowerCase();
  const codeQuery = (filters.code ?? "").trim().toLowerCase();
  const statusQuery = (filters.status ?? "").trim();
  return roles.filter((role) => {
    if (nameQuery && !includesNormalized(role.displayName, nameQuery) && !includesNormalized(role.code, nameQuery)) {
      return false;
    }
    if (codeQuery && !includesNormalized(role.code, codeQuery)) {
      return false;
    }
    if (statusQuery && role.status !== statusQuery) {
      return false;
    }
    return true;
  });
}

export function applyAccessPermissionListFilters(
  permissions: AccessPermissionListRecord[],
  filters: Record<string, string>,
): AccessPermissionListRecord[] {
  const nameQuery = (filters.name ?? "").trim().toLowerCase();
  const codeQuery = (filters.code ?? "").trim().toLowerCase();
  return permissions.filter((permission) => {
    if (nameQuery && !includesNormalized(permission.displayName, nameQuery) && !includesNormalized(permission.code, nameQuery)) {
      return false;
    }
    if (codeQuery && !includesNormalized(permission.code, codeQuery)) {
      return false;
    }
    return true;
  });
}

export function applyAccessCommunityListFilters(
  communities: AccessCommunityListRecord[],
  filters: Record<string, string>,
): AccessCommunityListRecord[] {
  const nameQuery = (filters.name ?? "").trim().toLowerCase();
  const codeQuery = (filters.code ?? "").trim().toLowerCase();
  const statusQuery = (filters.status ?? "").trim();
  return communities.filter((community) => {
    if (nameQuery && !includesNormalized(community.displayName, nameQuery) && !includesNormalized(community.code, nameQuery)) {
      return false;
    }
    if (codeQuery && !includesNormalized(community.code, codeQuery)) {
      return false;
    }
    if (statusQuery && community.status !== statusQuery) {
      return false;
    }
    return true;
  });
}

export function buildAccessRoleExcelCsv(roles: AccessRoleListRecord[]) {
  const header = ["Nome", "Código", "Status", "Sistema"];
  const rows = roles.map((role) => [
    role.displayName,
    role.code,
    accessStatusLabel(role.status),
    role.isSystemManaged ? "Sim" : "Não",
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}

export function buildAccessPermissionExcelCsv(permissions: AccessPermissionListRecord[]) {
  const header = ["Nome", "Código"];
  const rows = permissions.map((permission) => [permission.displayName, permission.code]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}

export function buildAccessCommunityExcelCsv(communities: AccessCommunityListRecord[]) {
  const header = ["Nome", "Código", "Status"];
  const rows = communities.map((community) => [community.displayName, community.code, accessStatusLabel(community.status)]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
