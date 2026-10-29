export type IdleSessionState = {
  status: "loading";
  session: null;
};

export function createIdleSessionState(): IdleSessionState {
  return {
    status: "loading",
    session: null,
  };
}

export function statusFromStoredSession(session: {
  companySelectionRequired?: boolean;
  activeBranchId?: string | null;
}): "company-selection" | "branch-selection" | "authenticated" {
  if (session.companySelectionRequired) {
    return "company-selection";
  }
  if (!session.activeBranchId) {
    return "branch-selection";
  }
  return "authenticated";
}

export type EmpresaOption = {
  id: string;
  legalName: string;
  tradeName: string | null;
  isDefault: boolean;
};

export function isEmpresaActiveForCombo(status?: string | null): boolean {
  return status !== "inactive";
}

export type BranchOption = {
  id: string;
  label: string;
  hint?: string;
  companyId?: string | null;
};

export function empresaLabel(empresa: EmpresaOption): string {
  return empresa.tradeName?.trim() || empresa.legalName;
}

export function resolveActiveEmpresaId(
  empresas: EmpresaOption[],
  branches: BranchOption[],
  activeBranchId: string | null,
  preferredEmpresaId: string | null,
): string | null {
  const knownIds = new Set(empresas.map((empresa) => empresa.id));
  const branchCompanyId = branches.find((branch) => branch.id === activeBranchId)?.companyId ?? null;
  const defaultEmpresaId = empresas.find((empresa) => empresa.isDefault)?.id ?? null;
  const candidates = [preferredEmpresaId, branchCompanyId, defaultEmpresaId, empresas[0]?.id ?? null];

  for (const candidate of candidates) {
    if (candidate && knownIds.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function branchesOfEmpresa(branches: BranchOption[], empresaId: string | null): BranchOption[] {
  if (!empresaId) {
    return branches;
  }

  const matched = branches.filter((branch) => branch.companyId === empresaId);
  if (matched.length === 0 && branches.some((branch) => !branch.companyId)) {
    return branches;
  }

  return matched;
}
