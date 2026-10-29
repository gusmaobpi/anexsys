"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmpresaListPanel } from "@/components/admin/empresa-list-panel";
import { empresaDisplayName, type EmpresaListRecord } from "@/components/admin/empresa-list";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import { DependencyGuardPanel, type DependencyValidationResult } from "@/components/ui/dependency-guard-panel";
import { BrandFrame } from "@/components/ui/brand-frame";
import { WorkspaceFlash } from "@/components/ui/workspace-flash";

type CompanyRecord = {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  email: string | null;
  phone: string | null;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isDefault: boolean;
  status: "active" | "inactive";
  logoMimeType?: string | null;
  logoBase64?: string | null;
};

type CompanyForm = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  email: string;
  phone: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
  logoMimeType: string | null;
  logoBase64: string | null;
};

const emptyForm = (): CompanyForm => ({
  legalName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  municipalRegistration: "",
  email: "",
  phone: "",
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  country: "BR",
  logoMimeType: null,
  logoBase64: null,
});

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string): string {
  const digits = digitsOnly(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPostalCode(value: string): string {
  const digits = digitsOnly(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function formatPhone(value: string): string {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function mapCompanyToForm(company: CompanyRecord): CompanyForm {
  return {
    legalName: company.legalName,
    tradeName: company.tradeName ?? "",
    cnpj: company.cnpj ? formatCnpj(company.cnpj) : "",
    stateRegistration: company.stateRegistration ?? "",
    municipalRegistration: company.municipalRegistration ?? "",
    email: company.email ?? "",
    phone: company.phone ? formatPhone(company.phone) : "",
    postalCode: company.postalCode ? formatPostalCode(company.postalCode) : "",
    street: company.street ?? "",
    number: company.number ?? "",
    complement: company.complement ?? "",
    district: company.district ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    country: company.country ?? "BR",
    logoMimeType: company.logoMimeType ?? null,
    logoBase64: company.logoBase64 ?? null,
  };
}

function toPayload(form: CompanyForm) {
  return {
    legalName: form.legalName,
    tradeName: form.tradeName || null,
    cnpj: form.cnpj || null,
    stateRegistration: form.stateRegistration || null,
    municipalRegistration: form.municipalRegistration || null,
    email: form.email || null,
    phone: form.phone || null,
    postalCode: form.postalCode || null,
    street: form.street || null,
    number: form.number || null,
    complement: form.complement || null,
    district: form.district || null,
    city: form.city || null,
    state: form.state || null,
    country: form.country || "BR",
    logoMimeType: form.logoMimeType,
    logoBase64: form.logoBase64,
  };
}

function describeCompanyError(error: unknown, fallback: string): string {
  if (error instanceof TypeError || (error instanceof Error && /failed to fetch/i.test(error.message))) {
    return "Não foi possível falar com o servidor. Se o site acabou de acordar, aguarde uns segundos e tente de novo.";
  }
  if (error instanceof Error && /tenant context is required|contexto da conta/i.test(error.message)) {
    return "A Conta ativa não chegou no servidor. Saia e entre de novo, ou escolha a Conta no seletor.";
  }
  if (error instanceof Error && /branch code .* already exists|já existe uma filial com o código/i.test(error.message)) {
    return "Não foi possível criar a Filial filha padrão (Matriz) desta Empresa. A Empresa é o pai; a Matriz é a primeira Filial. Puxe o código, rode npm run migration:run e reinicie o backend.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function EmpresasWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { isMobile } = useWorkspaceViewportMode();
  const { hasAnyPermission, apiJson, status, reloadEmpresas, selectEmpresa } = useSession();
  const canRead = hasAnyPermission("companies.read");
  const canWrite = hasAnyPermission("companies.write");
  const workspaceMode = searchParams.get("workspaceMode");
  const focusCompanyId = searchParams.get("focusCompanyId");
  const prefillName = searchParams.get("prefillName") ?? "";
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dependencyValidation, setDependencyValidation] = useState<DependencyValidationResult | null>(null);
  const [actingEmpresaId, setActingEmpresaId] = useState<string | null>(null);
  const [activeId, setActiveId] = useWorkspaceScopedState<string | null>("empresas.activeId", null);
  const [showCreate, setShowCreate] = useWorkspaceScopedState("empresas.showCreate", false);
  const [form, setForm] = useWorkspaceScopedState<CompanyForm>("empresas.form", emptyForm());
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusCompanyId);
  const isListWorkspace = !isFormWorkspace;

  const active = useMemo(() => companies.find((company) => company.id === activeId) ?? null, [activeId, companies]);
  const { closeWorkspace } = useWorkspaceManager();
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: showCreate ? "Empresa: Nova" : active ? `Empresa: ${empresaDisplayName(active)}` : "Empresas",
    subtitle: showCreate ? "Novo cadastro" : active?.cnpj ? formatCnpj(active.cnpj) : null,
  });

  const loadCompanies = useCallback(async () => {
    if (status !== "authenticated" || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await apiJson<CompanyRecord[]>("/companies");
      setCompanies(records.map((company) => ({ ...company, status: company.status === "inactive" ? "inactive" : "active" })));
      setMessage(null);
    } catch (error) {
      setMessage(describeCompanyError(error, "As empresas não puderam ser carregadas."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead, status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCompanies();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCompanies]);

  useCadastroListRefresh("/admin/companies", isListWorkspace, loadCompanies);

  const openCreateForm = useCallback(
    (name?: string) => {
      setShowCreate(true);
      setActiveId(null);
      setForm({ ...emptyForm(), legalName: name?.trim() ?? "", tradeName: name?.trim() ?? "" });
    },
    [setActiveId, setForm, setShowCreate],
  );

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `/admin/companies?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Empresa: Nova", { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (company: EmpresaListRecord) => {
      const targetPath = `/admin/companies?focusCompanyId=${encodeURIComponent(company.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Empresa: ${empresaDisplayName(company)}`, {
        cloneCurrent: false,
        subtitle: company.cnpj ? formatCnpj(company.cnpj) : undefined,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/admin/companies");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/admin/companies", "Empresas", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishEmpresaSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/admin/companies",
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace("/admin/companies"),
    });
  }

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      openCreateForm(prefillName);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [openCreateForm, prefillName, workspaceMode]);

  useEffect(() => {
    if (!focusCompanyId || workspaceMode === "new") {
      return;
    }
    const company = companies.find((item) => item.id === focusCompanyId);
    if (!company) {
      return;
    }
    setShowCreate(false);
    setActiveId(company.id);
    setForm(mapCompanyToForm(company));
  }, [companies, focusCompanyId, setActiveId, setForm, setShowCreate, workspaceMode]);

  useEffect(() => {
    if (!isListWorkspace) {
      return;
    }
    setShowCreate(false);
    setActiveId(null);
  }, [isListWorkspace, setActiveId, setShowCreate]);

  const handlePostalCodeLookup = useCallback(async () => {
    const postalCode = digitsOnly(form.postalCode);
    if (postalCode.length !== 8) {
      setMessage("Informe um CEP com 8 dígitos para buscar o endereço.");
      return;
    }

    setLookingUpPostalCode(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        setMessage("CEP não encontrado. Preencha o endereço fiscal manualmente.");
        return;
      }
      setForm((current) => ({
        ...current,
        postalCode: formatPostalCode(postalCode),
        street: data.logradouro?.trim() || current.street,
        district: data.bairro?.trim() || current.district,
        city: data.localidade?.trim() || current.city,
        state: data.uf?.trim().toUpperCase() || current.state,
        country: current.country || "BR",
      }));
      setMessage(null);
    } catch {
      setMessage("Não foi possível buscar o CEP. Preencha o endereço fiscal manualmente.");
    } finally {
      setLookingUpPostalCode(false);
    }
  }, [form.postalCode, setForm]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<CompanyRecord>("/companies", {
        method: "POST",
        body: JSON.stringify(toPayload(form)),
      });
      setCompanies((current) => [
        ...current,
        { ...created, status: created.status === "inactive" ? "inactive" : "active" },
      ]);
      await reloadEmpresas(created.id);
      await selectEmpresa(created.id);
      setMessage("Empresa criada. A Filial filha padrão (Matriz) nasceu junto. Ela já está no contexto ativo.");
      finishEmpresaSave(intent);
    } catch (error) {
      setMessage(describeCompanyError(error, "A empresa não pôde ser criada."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!canWrite || !active) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<CompanyRecord>(`/companies/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify(toPayload(form)),
      });
      const normalized = { ...updated, status: updated.status === "inactive" ? "inactive" : "active" } as CompanyRecord;
      setCompanies((current) => current.map((company) => (company.id === normalized.id ? normalized : company)));
      setForm(mapCompanyToForm(normalized));
      await reloadEmpresas(normalized.id);
      setMessage("Empresa atualizada.");
      finishEmpresaSave(intent);
    } catch (error) {
      setMessage(describeCompanyError(error, "A empresa não pôde ser atualizada."));
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateEmpresa = useCallback(
    async (empresa: EmpresaListRecord) => {
      if (empresa.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar ${empresaDisplayName(empresa)}? Ela some do combo, mas continua na lista.`)) {
        return;
      }

      setActingEmpresaId(empresa.id);
      setMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(
          `/companies/${empresa.id}/dependency-check?action=inactivate`,
        );
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return;
        }
        await apiJson<CompanyRecord>(`/companies/${empresa.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setMessage(`${empresaDisplayName(empresa)} foi inativada.`);
        await loadCompanies();
        await reloadEmpresas();
      } catch (error) {
        setMessage(describeCompanyError(error, "A empresa não pôde ser inativada."));
      } finally {
        setActingEmpresaId(null);
      }
    },
    [apiJson, loadCompanies, reloadEmpresas],
  );

  const handleDeleteEmpresa = useCallback(
    async (empresa: EmpresaListRecord, options: { skipConfirm?: boolean } = {}) => {
      if (
        !options.skipConfirm &&
        !window.confirm(
          `Excluir ${empresaDisplayName(empresa)}? Só é possível se não houver OS ou financeiro nas Filiais filhas. A Empresa some da lista.`,
        )
      ) {
        return false;
      }

      setActingEmpresaId(empresa.id);
      setMessage(null);
      setDependencyValidation(null);
      try {
        const validation = await apiJson<DependencyValidationResult>(
          `/companies/${empresa.id}/dependency-check?action=delete`,
        );
        if (!validation.allowed) {
          setDependencyValidation(validation);
          setMessage(validation.message);
          return false;
        }
        await apiJson(`/companies/${empresa.id}`, { method: "DELETE" });
        setMessage(`${empresaDisplayName(empresa)} foi excluída da lista.`);
        await loadCompanies();
        await reloadEmpresas();
        return true;
      } catch (error) {
        setMessage(describeCompanyError(error, "A empresa não pôde ser excluída."));
        return false;
      } finally {
        setActingEmpresaId(null);
      }
    },
    [apiJson, loadCompanies, reloadEmpresas],
  );

  const handleDeleteEmpresas = useCallback(
    async (selected: EmpresaListRecord[]) => {
      if (selected.length === 0) {
        return;
      }
      if (
        !window.confirm(
          `Excluir ${selected.length} empresa(s) selecionada(s)? Só é possível se não houver OS ou financeiro nas Filiais filhas.`,
        )
      ) {
        return;
      }

      let deleted = 0;
      for (const empresa of selected) {
        const ok = await handleDeleteEmpresa(empresa, { skipConfirm: true });
        if (ok) {
          deleted += 1;
        } else {
          break;
        }
      }
      if (deleted > 1) {
        setMessage(`${deleted} empresa(s) foram excluídas da lista.`);
      }
    },
    [handleDeleteEmpresa],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Empresas indisponíveis</h3>
        <p>Você não possui acesso ao cadastro de empresas no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Administração</div>
          <h1 className="title">{showCreate ? "Nova empresa" : active ? empresaDisplayName(active) : "Empresa"}</h1>
          <p>
            A Empresa é o pai: o CNPJ dentro da Conta. As Filiais são os filhos. Ao criar a Empresa, o sistema já cria a
            primeira Filial filha, a Matriz — você não cadastra a Matriz como se fosse outra Empresa. Outras lojas ou
            ateliês físicos nascem depois em Administração → Filiais, sempre debaixo desta Empresa. Clientes e medidas
            são da Conta e valem para todas as Empresas.
          </p>
        </section>
      ) : null}

      {dependencyValidation && !dependencyValidation.allowed ? <DependencyGuardPanel validation={dependencyValidation} /> : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <EmpresaListPanel
          actingEmpresaId={actingEmpresaId}
          canWrite={canWrite}
          empresas={companies}
          loading={loading}
          onCreate={openCreateWorkspace}
          onDelete={(empresa) => {
            void handleDeleteEmpresa(empresa);
          }}
          onDeleteMany={(selected) => {
            void handleDeleteEmpresas(selected);
          }}
          onEdit={openEditWorkspace}
          onInactivate={(empresa) => {
            void handleInactivateEmpresa(empresa);
          }}
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            {showCreate ? (
              <form className="form-grid" onSubmit={handleCreate}>
                <h3>Nova empresa</h3>
                <p className="table-subtle">
                  Este cadastro é o pai (CNPJ). A primeira Filial filha, a Matriz, nasce automaticamente ao salvar.
                </p>
                <CompanyFields
                  form={form}
                  lookingUpPostalCode={lookingUpPostalCode}
                  onPostalCodeLookup={() => void handlePostalCodeLookup()}
                  setForm={setForm}
                />
                <div className="button-row">
                  <button className="button" disabled={saving} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleCreate);
                    }}
                    type="button"
                  >
                    {saving ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : active ? (
              <form className="form-grid" onSubmit={handleUpdate}>
                <h3>{empresaDisplayName(active)}</h3>
                <CompanyFields
                  form={form}
                  lookingUpPostalCode={lookingUpPostalCode}
                  onPostalCodeLookup={() => void handlePostalCodeLookup()}
                  setForm={setForm}
                />
                <div className="button-row">
                  <button className="button" disabled={saving || !canWrite} type="submit">
                    {saving ? "Gravando…" : "Gravar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={saving || !canWrite}
                    onClick={(event) => {
                      requestCadastroContinue(event, handleUpdate);
                    }}
                    type="button"
                  >
                    {saving ? "Gravando…" : "Gravar e Continuar"}
                  </button>
                  <button className="button-secondary" onClick={closeFormWorkspace} type="button">
                    Voltar para a lista
                  </button>
                </div>
              </form>
            ) : (
              <div className="empty-state">{loading ? "Carregando…" : "Empresa não encontrada."}</div>
            )}
          </article>
        </section>
      )}
    </>
  );
}

function CompanyFields({
  form,
  lookingUpPostalCode,
  onPostalCodeLookup,
  setForm,
}: {
  form: CompanyForm;
  lookingUpPostalCode: boolean;
  onPostalCodeLookup: () => void;
  setForm: (value: CompanyForm | ((current: CompanyForm) => CompanyForm)) => void;
}) {
  return (
    <>
      <BrandFrame
        hint="Este quadro é o mesmo do formulário que o cliente abre no celular."
        image={form.logoBase64 && form.logoMimeType ? { mimeType: form.logoMimeType, contentBase64: form.logoBase64 } : null}
        kind="logo"
        label="Logomarca"
        onChange={(image) =>
          setForm((current) => ({
            ...current,
            logoMimeType: image?.mimeType ?? null,
            logoBase64: image?.contentBase64 ?? null,
          }))
        }
      />
      <div className="form-section-title">Identificação</div>
      <div className="filters-grid">
        <label className="field">
          <span>Razão social</span>
          <input required value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} />
        </label>
        <label className="field">
          <span>Nome fantasia</span>
          <input value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} />
        </label>
        <label className="field">
          <span>CNPJ</span>
          <input
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            required
            value={form.cnpj}
            onChange={(event) => setForm({ ...form, cnpj: formatCnpj(event.target.value) })}
          />
        </label>
      </div>

      <div className="form-section-title">Inscrições</div>
      <div className="filters-grid">
        <label className="field">
          <span>Inscrição estadual</span>
          <input value={form.stateRegistration} onChange={(event) => setForm({ ...form, stateRegistration: event.target.value })} />
        </label>
        <label className="field">
          <span>Inscrição municipal</span>
          <input
            value={form.municipalRegistration}
            onChange={(event) => setForm({ ...form, municipalRegistration: event.target.value })}
          />
        </label>
      </div>

      <div className="form-section-title">Contato</div>
      <div className="filters-grid">
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label className="field">
          <span>Telefone</span>
          <input
            inputMode="tel"
            placeholder="(11) 99999-9999"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })}
          />
        </label>
      </div>

      <div className="form-section-title">Endereço fiscal</div>
      <div className="filters-grid">
        <label className="field">
          <span>CEP</span>
          <div className="button-row">
            <input
              inputMode="numeric"
              placeholder="00000-000"
              required
              value={form.postalCode}
              onBlur={onPostalCodeLookup}
              onChange={(event) => setForm({ ...form, postalCode: formatPostalCode(event.target.value) })}
            />
            <button className="button-secondary" disabled={lookingUpPostalCode} onClick={onPostalCodeLookup} type="button">
              {lookingUpPostalCode ? "Buscando…" : "Buscar CEP"}
            </button>
          </div>
        </label>
        <label className="field">
          <span>Logradouro</span>
          <input required value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} />
        </label>
        <label className="field">
          <span>Número</span>
          <input required value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
        </label>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>Complemento</span>
          <input value={form.complement} onChange={(event) => setForm({ ...form, complement: event.target.value })} />
        </label>
        <label className="field">
          <span>Bairro</span>
          <input required value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} />
        </label>
        <label className="field">
          <span>Cidade</span>
          <input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        </label>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>UF</span>
          <input
            maxLength={2}
            required
            value={form.state}
            onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase().slice(0, 2) })}
          />
        </label>
        <label className="field">
          <span>País</span>
          <input required value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
        </label>
      </div>
    </>
  );
}
