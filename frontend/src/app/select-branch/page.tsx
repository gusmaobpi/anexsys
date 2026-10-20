"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { branchesOfEmpresa, empresaLabel } from "@/components/providers/session-context";
import { useSession } from "@/components/providers/session-provider";
import { consumeFloorReturn } from "@/components/production/floor-return";

export default function SelectBranchPage() {
  const router = useRouter();
  const { status, session, selectCompany, selectEmpresa, selectBranch } = useSession();
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && session?.activeBranchId) {
      router.replace(consumeFloorReturn() ?? "/dashboard");
    }
  }, [router, session?.activeBranchId, status]);

  if (!session) {
    return <div className="loading-state">Loading your company and filial…</div>;
  }

  const activeConta = session.companies.find((company) => company.tenantId === session.tenantId) ?? null;
  const activeEmpresa = (session.empresas ?? []).find((empresa) => empresa.id === session.activeEmpresaId) ?? null;
  const visibleBranches = branchesOfEmpresa(session.branches, session.activeEmpresaId);
  const needsCompanySelection = session.companySelectionRequired;
  const branchTitle = activeEmpresa
    ? `Selecione a filial de ${empresaLabel(activeEmpresa)}`
    : activeConta
      ? `Selecione a filial da Conta ${activeConta.displayName}`
      : "Selecione a filial ativa";
  const busy = pendingCompanyId !== null || pendingBranchId !== null;

  return (
    <div className="screen-shell">
      <section className="content-card" style={{ maxWidth: 920 }}>
        <div className="content-card__header">
          <div className="eyebrow">ANEXSYS</div>
          <h1 className="title">Conta, Empresa e Filial</h1>
          <p className="subtitle">A Conta isola o ateliê. A Empresa é o CNPJ. A Filial é o ponto físico. Confirmamos o último contexto válido quando dá.</p>
        </div>

        <div className="content-card__body" style={{ display: "grid", gap: 32 }}>
          {session.companies.length > 1 ? (
            <section>
              <div className="eyebrow">Conta</div>
              <h2 style={{ marginTop: 12 }}>{needsCompanySelection ? "Selecione a Conta ativa" : activeConta?.displayName ?? "Trocar Conta"}</h2>
              <div className="branch-grid" style={{ marginTop: 20 }}>
                {session.companies.map((company) => (
                  <button
                    className="branch-card"
                    disabled={busy}
                    key={company.tenantId}
                    onClick={async () => {
                      setPendingCompanyId(company.tenantId);
                      try {
                        const resolved = await selectCompany(company.tenantId);
                        if (resolved) {
                          router.push(consumeFloorReturn() ?? "/dashboard");
                        }
                      } finally {
                        setPendingCompanyId(null);
                      }
                    }}
                    type="button"
                  >
                    <div className="eyebrow">Conta</div>
                    <h2 style={{ marginTop: 12 }}>{company.displayName}</h2>
                    <p className="branch-card__meta">{pendingCompanyId === company.tenantId ? "Trocando…" : "Abrir Conta"}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!needsCompanySelection && (session.empresas?.length ?? 0) > 1 ? (
            <section>
              <div className="eyebrow">Empresa</div>
              <h2 style={{ marginTop: 12 }}>{activeEmpresa ? empresaLabel(activeEmpresa) : "Selecione a Empresa"}</h2>
              <div className="branch-grid" style={{ marginTop: 20 }}>
                {session.empresas.map((empresa) => (
                  <button
                    className="branch-card"
                    disabled={busy}
                    key={empresa.id}
                    onClick={async () => {
                      setPendingCompanyId(empresa.id);
                      try {
                        await selectEmpresa(empresa.id);
                      } finally {
                        setPendingCompanyId(null);
                      }
                    }}
                    type="button"
                  >
                    <div className="eyebrow">Empresa</div>
                    <h2 style={{ marginTop: 12 }}>{empresaLabel(empresa)}</h2>
                    <p className="branch-card__meta">{pendingCompanyId === empresa.id ? "Trocando…" : "Usar esta Empresa"}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!needsCompanySelection ? (
            <section>
              <div className="eyebrow">Filial</div>
              <h2 style={{ marginTop: 12 }}>{branchTitle}</h2>
              {visibleBranches.length > 0 ? (
                <div className="branch-grid" style={{ marginTop: 20 }}>
                  {visibleBranches.map((branch) => (
                    <button
                      className="branch-card"
                      disabled={busy}
                      key={branch.id}
                      onClick={async () => {
                        setPendingBranchId(branch.id);
                        try {
                          if (await selectBranch(branch.id)) {
                            router.push(consumeFloorReturn() ?? "/dashboard");
                          }
                        } finally {
                          setPendingBranchId(null);
                        }
                      }}
                      type="button"
                    >
                      <div className="eyebrow">Filial</div>
                      <h2 style={{ marginTop: 12 }}>{branch.label}</h2>
                      <p className="branch-card__meta">{pendingBranchId === branch.id ? "Applying context…" : branch.hint ?? "Abrir filial"}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mini-card" style={{ marginTop: 20 }}>
                  <p>Esta Empresa ainda não tem Filial. Troque a Empresa ou cadastre a Filial em Administração → Filiais.</p>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
