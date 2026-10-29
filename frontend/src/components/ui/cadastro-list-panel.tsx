"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildPaginationItems,
  CUSTOMER_LIST_PAGE_SIZES,
  downloadTextFile,
  paginateCustomerList,
} from "@/components/customers/customer-list";
import { SearchAutocomplete } from "@/components/ui/search-autocomplete";
import type { SmartLookupOption } from "@/components/ui/lookup-suggestions";
import { useImportCadastros, type ImportKind } from "@/components/integration/import-cadastros-menu";
import { RowOverflowMenu, type RowMenuItem } from "@/components/ui/row-overflow-menu";

const PAGE_SIZES = CUSTOMER_LIST_PAGE_SIZES;

export type CadastroColumn<T> = {
  id: string;
  label: string;
  locked?: boolean;
  render: (row: T) => ReactNode;
};

export type CadastroFilterField = {
  id: string;
  label: string;
  placeholder?: string;
  kind?: "text" | "select";
  options?: { value: string; label: string }[];
  lookup?: boolean;
  maxLength?: number;
};

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

function normalizeColumnIds(ids: readonly string[], columns: Array<{ id: string; locked?: boolean }>, fallback: string[]): string[] {
  const allowed = new Set(columns.map((column) => column.id));
  const lockedId = columns.find((column) => column.locked)?.id ?? columns[0]?.id;
  const next = ids.filter((id) => allowed.has(id));
  if (lockedId && !next.includes(lockedId)) {
    next.unshift(lockedId);
  }
  return next.length > 0 ? [...new Set(next)] : [...fallback];
}

function readStoredColumnIds(storageKey: string, columns: Array<{ id: string; locked?: boolean }>, fallback: string[]): string[] {
  if (typeof window === "undefined") {
    return [...fallback];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [...fallback];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? normalizeColumnIds(parsed.map(String), columns, fallback) : [...fallback];
  } catch {
    return [...fallback];
  }
}

type CadastroListPanelProps<T extends { id: string }> = {
  title: string;
  records: T[];
  loading: boolean;
  canWrite: boolean;
  columns: CadastroColumn<T>[];
  defaultColumnIds: string[];
  columnStorageKey: string;
  filterFields: CadastroFilterField[];
  emptyFilters: Record<string, string>;
  applyFilters: (records: T[], filters: Record<string, string>) => T[];
  searchKey: string;
  searchPlaceholder: string;
  searchOptions: SmartLookupOption[];
  onCreate: (prefillName?: string) => void;
  hideCreate?: boolean;
  onEdit: (row: T) => void;
  editLabel?: string;
  editLabelForRow?: (row: T) => string;
  onDelete?: (row: T) => void;
  onDeleteMany?: (rows: T[]) => void;
  bulkActions?: Array<{ id: string; label: string; onSelect: (rows: T[]) => void }>;
  onInactivate?: (row: T) => void;
  canInactivate?: (row: T) => boolean;
  onPay?: (row: T) => void;
  canPay?: (row: T) => boolean;
  extraActions?: (row: T) => ReactNode;
  rowMenu?: (row: T) => RowMenuItem[];
  excelFileName: string;
  buildExcelCsv: (rows: T[]) => string;
  importActions?: Array<{ kind: ImportKind; label?: string }>;
  onImported?: (message: string) => void | Promise<void>;
  emailFileName?: string;
  buildEmailCsv?: (rows: T[]) => string;
  emptyMessage: string;
  rowLabel: (row: T) => string;
};

export function CadastroListPanel<T extends { id: string }>({
  title,
  records,
  loading,
  canWrite,
  columns,
  defaultColumnIds,
  columnStorageKey,
  filterFields,
  emptyFilters,
  applyFilters,
  searchKey,
  searchPlaceholder,
  searchOptions,
  onCreate,
  hideCreate = false,
  onEdit,
  editLabel = "Alterar",
  editLabelForRow,
  onDelete,
  onDeleteMany,
  bulkActions,
  onInactivate,
  canInactivate,
  onPay,
  canPay,
  extraActions,
  rowMenu,
  excelFileName,
  buildExcelCsv,
  importActions,
  onImported,
  emailFileName,
  buildEmailCsv,
  emptyMessage,
  rowLabel,
}: Readonly<CadastroListPanelProps<T>>) {
  const [filters, setFilters] = useState<Record<string, string>>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [openMenu, setOpenMenu] = useState<"actions" | "columns" | null>(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() =>
    readStoredColumnIds(columnStorageKey, columns, defaultColumnIds),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const importKinds = importActions?.map((action) => action.kind) ?? [];
  const importer = useImportCadastros(async (message) => {
    setOpenMenu(null);
    await onImported?.(message);
  }, importKinds);

  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleColumnIds.includes(column.id)),
    [columns, visibleColumnIds],
  );
  const filteredRecords = useMemo(() => applyFilters(records, appliedFilters), [appliedFilters, applyFilters, records]);
  const pagination = useMemo(() => paginateCustomerList(filteredRecords, page, pageSize), [filteredRecords, page, pageSize]);
  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds],
  );
  const pageIds = pagination.items.map((record) => record.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const hasSelection = selectedRecords.length > 0;

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
    window.localStorage.setItem(columnStorageKey, JSON.stringify(visibleColumnIds));
  }, [columnStorageKey, visibleColumnIds]);

  const commitFilters = (next: Record<string, string>) => {
    setAppliedFilters(next);
    setPage(1);
    setOpenMenu(null);
  };

  const toggleColumn = (columnId: string, locked?: boolean) => {
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

  const toggleSelected = (recordId: string) => {
    setSelectedIds((current) => (current.includes(recordId) ? current.filter((id) => id !== recordId) : [...current, recordId]));
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      if (allPageSelected) {
        return current.filter((id) => !pageIds.includes(id));
      }
      return [...new Set([...current, ...pageIds])];
    });
  };

  const searchValue = filters[searchKey] ?? "";

  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">{title}</h2>

      <div className="cadastro-toolbar" ref={toolbarRef}>
        {importer.input}
        {importer.panel}
        <div className="cadastro-toolbar__left">
          {canWrite && !hideCreate ? (
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
                      downloadTextFile(excelFileName, `\uFEFF${buildExcelCsv(selectedRecords)}`, "text/csv;charset=utf-8");
                      setOpenMenu(null);
                    }}
                    type="button"
                  >
                    Exportar para Excel
                  </button>
                </li>
                {buildEmailCsv && emailFileName ? (
                  <li>
                    <button
                      disabled={!hasSelection}
                      onClick={() => {
                        downloadTextFile(emailFileName, buildEmailCsv(selectedRecords), "text/plain;charset=utf-8");
                        setOpenMenu(null);
                      }}
                      type="button"
                    >
                      Exportar e-mails
                    </button>
                  </li>
                ) : null}
                {canWrite
                  ? importActions?.map((action) => (
                  <li key={action.kind}>
                    <button disabled={importer.pending} onClick={() => importer.open(action.kind)} type="button">
                      {importer.pending && importer.activeKind === action.kind
                        ? "Preparando…"
                        : action.label ?? "Importar Cadastros"}
                    </button>
                  </li>
                ))
                  : null}
                {canWrite && importKinds.length > 0 ? (
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
                {bulkActions?.map((action) => (
                  <li key={action.id}>
                    <button
                      disabled={!hasSelection}
                      onClick={() => {
                        action.onSelect(selectedRecords);
                        setOpenMenu(null);
                      }}
                      type="button"
                    >
                      {action.label}
                    </button>
                  </li>
                ))}
                {onDeleteMany ? (
                  <li>
                    <button
                      disabled={!hasSelection}
                      onClick={() => {
                        onDeleteMany(selectedRecords);
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
                {columns.map((column) => (
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
              commitFilters(filters);
            }}
          >
            <SearchAutocomplete
              canCreate={canWrite && !hideCreate}
              compact
              onChange={(value) => setFilters((current) => ({ ...current, [searchKey]: value }))}
              onCreate={(name) => onCreate(name)}
              onSelect={(option) => {
                const next = { ...filters, [searchKey]: option.label };
                setFilters(next);
                commitFilters(next);
              }}
              options={searchOptions}
              placeholder={searchPlaceholder}
              value={searchValue}
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
            {filterFields.map((field) => (
              <label className="field" key={field.id}>
                <span>{field.label}</span>
                {field.lookup ? (
                  <SearchAutocomplete
                    canCreate={canWrite && !hideCreate}
                    onChange={(value) => setFilters((current) => ({ ...current, [field.id]: value }))}
                    onCreate={(name) => onCreate(name)}
                    options={searchOptions}
                    placeholder={field.placeholder}
                    value={filters[field.id] ?? ""}
                  />
                ) : field.kind === "select" ? (
                  <select
                    onChange={(event) => setFilters((current) => ({ ...current, [field.id]: event.target.value }))}
                    value={filters[field.id] ?? ""}
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    maxLength={field.maxLength}
                    onChange={(event) => setFilters((current) => ({ ...current, [field.id]: event.target.value }))}
                    placeholder={field.placeholder}
                    value={filters[field.id] ?? ""}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="button-row">
            <button className="button" onClick={() => commitFilters(filters)} type="button">
              Buscar
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                setFilters(emptyFilters);
                commitFilters(emptyFilters);
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
            {pagination.items.map((row) => (
              <tr key={row.id}>
                <td className="data-table__check">
                  <input
                    aria-label={`Selecionar ${rowLabel(row)}`}
                    checked={selectedIds.includes(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    type="checkbox"
                  />
                </td>
                {visibleColumns.map((column) => (
                  <td key={column.id}>{column.render(row)}</td>
                ))}
                <td>
                  {canWrite || onPay || extraActions || rowMenu ? (
                    <div className="table-actions">
                      {canWrite ? (
                        <button className="button-secondary" onClick={() => onEdit(row)} type="button">
                          {editLabelForRow?.(row) ?? editLabel}
                        </button>
                      ) : null}
                      {canWrite && onDelete ? (
                        <button className="button-secondary" onClick={() => onDelete(row)} type="button">
                          Excluir
                        </button>
                      ) : null}
                      {canWrite && onInactivate ? (
                        <button
                          className="button-secondary"
                          disabled={canInactivate ? !canInactivate(row) : false}
                          onClick={() => onInactivate(row)}
                          type="button"
                        >
                          Inativar
                        </button>
                      ) : null}
                      {onPay && (canPay ? canPay(row) : true) ? (
                        <button className="button-secondary" onClick={() => onPay(row)} type="button">
                          Pagar
                        </button>
                      ) : null}
                      {rowMenu ? <RowOverflowMenu items={rowMenu(row)} label={`Opções de ${rowLabel(row)}`} /> : null}
                      {extraActions?.(row)}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!loading && pagination.totalItems === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2}>
                  <div className="empty-state">{emptyMessage}</div>
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
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
              value={pageSize}
            >
              {PAGE_SIZES.map((size) => (
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
