"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { finishCadastroSave, requestCadastroContinue, useCadastroListRefresh, type CadastroSaveIntent } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration, useWorkspaceScopedState } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { HoverPeek } from "@/components/ui/hover-peek";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import {
  applyProductPriceFilters,
  buildProductPriceExcelCsv,
  productPriceStatusLabel,
  type ProductPriceRecord,
} from "@/components/catalog/product-price-list";
import { useSession } from "@/components/providers/session-provider";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { SmartLookup } from "@/components/ui/smart-lookup";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";
import { applyOsMoneyTyping, formatOsMoney } from "@/components/service-orders/service-order-workspace-view-model";

type CatalogOption = { id: string; displayName: string; status?: string };

type PriceForm = {
  productId: string;
  serviceId: string;
  serviceName: string;
  suggestedPrice: string;
  estimatedMinutes: string;
};

const emptyForm = (): PriceForm => ({
  productId: "",
  serviceId: "",
  serviceName: "",
  suggestedPrice: "",
  estimatedMinutes: "",
});

export function ProductPricesWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const { hasAnyPermission, apiJson, session } = useSession();
  const pane = useWorkspacePane();
  const { isMobile } = useWorkspaceViewportMode();
  const workspaceMode = searchParams.get("workspaceMode");
  const focusRecordId = searchParams.get("focusRecordId");
  const prefillProductId = searchParams.get("productId") ?? "";
  const canRead = hasAnyPermission("service_orders.read");
  const canWrite = hasAnyPermission("service_orders.write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<ProductPriceRecord[]>([]);
  const [products, setProducts] = useState<CatalogOption[]>([]);
  const [services, setServices] = useState<CatalogOption[]>([]);
  const [form, setForm] = useWorkspaceScopedState<PriceForm>("atelier-catalog.prices.form", emptyForm());
  const { closeWorkspace } = useWorkspaceManager();
  const isFormWorkspace = workspaceMode === "new" || Boolean(focusRecordId);
  const isListWorkspace = !isFormWorkspace;
  const activeRecord = useMemo(
    () => records.find((record) => record.id === focusRecordId) ?? null,
    [focusRecordId, records],
  );
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: workspaceMode === "new" ? "Preço: Novo" : activeRecord ? `Preço: ${activeRecord.productName}` : "Preços",
    subtitle: workspaceMode === "new" ? "Novo cadastro" : activeRecord?.serviceName ?? null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const productOptions = useMemo(
    () => products.filter((item) => item.status !== "inactive").map((item) => ({ id: item.id, label: item.displayName })),
    [products],
  );
  const serviceOptions = useMemo(
    () => services.filter((item) => item.status !== "inactive").map((item) => ({ id: item.id, label: item.displayName })),
    [services],
  );
  const searchOptions = useMemo(
    () => records.map((record) => ({ id: record.id, label: `${record.productName} · ${record.serviceName}` })),
    [records],
  );

  const loadRecords = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [priceResponse, productResponse, serviceResponse] = await Promise.all([
        apiJson<ProductPriceRecord[]>("/product-services"),
        apiJson<CatalogOption[]>("/garment-products"),
        apiJson<CatalogOption[]>("/atelier-services"),
      ]);
      setRecords(Array.isArray(priceResponse) ? priceResponse : []);
      setProducts(productResponse);
      setServices(serviceResponse);
      setMessage(null);
    } catch (error) {
      setRecords([]);
      setMessage(describeWorkspaceError(error, "Os preços não puderam ser carregados."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead]);

  useEffect(() => {
    if (!isActivePane) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadRecords();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isActivePane, loadRecords, session?.tenantId]);

  useCadastroListRefresh("/prices", isListWorkspace, loadRecords);

  const openCreateWorkspace = useCallback(
    (name?: string) => {
      const params = new URLSearchParams();
      params.set("workspaceMode", "new");
      if (name?.trim()) {
        params.set("prefillName", name.trim());
      }
      const targetPath = `/prices?${params.toString()}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, "Preço: Novo", { cloneCurrent: false, subtitle: "Novo cadastro" });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const openEditWorkspace = useCallback(
    (record: ProductPriceRecord) => {
      const targetPath = `/prices?focusRecordId=${encodeURIComponent(record.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Preço: ${record.productName}`, {
        cloneCurrent: false,
        subtitle: record.serviceName,
      });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const closeFormWorkspace = useCallback(() => {
    if (!currentTabId || isMobile) {
      navigateWithinWorkspace("/prices");
      return;
    }
    const closingTabId = currentTabId;
    openWorkspaceInNewTab("/prices", "Preços", { cloneCurrent: false });
    window.setTimeout(() => {
      closeWorkspace(closingTabId);
    }, 0);
  }, [closeWorkspace, currentTabId, isMobile, navigateWithinWorkspace, openWorkspaceInNewTab]);

  function finishPriceSave(intent: CadastroSaveIntent) {
    finishCadastroSave(intent, { currentTabId, isMobile, closeWorkspace }, {
      listPath: "/prices",
      openCreate: () => openCreateWorkspace(),
      navigateToList: () => navigateWithinWorkspace("/prices"),
    });
  }

  useEffect(() => {
    if (workspaceMode !== "new") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setForm({ ...emptyForm(), productId: prefillProductId });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [prefillProductId, setForm, workspaceMode]);

  useEffect(() => {
    if (!focusRecordId || workspaceMode === "new") {
      return;
    }
    const record = records.find((item) => item.id === focusRecordId);
    if (!record) {
      return;
    }
    setForm({
      productId: record.productId,
      serviceId: record.serviceId,
      serviceName: record.serviceName,
      suggestedPrice: record.suggestedPrice.replace(".", ","),
      estimatedMinutes: String(record.estimatedMinutes),
    });
  }, [focusRecordId, records, setForm, workspaceMode]);

  async function handleCreate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    const minutes = Number(form.estimatedMinutes);
    const price = Number(form.suggestedPrice.replace(/\./g, "").replace(",", "."));
    setSaving(true);
    setMessage(null);
    try {
      const created = await apiJson<ProductPriceRecord>("/product-services", {
        method: "POST",
        body: JSON.stringify({
          productId: form.productId,
          serviceId: form.serviceId || undefined,
          serviceName: form.serviceName || undefined,
          suggestedPrice: price,
          estimatedMinutes: minutes,
        }),
      });
      setRecords((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setMessage(`Preço de ${created.productName} + ${created.serviceName} cadastrado.`);
      finishPriceSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O preço não pôde ser cadastrado."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: { preventDefault(): void }, intent: CadastroSaveIntent = "close") {
    event.preventDefault();
    if (!activeRecord) {
      return;
    }
    const minutes = Number(form.estimatedMinutes);
    const price = Number(form.suggestedPrice.replace(/\./g, "").replace(",", "."));
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiJson<ProductPriceRecord>(`/product-services/${activeRecord.id}`, {
        method: "PATCH",
        body: JSON.stringify({ suggestedPrice: price, estimatedMinutes: minutes }),
      });
      setRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("Preço atualizado.");
      finishPriceSave(intent);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O preço não pôde ser atualizado."));
    } finally {
      setSaving(false);
    }
  }

  const handleInactivateRecord = useCallback(
    async (record: ProductPriceRecord) => {
      if (record.status === "inactive") {
        return;
      }
      if (!window.confirm(`Inativar o preço de ${record.productName} + ${record.serviceName}?`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        const updated = await apiJson<ProductPriceRecord>(`/product-services/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        });
        setRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage("Preço inativado.");
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O preço não pôde ser inativado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson],
  );

  const handleDeleteRecord = useCallback(
    async (record: ProductPriceRecord) => {
      if (!window.confirm(`Excluir o preço de ${record.productName} + ${record.serviceName}?`)) {
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson(`/product-services/${record.id}`, { method: "DELETE" });
        setRecords((current) => current.filter((item) => item.id !== record.id));
        setMessage("Preço excluído.");
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O preço não pôde ser excluído."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Preços indisponíveis</h3>
        <p>Você não possui acesso ao catálogo no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {!isListWorkspace ? (
        <section className="hero-card">
          <div className="eyebrow">Cadastros</div>
          <h1 className="title">{workspaceMode === "new" ? "Preço: Novo" : activeRecord ? `${activeRecord.productName} · ${activeRecord.serviceName}` : "Preços"}</h1>
          <p>O preço e o tempo valem para o par produto + serviço. O prazo Normal / Expresso / Urgente não usa este tempo.</p>
        </section>
      ) : null}

      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyProductPriceFilters}
          buildExcelCsv={buildProductPriceExcelCsv}
          canInactivate={(row) => row.status !== "inactive"}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.prices.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "Produto",
              locked: true,
              render: (row) => (
                <HoverPeek text={`${row.productName} · ${row.serviceName}`}>
                  <strong>{row.productName}</strong>
                  <div className="table-subtle">{row.serviceName}</div>
                </HoverPeek>
              ),
            },
            {
              id: "service",
              label: "Serviço",
              render: (row) => <HoverPeek text={row.serviceName}>{row.serviceName}</HoverPeek>,
            },
            { id: "price", label: "Preço", render: (row) => formatOsMoney(Number(row.suggestedPrice)) },
            { id: "minutes", label: "Tempo (min)", render: (row) => String(row.estimatedMinutes) },
            {
              id: "status",
              label: "Status",
              render: (row) => (
                <span className={`status-chip status-chip--${row.status === "inactive" ? "inactive" : "active"}`}>
                  {productPriceStatusLabel(row.status)}
                </span>
              ),
            },
          ]}
          defaultColumnIds={["name", "price", "minutes", "status"]}
          emptyFilters={{ product: "", service: "", status: "" }}
          emptyMessage="Nenhum preço cadastrado para os filtros informados."
          excelFileName="precos-produto-servico.csv"
          filterFields={[
            { id: "product", label: "Produto", lookup: true, placeholder: "Calça, vestido" },
            { id: "service", label: "Serviço", placeholder: "Barra, bainha" },
            {
              id: "status",
              kind: "select",
              label: "Status",
              options: [
                { value: "", label: "Todos" },
                { value: "active", label: "Ativo" },
                { value: "inactive", label: "Inativo" },
              ],
            },
          ]}
          loading={loading}
          onCreate={openCreateWorkspace}
          onDelete={handleDeleteRecord}
          onEdit={openEditWorkspace}
          onInactivate={handleInactivateRecord}
          records={records}
          rowLabel={(row) => `${row.productName} ${row.serviceName}`}
          searchKey="product"
          searchOptions={searchOptions}
          searchPlaceholder="Buscar por produto"
          title="Preços"
        />
      ) : (
        <section className="workspace-stack">
          <article className="mini-card cadastro-form">
            <form className="form-grid" onSubmit={workspaceMode === "new" ? handleCreate : handleUpdate}>
              <h3>{workspaceMode === "new" ? "Novo cadastro" : "Alterar preço"}</h3>
              <SmartLookup
                allowClear={workspaceMode === "new"}
                disabled={workspaceMode !== "new" || saving}
                entityType="products"
                label="Produto"
                onChange={(option) => setForm((current) => ({ ...current, productId: option?.id ?? "" }))}
                options={productOptions}
                placeholder="Calça, vestido"
                required
                searchPlaceholder="Digite o produto"
                value={form.productId}
              />
              <SmartLookup
                allowClear={workspaceMode === "new"}
                canCreate={workspaceMode === "new"}
                createLabel="Usar este nome"
                disabled={workspaceMode !== "new" || saving}
                entityType="services"
                label="Serviço"
                onChange={(option) =>
                  setForm((current) => ({
                    ...current,
                    serviceId: option?.id ?? "",
                    serviceName: option?.label ?? "",
                  }))
                }
                onCreate={(query) => setForm((current) => ({ ...current, serviceId: "", serviceName: query.trim() }))}
                options={serviceOptions}
                placeholder="Barra, bainha"
                required={workspaceMode === "new" && !form.serviceName}
                searchPlaceholder="Digite o serviço"
                value={form.serviceId}
              />
              {workspaceMode === "new" && form.serviceName && !form.serviceId ? (
                <p className="table-subtle">Novo serviço: {form.serviceName}</p>
              ) : null}
              <label className="field">
                <span>Preço sugerido</span>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  required
                  value={form.suggestedPrice}
                  onChange={(event) => setForm((current) => ({ ...current, suggestedPrice: applyOsMoneyTyping(event.target.value) }))}
                />
              </label>
              <label className="field">
                <span>Tempo previsto (minutos)</span>
                <input
                  inputMode="numeric"
                  min={1}
                  placeholder="15"
                  required
                  value={form.estimatedMinutes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, estimatedMinutes: event.target.value.replace(/\D/g, "") }))
                  }
                />
              </label>
              <p className="table-subtle">O tempo é cadastro para o PCP. Não altera Normal, Expresso ou Urgente.</p>
              <div className="button-row">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Gravando…" : "Gravar"}
                </button>
                <button
                  className="button-secondary"
                  disabled={saving}
                  onClick={(event) => {
                    requestCadastroContinue(event, workspaceMode === "new" ? handleCreate : handleUpdate);
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
          </article>
        </section>
      )}
    </>
  );
}
