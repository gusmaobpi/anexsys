"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notifyCadastroChanged, useCadastroListRefresh } from "@/components/app-shell/cadastro-save-navigation";
import { useWorkspaceManager, useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { downloadMigrationWorkbook } from "@/components/integration/excel-workbook";
import { IMPORT_RECORD_OPTIONS } from "@/components/integration/migration-layouts";
import { readLayoutRows } from "@/components/integration/read-layout-sheet";
import { useSession } from "@/components/providers/session-provider";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

type RunView = {
  id: string;
  processNo: number;
  kind: string;
  status: "running" | "completed";
  percent: number;
  remaining: number;
  total: number;
  processed: number;
  finishAt: string | null;
  created: number;
  skipped: number;
  errors: number;
  startedAt: string;
  finishedAt: string | null;
};

type HistoryLine = {
  id: string;
  runId: string;
  processNo: number;
  kind: string;
  startedAt: string;
  lineNo: number;
  status: "pending" | "created" | "skipped" | "error";
  message: string;
  hint: string;
  payload: Array<Record<string, string | number | undefined>>;
};

type HistoryView = {
  lines: HistoryLine[];
  page: number;
  pageSize: number;
  total: number;
  errorTypes: Array<{ code: string; label: string; count: number }>;
  counts: { pending: number; created: number; skipped: number; error: number };
  running: RunView | null;
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

function kindLabel(kind: string) {
  return IMPORT_RECORD_OPTIONS.find((option) => option.kind === kind)?.layout.menuLabel.replace(/^Cadastro de /, "") ?? kind;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clock(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function progressCopy(run: RunView) {
  if (run.total === 0) return "Nada para processar.";
  if (run.status === "completed") return `Concluído às ${clock(run.finishedAt ?? run.finishAt)}.`;
  if (run.processed === 0) return `Processo ${run.processNo}. Calculando a previsão de término…`;
  const eta = clock(run.finishAt);
  return `Processo ${run.processNo} · ${run.percent}% concluído. Faltam ${run.remaining} de ${run.total}. Previsão de término: ${eta}.`;
}

export function IntegrationHistoryWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const workspaceMode = searchParams.get("workspaceMode");
  const isForm = workspaceMode === "new";
  const { apiJson } = useSession();
  const { isMobile } = useWorkspaceViewportMode();
  const { closeWorkspace } = useWorkspaceManager();
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: isForm ? "Importar Registro" : "Importar Registros",
    subtitle: isForm ? "Nova migração" : "Histórico",
  });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<HistoryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"" | "error" | "created" | "skipped">("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [detail, setDetail] = useState<HistoryLine | null>(null);
  const [drafts, setDrafts] = useState<HistoryLine["payload"]>([]);
  const [busy, setBusy] = useState(false);
  const selected = IMPORT_RECORD_OPTIONS.find((option) => option.kind === kind) ?? null;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set("status", status);
    if (errorCode) params.set("errorCode", errorCode);
    if (kindFilter) params.set("kind", kindFilter);
    if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
    const next = await apiJson<HistoryView>(`/integration/history?${params.toString()}`);
    setView(next);
    setLoading(false);
  }, [apiJson, appliedQuery, errorCode, kindFilter, page, pageSize, status]);

  useCadastroListRefresh("/integration", !isForm, load);

  useEffect(() => {
    if (isForm) return;
    void load().catch((error: unknown) => {
      setLoading(false);
      setNotice(describeWorkspaceError(error, "O histórico não abriu."));
    });
  }, [isForm, load]);

  useEffect(() => {
    if (isForm || !view?.running) return;
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [isForm, load, view?.running]);

  function openImport() {
    const targetPath = "/integration?workspaceMode=new";
    if (isMobile) {
      navigateWithinWorkspace(targetPath);
      return;
    }
    openWorkspaceInNewTab(targetPath, "Importar Registro", { cloneCurrent: false, subtitle: "Nova migração" });
  }

  async function sendFile(file: File | undefined) {
    if (!file || !selected) return;
    setSending(true);
    setNotice(null);
    try {
      const rows = await readLayoutRows(file);
      if (rows.length === 0) {
        setNotice("A planilha não tem linhas para importar.");
        return;
      }
      await apiJson(`/integration/import/${selected.kind}`, {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      notifyCadastroChanged("/integration");
      if (isMobile) navigateWithinWorkspace("/integration");
      else if (currentTabId) closeWorkspace(currentTabId);
    } catch (error) {
      setNotice(describeWorkspaceError(error, "A planilha não foi importada."));
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function closeDetail() {
    setDetail(null);
  }

  useEffect(() => {
    if (!detail) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeDetail();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  async function saveDetail() {
    if (!detail) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiJson<{ message: string }>(`/integration/runs/${detail.runId}/lines/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rows: drafts }),
      });
      setNotice(result.message);
      setDetail(null);
      await load();
    } catch (error) {
      setNotice(describeWorkspaceError(error, "O ajuste não foi salvo."));
    } finally {
      setBusy(false);
    }
  }

  async function reprocess(input: { lineIds?: string[]; errorCode?: string }, runId: string) {
    setBusy(true);
    setNotice(null);
    try {
      await apiJson(`/integration/runs/${runId}/reprocess`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setNotice("Reprocessando o bloco.");
      await load();
    } catch (error) {
      setNotice(describeWorkspaceError(error, "O reprocesso não começou."));
    } finally {
      setBusy(false);
    }
  }

  if (isForm) {
    return (
      <section className="workspace-stack">
        <article className="mini-card cadastro-form">
          <h3>Importar Registro</h3>
          <p className="subtitle">
            Escolha o que vai migrar, baixe o layout e envie a planilha. O histórico recebe o processo e a barra acompanha até o fim.
          </p>
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) => void sendFile(event.target.files?.[0])}
            ref={fileRef}
            type="file"
          />
          <label className="field">
            <span>O que vou importar</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">Selecione</option>
              {IMPORT_RECORD_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.layout.menuLabel}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button className="button-secondary" disabled={!selected} onClick={() => selected && downloadMigrationWorkbook(selected.layout)} type="button">
              Baixar layout
            </button>
            <button className="button" disabled={!selected || sending} onClick={() => fileRef.current?.click()} type="button">
              {sending ? "Preparando…" : "Escolher arquivo"}
            </button>
          </div>
          {notice ? <p>{notice}</p> : null}
          {selected ? (
            <>
              <p>{selected.layout.summary}</p>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Coluna</th>
                      <th>Obrigatório</th>
                      <th>Exemplo</th>
                      <th>Como preencher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.layout.columns.map((column) => (
                      <tr key={column.header}>
                        <td>{column.header}</td>
                        <td>{column.required}</td>
                        <td>{column.example || "—"}</td>
                        <td>{column.hint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </article>
      </section>
    );
  }

  const pages = Math.max(1, Math.ceil((view?.total ?? 0) / pageSize));
  const counts = view?.counts ?? { pending: 0, created: 0, skipped: 0, error: 0 };

  return (
    <section className="mini-card cadastro-list">
      <h2 className="cadastro-list__title">Importar Registros</h2>
      <div className="cadastro-toolbar">
        <div className="cadastro-toolbar__left">
          <button className="button" onClick={openImport} type="button">
            Importar Registro
          </button>
        </div>
        <div className="cadastro-toolbar__right">
          <form
            className="cadastro-search"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedQuery(query);
              setPage(1);
            }}
          >
            <input
              aria-label="Buscar no histórico"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Processo ou mensagem"
              value={query}
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
            <svg aria-hidden="true" height="22" viewBox="0 0 24 24" width="22">
              <circle cx="10" cy="10" fill="none" r="6.25" stroke="currentColor" strokeWidth="2" />
              <path d="M14.8 14.8 L20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              <path d="M7 10 H13" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              {showFilters ? null : <path d="M10 7 V13" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />}
            </svg>
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="cadastro-filter-panel">
          <div className="filters-grid">
            <label className="field">
              <span>Tipo</span>
              <select
                onChange={(event) => {
                  setKindFilter(event.target.value);
                  setPage(1);
                }}
                value={kindFilter}
              >
                <option value="">Todos</option>
                {IMPORT_RECORD_OPTIONS.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {kindLabel(option.kind)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button
              className="button-secondary"
              onClick={() => {
                setKindFilter("");
                setQuery("");
                setAppliedQuery("");
                setStatus("");
                setErrorCode(null);
                setPage(1);
              }}
              type="button"
            >
              Limpar
            </button>
          </div>
        </div>
      ) : null}

      {view?.running ? (
        <div className="migration-progress">
          <div aria-label="Andamento da migração" aria-valuemax={100} aria-valuemin={0} aria-valuenow={view.running.percent} className="migration-progress__track" role="progressbar">
            <div className="migration-progress__fill" style={{ width: `${view.running.percent}%` }} />
          </div>
          <p>{progressCopy(view.running)}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="mini-card">
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="migration-filters">
        <button
          className={status === "error" && !errorCode ? "button" : "button-secondary"}
          onClick={() => {
            setStatus("error");
            setErrorCode(null);
            setPage(1);
            setDetail(null);
          }}
          type="button"
        >
          Erros ({counts.error})
        </button>
        {view?.errorTypes.map((type) => (
          <button
            className={errorCode === type.code ? "button" : "button-secondary"}
            key={type.code}
            onClick={() => {
              setStatus("error");
              setErrorCode((current) => (current === type.code ? null : type.code));
              setPage(1);
              setDetail(null);
            }}
            type="button"
          >
            {type.label} ({type.count})
          </button>
        ))}
        <button
          className={status === "created" ? "button" : "button-secondary"}
          onClick={() => {
            setStatus("created");
            setErrorCode(null);
            setPage(1);
            setDetail(null);
          }}
          type="button"
        >
          Integrados ({counts.created})
        </button>
        <button
          className={status === "skipped" ? "button" : "button-secondary"}
          onClick={() => {
            setStatus("skipped");
            setErrorCode(null);
            setPage(1);
            setDetail(null);
          }}
          type="button"
        >
          Já existentes ({counts.skipped})
        </button>
        {status === "error" && errorCode ? (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setNotice(null);
                try {
                  await apiJson("/integration/history/reprocess", {
                    method: "POST",
                    body: JSON.stringify({ errorCode }),
                  });
                  setNotice("Reprocessando o bloco.");
                  await load();
                } catch (error) {
                  setNotice(describeWorkspaceError(error, "O reprocesso não começou."));
                } finally {
                  setBusy(false);
                }
              })()
            }
            type="button"
          >
            Reprocessar este bloco
          </button>
        ) : null}
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Processo</th>
              <th>Tipo</th>
              <th>Data do processamento</th>
              <th>Linha</th>
              <th>Mensagem</th>
              <th>Como solucionar</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {view?.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.processNo}</td>
                <td>{kindLabel(line.kind)}</td>
                <td>{formatWhen(line.startedAt)}</td>
                <td>{line.lineNo}</td>
                <td>{line.message}</td>
                <td>{line.hint}</td>
                <td>
                  <div className="table-actions">
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setDetail(line);
                        setDrafts(line.payload.map((row) => ({ ...row })));
                      }}
                      type="button"
                    >
                      Detalhar
                    </button>
                    {line.status === "error" ? (
                      <button className="button-secondary" disabled={busy} onClick={() => void reprocess({ lineIds: [line.id] }, line.runId)} type="button">
                        Reprocessar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && (view?.lines.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">Nenhuma importação neste filtro. Use Importar Registro para enviar uma planilha.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail
        ? createPortal(
            <div aria-labelledby="integration-detail-title" aria-modal="true" className="os-anexo-lightbox" role="dialog">
              <button aria-label="Fechar detalhe" className="os-anexo-lightbox__backdrop" onClick={closeDetail} type="button" />
              <div className="os-anexo-lightbox__card">
                <div className="day-board-card__head">
                  <div className="workspace-toolbar__copy">
                    <h4 id="integration-detail-title">
                      Processo {detail.processNo} · linha {detail.lineNo}
                    </h4>
                    <p>Ajuste os campos e salve. O que já está em uma ordem de serviço permanece como foi gravado.</p>
                  </div>
                  <button className="button-secondary" onClick={closeDetail} type="button">
                    Fechar
                  </button>
                </div>
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveDetail();
                  }}
                >
                  {drafts.map((row, rowIndex) => (
                    <div className="form-grid" key={`${detail.id}-${rowIndex}`}>
                      {drafts.length > 1 ? <h4>Peça {String(row.Peça ?? rowIndex + 1)}</h4> : null}
                      {Object.keys(row)
                        .filter((key) => key !== "__line")
                        .map((key) => (
                          <label className="field" key={key}>
                            <span>{key}</span>
                            <input
                              value={String(row[key] ?? "")}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDrafts((current) => current.map((item, index) => (index === rowIndex ? { ...item, [key]: value } : item)));
                              }}
                            />
                          </label>
                        ))}
                    </div>
                  ))}
                  <div className="button-row">
                    <button className="button" disabled={busy} type="submit">
                      Salvar
                    </button>
                    <button className="button-secondary" onClick={closeDetail} type="button">
                      Fechar
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="cadastro-pagination">
        <p className="cadastro-pagination__summary">
          {loading ? "Carregando…" : view && view.total > 0 ? `Registros ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, view.total)} de ${view.total} no total` : "Nenhum registro"}
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
          <button className="button-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">
            Anterior
          </button>
          <span>
            {page} / {pages}
          </span>
          <button className="button-secondary" disabled={page >= pages} onClick={() => setPage((current) => current + 1)} type="button">
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
