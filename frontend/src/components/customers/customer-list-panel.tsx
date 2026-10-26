"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyCustomerListFilters,
  buildCustomerEmailCsv,
  buildCustomerExcelCsv,
  buildPaginationItems,
  CUSTOMER_LIST_COLUMNS,
  CUSTOMER_LIST_PAGE_SIZES,
  customerListStatusLabel,
  customerListTypeLabel,
  DEFAULT_CUSTOMER_LIST_COLUMN_IDS,
  downloadTextFile,
  emptyCustomerListFilters,
  formatCustomerListDateTime,
  formatCustomerListPhone,
  normalizeCustomerListColumnIds,
  paginateCustomerList,
  type CustomerListColumnId,
  type CustomerListFilters,
  type CustomerListRecord,
} from "@/components/customers/customer-list";
import { useImportCadastros } from "@/components/integration/import-cadastros-menu";
import { SearchAutocomplete } from "@/components/ui/search-autocomplete";
import type { SmartLookupOption } from "@/components/ui/lookup-suggestions";

const COLUMN_STORAGE_KEY = "anexsys.frontend.customers.grid-columns.v1";

function FilterToggleIcon({ open }: Readonly<{ open: boolean }>) {
  return (
    <svg aria-hidden="true" height="22" viewBox="0 0 24 24" width="22">
      <circle cx="10" cy="10" fill="none" r="6.25" stroke="currentColor" strokeWidth="2" />
      <path d="M14.8 14.8 L20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M7 10 H13" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      {open ? null : <path d="M10 7 V13" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />}
    </svg>
  );
}

function readStoredColumnIds(): CustomerListColumnId[] {
  if (typeof window === "undefined") {
    return [...DEFAULT_CUSTOMER_LIST_COLUMN_IDS];
  }
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_CUSTOMER_LIST_COLUMN_IDS];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? normalizeCustomerListColumnIds(parsed.map(String)) : [...DEFAULT_CUSTOMER_LIST_COLUMN_IDS];
  } catch {
    return [...DEFAULT_CUSTOMER_LIST_COLUMN_IDS];
  }
}

type CustomerListPanelProps = {
  customers: CustomerListRecord[];
  loading: boolean;
  canWrite: boolean;
  actingCustomerId: string | null;
  onApplyQuery: (query: { q: string; status: string; customerType: string }) => void;
  onCreate: (prefillName?: string) => void;
  onEdit: (customer: CustomerListRecord) => void;
  onDelete: (customer: CustomerListRecord) => void;
  onDeleteMany: (customers: CustomerListRecord[]) => void;
  onInactivate: (customer: CustomerListRecord) => void;
  onImported?: (message: string) => void | Promise<void>;
};

export function CustomerListPanel({
  customers,
  loading,
  canWrite,
  actingCustomerId,
  onApplyQuery,
  onCreate,
  onEdit,
  onDelete,
  onDeleteMany,
  onInactivate,
  onImported,
}: Readonly<CustomerListPanelProps>) {
  const [filters, setFilters] = useState<CustomerListFilters>(emptyCustomerListFilters);
  const [appliedFilters, setAppliedFilters] = useState<CustomerListFilters>(emptyCustomerListFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [openMenu, setOpenMenu] = useState<"actions" | "columns" | null>(null);
  const importer = useImportCadastros(async (message) => {
    setOpenMenu(null);
    await onImported?.(message);
  }, ["customers", "measurements"]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<CustomerListColumnId[]>(readStoredColumnIds);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof CUSTOMER_LIST_PAGE_SIZES)[number]>(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const visibleColumns = useMemo(
    () => CUSTOMER_LIST_COLUMNS.filter((column) => visibleColumnIds.includes(column.id)),
    [visibleColumnIds],
  );
  const filteredCustomers = useMemo(
    () => applyCustomerListFilters(customers, appliedFilters),
    [appliedFilters, customers],
  );
  const pagination = useMemo(
    () => paginateCustomerList(filteredCustomers, page, pageSize),
    [filteredCustomers, page, pageSize],
  );
  const selectedCustomers = useMemo(
    () => customers.filter((customer) => selectedIds.includes(customer.id)),
    [customers, selectedIds],
  );
  const nameLookupOptions = useMemo<SmartLookupOption[]>(
    () =>
      customers.map((customer) => ({
        id: customer.id,
        label: customer.legalName,
        hint: customer.cpfCnpj ?? customer.phone ?? customer.email ?? undefined,
      })),
    [customers],
  );
  const pageIds = pagination.items.map((customer) => customer.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const hasSelection = selectedCustomers.length > 0;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

  const applyFilters = (next: CustomerListFilters) => {
    setAppliedFilters(next);
    setPage(1);
    onApplyQuery({
      q: next.name.trim(),
      status: next.status,
      customerType: next.customerType,
    });
    setOpenMenu(null);
  };

  const toggleColumn = (columnId: CustomerListColumnId, locked?: boolean) => {
    if (locked) {
      return;
    }
    setVisibleColumnIds((current) => {
      if (current.includes(columnId)) {
        return current.filter((id) => id !== columnId);
      }
      return [...current, columnId];
    });
  };

  const toggleSelected = (customerId: string) => {
    setSelectedIds((current) =>
      current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId],
    );
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      if (allPageSelected) {
        return current.filter((id) => !pageIds.includes(id));
      }
      return [...new Set([...current, ...pageIds])];
    });
  };

  const renderCell = (customer: CustomerListRecord, columnId: CustomerListColumnId) => {
    if (columnId === "name") {
      return (
        <>
          <strong>{customer.legalName}</strong>
          <div className="table-subtle">{customer.tradeName ?? customer.email ?? "—"}</div>
        </>
      );
    }
    if (columnId === "type") return customerListTypeLabel(customer.customerType);
    if (columnId === "document") return customer.cpfCnpj ?? "—";
    if (columnId === "status") {
      return <span className={`status-chip status-chip--${customer.status}`}>{customerListStatusLabel(customer.status)}</span>;
    }
    if (columnId === "phone") return formatCustomerListPhone(customer.phone);
    if (columnId === "email") return customer.email ?? "—";
    if (columnId === "city") return customer.city ?? "—";
    if (columnId === "state") return customer.state ?? "—";
    return formatCustomerListDateTime(customer.createdAt);
  };

  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Clientes</h2>

      <div className="cadastro-toolbar" ref={toolbarRef}>
        {importer.input}
        {importer.panel}
        <div className="cadastro-toolbar__left">
          {canWrite ? (
            <button className="button" onClick={() => onCreate()} type="button">
              + Adicionar
            </button>
          ) : null}
          <div className="cadastro-menu">
            <button
              className="button-secondary"
              onClick={() => setOpenMenu((current) => (current === "actions" ? null : "actions"))}
              type="button"
            >
              Mais ações
            </button>
            {openMenu === "actions" ? (
              <ul className="cadastro-menu__list">
                <li>
                  <button
                    disabled={!hasSelection}
                    onClick={() => {
                      downloadTextFile(
                        "clientes.csv",
                        `\uFEFF${buildCustomerExcelCsv(selectedCustomers)}`,
                        "text/csv;charset=utf-8",
                      );
                      setOpenMenu(null);
                    }}
                    type="button"
                  >
                    Exportar para Excel
                  </button>
                </li>
                <li>
                  <button
                    disabled={!hasSelection}
                    onClick={() => {
                      downloadTextFile("clientes-emails.txt", buildCustomerEmailCsv(selectedCustomers), "text/plain;charset=utf-8");
                      setOpenMenu(null);
                    }}
                    type="button"
                  >
                    Exportar e-mails
                  </button>
                </li>
                {canWrite
                  ? (
                      [
                        { kind: "customers" as const, label: "Importar Cadastros" },
                        { kind: "measurements" as const, label: "Importar medidas" },
                      ] as const
                    ).map((action) => (
                      <li key={action.kind}>
                        <button disabled={importer.pending} onClick={() => importer.open(action.kind)} type="button">
                          {importer.pending && importer.activeKind === action.kind ? "Preparando…" : action.label}
                        </button>
                      </li>
                    ))
                  : null}
                {canWrite ? (
                  <li>
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        importer.openResults();
                      }}
                      type="button"
                    >
                      Resultados da integração
                    </button>
                  </li>
                ) : null}
                {canWrite ? (
                  <li>
                    <button
                      disabled={!hasSelection}
                      onClick={() => {
                        onDeleteMany(selectedCustomers);
                        setOpenMenu(null);
                      }}
                      type="button"
                    >
                      Excluir selecionados
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="cadastro-toolbar__right">
          <div className="cadastro-menu">
            <button
              aria-label="Gerenciar colunas"
              className="cadastro-icon-button"
              onClick={() => setOpenMenu((current) => (current === "columns" ? null : "columns"))}
              type="button"
            >
              <span aria-hidden="true">▦</span>
            </button>
            {openMenu === "columns" ? (
              <div className="cadastro-menu__list cadastro-menu__list--columns">
                <strong>Gerenciar colunas</strong>
                {CUSTOMER_LIST_COLUMNS.map((column) => (
                  <label key={column.id}>
                    <input
                      checked={visibleColumnIds.includes(column.id)}
                      disabled={column.locked}
                      onChange={() => toggleColumn(column.id, column.locked)}
                      type="checkbox"
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <form
            className="cadastro-search"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters(filters);
            }}
          >
            <SearchAutocomplete
              canCreate={canWrite}
              compact
              onChange={(name) => setFilters((current) => ({ ...current, name }))}
              onCreate={(name) => onCreate(name)}
              onSelect={(option) => {
                const next = { ...filters, name: option.label };
                setFilters(next);
                applyFilters(next);
              }}
              options={nameLookupOptions}
              placeholder="Buscar por nome"
              value={filters.name}
            />
            <button aria-label="Buscar" className="cadastro-icon-button cadastro-icon-button--accent" type="submit">
              ⌕
            </button>
          </form>
          <button
            aria-expanded={showFilters}
            aria-label={showFilters ? "Fechar filtros" : "Abrir filtros"}
            className={`cadastro-icon-button cadastro-filter-toggle${showFilters ? " cadastro-filter-toggle--open" : ""}`}
            onClick={() => setShowFilters((current) => !current)}
            title={showFilters ? "Fechar filtros" : "Abrir filtros"}
            type="button"
          >
            <FilterToggleIcon open={showFilters} />
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="cadastro-filter-panel">
          <div className="filters-grid">
            <label className="field">
              <span>Tipo</span>
              <select
                onChange={(event) => setFilters((current) => ({ ...current, customerType: event.target.value }))}
                value={filters.customerType}
              >
                <option value="">Todos</option>
                <option value="person">Pessoa</option>
                <option value="company">Empresa</option>
              </select>
            </label>
            <label className="field">
              <span>Nome</span>
              <SearchAutocomplete
                canCreate={canWrite}
                onChange={(name) => setFilters((current) => ({ ...current, name }))}
                onCreate={(name) => onCreate(name)}
                options={nameLookupOptions}
                placeholder="Nome já cadastrado"
                value={filters.name}
              />
            </label>
            <label className="field">
              <span>CPF/CNPJ</span>
              <input
                onChange={(event) => setFilters((current) => ({ ...current, document: event.target.value }))}
                value={filters.document}
              />
            </label>
            <label className="field">
              <span>Telefone/Celular</span>
              <input
                onChange={(event) => setFilters((current) => ({ ...current, phone: event.target.value }))}
                value={filters.phone}
              />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                onChange={(event) => setFilters((current) => ({ ...current, email: event.target.value }))}
                value={filters.email}
              />
            </label>
            <label className="field">
              <span>Cidade</span>
              <input
                onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                value={filters.city}
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <input
                onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}
                value={filters.state}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                value={filters.status}
              >
                <option value="">Todos</option>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <button className="button" onClick={() => applyFilters(filters)} type="button">
              Buscar
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                const cleared = emptyCustomerListFilters();
                setFilters(cleared);
                applyFilters(cleared);
              }}
              type="button"
            >
              Limpar
            </button>
          </div>
        </div>
      ) : null}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-table__check">
                <input
                  aria-label="Selecionar página"
                  checked={allPageSelected}
                  onChange={togglePageSelection}
                  type="checkbox"
                />
              </th>
              {visibleColumns.map((column) => (
                <th key={column.id}>{column.label}</th>
              ))}
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((customer) => {
              const busy = actingCustomerId === customer.id;
              return (
                <tr key={customer.id}>
                  <td className="data-table__check">
                    <input
                      aria-label={`Selecionar ${customer.legalName}`}
                      checked={selectedIds.includes(customer.id)}
                      onChange={() => toggleSelected(customer.id)}
                      type="checkbox"
                    />
                  </td>
                  {visibleColumns.map((column) => (
                    <td key={column.id}>{renderCell(customer, column.id)}</td>
                  ))}
                  <td>
                    {canWrite ? (
                      <div className="table-actions">
                        <button className="button-secondary" disabled={busy} onClick={() => onEdit(customer)} type="button">
                          Alterar
                        </button>
                        <button className="button-secondary" disabled={busy} onClick={() => onDelete(customer)} type="button">
                          Excluir
                        </button>
                        <button
                          className="button-secondary"
                          disabled={busy || customer.status === "inactive"}
                          onClick={() => onInactivate(customer)}
                          type="button"
                        >
                          Inativar
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && pagination.totalItems === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2}>
                  <div className="empty-state">Nenhum cliente encontrado para os filtros informados.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="cadastro-pagination">
        <p className="cadastro-pagination__summary">
          {loading
            ? "Carregando…"
            : pagination.totalItems === 0
              ? "Nenhum registro"
              : `Registros ${pagination.start}–${pagination.end} de ${pagination.totalItems} no total`}
        </p>
        <div className="cadastro-pagination__controls">
          <label>
            <span>Por página</span>
            <select
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof CUSTOMER_LIST_PAGE_SIZES)[number]);
                setPage(1);
              }}
              value={pageSize}
            >
              {CUSTOMER_LIST_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="cadastro-pagination__nav">
            <button
              aria-label="Página anterior"
              className="cadastro-page"
              disabled={pagination.currentPage <= 1}
              onClick={() => setPage(pagination.currentPage - 1)}
              type="button"
            >
              ‹
            </button>
            {buildPaginationItems(pagination.currentPage, pagination.totalPages).map((item, index) =>
              item === "ellipsis" ? (
                <span className="cadastro-page cadastro-page--ellipsis" key={`ellipsis-${index}`}>
                  …
                </span>
              ) : (
                <button
                  aria-current={item === pagination.currentPage ? "page" : undefined}
                  className={`cadastro-page${item === pagination.currentPage ? " cadastro-page--active" : ""}`}
                  key={item}
                  onClick={() => setPage(item)}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
            <button
              aria-label="Próxima página"
              className="cadastro-page"
              disabled={pagination.currentPage >= pagination.totalPages}
              onClick={() => setPage(pagination.currentPage + 1)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
