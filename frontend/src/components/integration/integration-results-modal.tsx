"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImportKind } from "@/components/integration/import-cadastros-menu";
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

type LineView = {
  id: string;
  processNo: number;
  lineNo: number;
  status: "pending" | "created" | "skipped" | "error";
  errorCode: string | null;
  message: string;
  hint: string;
  payload: Array<Record<string, string | number | undefined>>;
};

type LinesView = {
  run: RunView;
  errorTypes: Array<{ code: string; label: string; hint: string; count: number }>;
  lines: LineView[];
  page: number;
  pageSize: number;
  total: number;
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

const KIND_LABEL: Record<string, string> = {
  "body-parts": "Partes do corpo",
  units: "Unidades",
  products: "Produtos",
  services: "Serviços",
  prices: "Preços",
  "minute-rates": "Valor por minuto",
  users: "Usuários",
  customers: "Clientes",
  measurements: "Medidas",
  "service-orders": "Ordens de serviço",
};

function clock(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function remainingText(finishAt: string | null) {
  if (!finishAt) return "";
  const ms = new Date(finishAt).getTime() - Date.now();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `cerca de ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `cerca de ${hours} h ${rest} min` : `cerca de ${hours} h`;
}

function progressCopy(run: RunView) {
  if (run.total === 0) return "Nada para processar.";
  if (run.status === "completed") {
    return `Concluído às ${clock(run.finishedAt ?? run.finishAt)}. ${run.created} integrado(s), ${run.errors} com erro, ${run.skipped} já existente(s).`;
  }
  if (run.processed === 0) return `0 de ${run.total}. Calculando a previsão de término…`;
  const eta = clock(run.finishAt);
  const pace = remainingText(run.finishAt);
  return `${run.percent}% concluído. Faltam ${run.remaining} de ${run.total}. Previsão de término: ${eta}${pace ? ` · ${pace}` : ""}.`;
}

export function IntegrationResultsModal({
  kinds,
  runId,
  onClose,
  onSettled,
}: Readonly<{
  kinds: ImportKind[];
  runId: string | null;
  onClose: () => void;
  onSettled: () => void;
}>) {
  const { apiJson } = useSession();
  const [runs, setRuns] = useState<RunView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(runId);
  const [view, setView] = useState<LinesView | null>(null);
  const [status, setStatus] = useState<"error" | "created" | "skipped">("error");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<LineView["payload"]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settledRef = useRef<string | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const loadRuns = useCallback(async () => {
    const listed = await apiJson<RunView[]>(`/integration/runs?kinds=${encodeURIComponent(kinds.join(","))}`);
    setRuns(listed);
    setSelectedId((current) => current ?? runId ?? listed[0]?.id ?? null);
    return listed;
  }, [apiJson, kinds, runId]);

  const loadLines = useCallback(async () => {
    if (!selectedId) return;
    const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
    if (errorCode) params.set("errorCode", errorCode);
    const next = await apiJson<LinesView>(`/integration/runs/${selectedId}/lines?${params.toString()}`);
    setView(next);
    if (runId && next.run.id === runId && next.run.status === "completed" && settledRef.current !== next.run.id) {
      settledRef.current = next.run.id;
      onSettledRef.current();
    }
  }, [apiJson, errorCode, page, pageSize, runId, selectedId, status]);

  useEffect(() => {
    void loadRuns().catch((error: unknown) => setNotice(describeWorkspaceError(error, "Os resultados não abriram.")));
  }, [loadRuns]);

  useEffect(() => {
    void loadLines().catch((error: unknown) => setNotice(describeWorkspaceError(error, "A grade não carregou.")));
  }, [loadLines]);

  useEffect(() => {
    if (view?.run.status !== "running") return;
    const timer = window.setInterval(() => {
      void loadLines();
      void loadRuns();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loadLines, loadRuns, view?.run.status]);

  const pages = Math.max(1, Math.ceil((view?.total ?? 0) / pageSize));
  const run = view?.run ?? runs.find((item) => item.id === selectedId) ?? null;
  const detail = useMemo(() => view?.lines.find((line) => line.id === detailId) ?? null, [detailId, view?.lines]);

  function chooseType(code: string | null) {
    setStatus("error");
    setErrorCode((current) => (current === code ? null : code));
    setPage(1);
    setDetailId(null);
  }

  async function saveDetail() {
    if (!selectedId || !detail) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiJson<{ message: string }>(`/integration/runs/${selectedId}/lines/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rows: drafts }),
      });
      setNotice(result.message);
      setDetailId(null);
      await loadLines();
    } catch (error) {
      setNotice(describeWorkspaceError(error, "O ajuste não foi salvo."));
    } finally {
      setBusy(false);
    }
  }

  async function reprocess(input: { lineIds?: string[]; errorCode?: string }) {
    if (!selectedId) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiJson(`/integration/runs/${selectedId}/reprocess`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      settledRef.current = null;
      setNotice("Reprocessando o bloco.");
      await loadLines();
    } catch (error) {
      setNotice(describeWorkspaceError(error, "O reprocesso não começou."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="day-board-lightbox" role="dialog" aria-modal="true" aria-labelledby="migration-results-title">
      <button className="day-board-lightbox__backdrop" aria-label="Fechar resultados" onClick={onClose} type="button" />
      <section className="day-board-card migration-results">
        <div className="day-board-card__head">
          <div>
            <div className="eyebrow">Integração</div>
            <h2 id="migration-results-title">Resultados da integração</h2>
          </div>
          <button className="button-secondary" onClick={onClose} type="button">Fechar</button>
        </div>

        {runs.length > 0 ? (
          <label className="field">
            <span>Processo</span>
            <select
              value={selectedId ?? ""}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setPage(1);
                setErrorCode(null);
                setStatus("error");
                setDetailId(null);
                settledRef.current = null;
              }}
            >
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.processNo} · {KIND_LABEL[item.kind] ?? item.kind} · {item.status === "running" ? "em andamento" : "concluído"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>Nenhuma migração desta tela ainda.</p>
        )}

        {run ? (
          <div className="migration-progress">
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={run.percent}
              aria-label="Andamento da migração"
              className="migration-progress__track"
              role="progressbar"
            >
              <div className="migration-progress__fill" style={{ width: `${run.percent}%` }} />
            </div>
            <p>{progressCopy(run)}</p>
          </div>
        ) : null}

        {notice ? <div className="mini-card"><p>{notice}</p></div> : null}

        {run ? (
          <div className="migration-filters">
            <button
              className={status === "error" && !errorCode ? "button" : "button-secondary"}
              onClick={() => chooseType(null)}
              type="button"
            >
              Erros ({run.errors})
            </button>
            {view?.errorTypes.map((type) => (
              <button
                className={errorCode === type.code ? "button" : "button-secondary"}
                key={type.code}
                onClick={() => chooseType(type.code)}
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
                setDetailId(null);
              }}
              type="button"
            >
              Integrados ({run.created})
            </button>
            <button
              className={status === "skipped" ? "button" : "button-secondary"}
              onClick={() => {
                setStatus("skipped");
                setErrorCode(null);
                setPage(1);
                setDetailId(null);
              }}
              type="button"
            >
              Já existentes ({run.skipped})
            </button>
            {status === "error" && errorCode ? (
              <button className="button" disabled={busy} onClick={() => void reprocess({ errorCode })} type="button">
                Reprocessar este bloco
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Processo</th>
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
                  <td>{line.lineNo}</td>
                  <td>{line.message}</td>
                  <td>{line.hint}</td>
                  <td>
                    <div className="button-row">
                      <button
                        className="button-secondary"
                        onClick={() => {
                          setDetailId(line.id);
                          setDrafts(line.payload.map((row) => ({ ...row })));
                        }}
                        type="button"
                      >
                        Detalhar
                      </button>
                      {line.status === "error" ? (
                        <button className="button-secondary" disabled={busy} onClick={() => void reprocess({ lineIds: [line.id] })} type="button">
                          Reprocessar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {view && view.lines.length === 0 ? (
                <tr>
                  <td colSpan={5}>Nenhuma linha neste filtro.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {detail
          ? createPortal(
              <div aria-labelledby="integration-line-detail-title" aria-modal="true" className="os-anexo-lightbox" role="dialog">
                <button aria-label="Fechar detalhe" className="os-anexo-lightbox__backdrop" onClick={() => setDetailId(null)} type="button" />
                <div className="os-anexo-lightbox__card">
                  <div className="day-board-card__head">
                    <div className="workspace-toolbar__copy">
                      <h4 id="integration-line-detail-title">Linha {detail.lineNo}</h4>
                      <p>Ajuste os campos e salve. Fechar volta para a grade.</p>
                    </div>
                    <button className="button-secondary" onClick={() => setDetailId(null)} type="button">
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
                      <button className="button-secondary" onClick={() => setDetailId(null)} type="button">
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
          <span>Por página</span>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <button className="button-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">Anterior</button>
          <span>{page} / {pages}</span>
          <button className="button-secondary" disabled={page >= pages} onClick={() => setPage((current) => current + 1)} type="button">Próxima</button>
        </div>
      </section>
    </div>
  );
}
