"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceManager, useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane, useWorkspaceSearchParams } from "@/components/app-shell/workspace-pane";
import { useWorkspaceViewportMode } from "@/components/app-shell/workspace-responsive";
import { useSession } from "@/components/providers/session-provider";
import {
  applyQualityListFilters,
  belongsToQualityList,
  buildQualityExcelCsv,
  qualityDecisionLabel,
  qualityPhaseLabel,
  type QualityListRecord,
} from "@/components/quality/quality-list";
import { printProductionOrderDocument, reservePrintWindow, type OpPrintView } from "@/components/service-orders/os-documents";
import { type OsFinancialSummary } from "@/components/service-orders/os-pay-panel";
import { osOpHeaderTerm, osPaymentConditionLabel } from "@/components/service-orders/service-order-workspace-view-model";
import { osStatusLabel } from "@/components/service-orders/os-list";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { HoverPeek } from "@/components/ui/hover-peek";
import { RowOverflowMenu, type RowMenuItem } from "@/components/ui/row-overflow-menu";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

type QualityPiece = {
  id: string;
  itemType: string;
  description: string;
  complement: string | null;
  brand: string;
  model: string;
  serialNo: string;
  inCurrentRound: boolean;
  decision: "pending" | "approved" | "rejected" | "in_rework";
  canDecide: boolean;
  reason: string | null;
};

type QualityReview = {
  serviceOrder: {
    id: string;
    orderNo: string;
    status: string;
    promisedDeliveryDate: string;
  };
  customer: { legalName: string; phone: string | null };
  productionOrder: { id: string; productionNo: string };
  phase: "needs_review" | "rework_issued" | "ready";
  versionNo: number;
  items: QualityPiece[];
};

type DecideResponse = {
  review: QualityReview;
  printView: OpPrintView | null;
  issuedRework: boolean;
};

export function QualityWorkspace() {
  const searchParams = useWorkspaceSearchParams();
  const pane = useWorkspacePane();
  const { session, hasAnyPermission, apiJson } = useSession();
  const { isMobile } = useWorkspaceViewportMode();
  const { closeWorkspace } = useWorkspaceManager();
  const canRead = hasAnyPermission("quality.read");
  const canWrite = hasAnyPermission("quality.write");
  const canReadProduction = hasAnyPermission("production_orders.read");
  const focusRecordId = searchParams.get("focusRecordId");
  const isListWorkspace = !focusRecordId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<QualityListRecord[]>([]);
  const [review, setReview] = useState<QualityReview | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const companyName = session?.companies.find((company) => company.tenantId === session?.tenantId)?.displayName ?? "ANEXSYS";

  const selected = useMemo(
    () => records.find((record) => record.id === focusRecordId) ?? null,
    [focusRecordId, records],
  );
  const { currentTabId, navigateWithinWorkspace, openWorkspaceInNewTab } = useWorkspaceRegistration({
    label: selected ? `Qualidade ${selected.orderNo}` : review ? `Qualidade ${review.serviceOrder.orderNo}` : "Controle de qualidade",
    subtitle: review ? qualityPhaseLabel(review.phase) : null,
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const loadList = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiJson<QualityListRecord[]>("/quality-reviews");
      setRecords(response.filter((record) => belongsToQualityList(record)));
    } catch (error) {
      setMessage(describeWorkspaceError(error, "As revisoes de qualidade nao puderam ser carregadas."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead]);

  const loadReview = useCallback(
    async (serviceOrderId: string) => {
      setLoading(true);
      try {
        const response = await apiJson<QualityReview>(`/quality-reviews/${serviceOrderId}`);
        setReview(response);
      } catch (error) {
        setMessage(describeWorkspaceError(error, "A revisao de qualidade nao pode ser carregada."));
        setReview(null);
      } finally {
        setLoading(false);
      }
    },
    [apiJson],
  );

  useEffect(() => {
    if (!isActivePane) {
      return;
    }
    void loadList();
  }, [isActivePane, loadList, session?.activeBranchId, session?.tenantId]);

  useEffect(() => {
    if (focusRecordId) {
      void loadReview(focusRecordId);
      return;
    }
    setReview(null);
    setRejectingId(null);
    setRejectReason("");
  }, [focusRecordId, loadReview]);

  const openReview = useCallback(
    (row: QualityListRecord) => {
      const targetPath = `/quality?focusRecordId=${encodeURIComponent(row.id)}`;
      if (isMobile) {
        navigateWithinWorkspace(targetPath);
        return;
      }
      openWorkspaceInNewTab(targetPath, `Qualidade ${row.orderNo}`, { cloneCurrent: false });
    },
    [isMobile, navigateWithinWorkspace, openWorkspaceInNewTab],
  );

  const reprintProductionOrder = useCallback(
    async (serviceOrderId: string, productionOrderId?: string) => {
      try {
        let resolvedProductionOrderId = productionOrderId ?? "";
        if (!resolvedProductionOrderId) {
          const existing = await apiJson<{ productionOrder: { id: string } }>(
            `/service-orders/${serviceOrderId}/production-order`,
          );
          resolvedProductionOrderId = existing.productionOrder.id;
        }
        const view = await apiJson<OpPrintView>(`/production-orders/${resolvedProductionOrderId}/print-view`);
        let paymentCondition = osOpHeaderTerm({ returnKind: view.serviceOrder.returnKind, paymentStatus: null });
        try {
          const summary = await apiJson<OsFinancialSummary>(`/service-orders/${serviceOrderId}/financial-summary`);
          paymentCondition = osOpHeaderTerm({
            returnKind: view.serviceOrder.returnKind,
            paymentStatus: summary.paymentStatus,
          });
        } catch {
          /* a OP sai mesmo se o financeiro não puder ser lido */
        }
        printProductionOrderDocument(view, companyName, undefined, paymentCondition);
        setMessage(`Ordem de produção ${view.serviceOrder.orderNo} enviada para impressão.`);
      } catch (error) {
        setMessage(describeWorkspaceError(error, "A Ordem de Produção não pôde ser reimpressa."));
      }
    },
    [apiJson, companyName],
  );

  const buildQualityRowMenu = useCallback(
    (row: Pick<QualityListRecord, "id" | "orderNo" | "productionOrderId">): RowMenuItem[] => [
      {
        id: "print",
        label: "Imprimir",
        children: [
          {
            id: "print-op",
            label: "Ordem de produção",
            disabled: !canReadProduction,
            onSelect: () => {
              void reprintProductionOrder(row.id, row.productionOrderId);
            },
          },
        ],
      },
    ],
    [canReadProduction, reprintProductionOrder],
  );

  const printReworkIfNeeded = useCallback(
    (result: DecideResponse) => {
      if (!result.issuedRework || !result.printView) {
        return;
      }
      const popup = reservePrintWindow();
      printProductionOrderDocument(result.printView, companyName, popup, osPaymentConditionLabel(null));
    },
    [companyName],
  );

  async function decide(itemId: string, decision: "approved" | "rejected", reason?: string) {
    if (!review) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiJson<DecideResponse>(`/quality-reviews/${review.serviceOrder.id}/items/${itemId}`, {
        method: "POST",
        body: JSON.stringify({ decision, reason }),
      });
      setReview(result.review);
      setRejectingId(null);
      setRejectReason("");
      printReworkIfNeeded(result);
      if (result.issuedRework) {
        setMessage("Peças reprovadas voltaram para a esteira. A OP de refação foi enviada para impressão. A OS original permanece em Controle de qualidade.");
      } else if (result.review.phase === "ready") {
        setMessage("Todas as peças foram aprovadas. A OS foi para Pronto para retirada.");
      }
      await loadList();
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A revisao nao pode ser concluida."));
    } finally {
      setSaving(false);
    }
  }

  async function startReturn() {
    if (!review) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await apiJson<QualityReview>(`/quality-reviews/${review.serviceOrder.id}/start-return`, {
        method: "POST",
      });
      setReview(next);
      setMessage(`Versão ${next.versionNo} pronta para revisar as peças que voltaram da refação.`);
    } catch (error) {
      setMessage(describeWorkspaceError(error, "O retorno da refacao nao pode ser iniciado."));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Controle de qualidade indisponível</h3>
        <p>Você não possui acesso à qualidade no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {message ? <WorkspaceFlash message={message} /> : null}

      {isListWorkspace ? (
        <CadastroListPanel
          applyFilters={applyQualityListFilters}
          buildExcelCsv={buildQualityExcelCsv}
          canWrite={canWrite}
          columnStorageKey="anexsys.frontend.quality.grid-columns.v1"
          columns={[
            {
              id: "name",
              label: "OP",
              locked: true,
              render: (row) => (
                <>
                  <strong>{row.orderNo}</strong>
                  <div className="table-subtle">{row.customerName}</div>
                </>
              ),
            },
            { id: "customer", label: "Cliente", render: (row) => row.customerName },
            {
              id: "status",
              label: "Status",
              render: (row) => <span className="status-chip status-chip--active">{osStatusLabel(row.status)}</span>,
            },
            { id: "version", label: "Versão OP", render: (row) => String(row.versionNo) },
          ]}
          defaultColumnIds={["name", "status", "version"]}
          emptyFilters={{ name: "" }}
          emptyMessage="Nenhuma OP aguardando controle de qualidade."
          excelFileName="qualidade.csv"
          filterFields={[
            { id: "name", label: "Número", lookup: true, placeholder: "Número da OS / OP" },
          ]}
          hideCreate
          loading={loading}
          onCreate={() => undefined}
          onEdit={openReview}
          editLabel="Revisar"
          rowMenu={buildQualityRowMenu}
          records={records}
          rowLabel={(row) => row.orderNo}
          searchKey="name"
          searchOptions={records.map((record) => ({ id: record.id, label: record.orderNo, hint: record.customerName }))}
          searchPlaceholder="Buscar por número da OP"
          title="Controle de qualidade"
        />
      ) : null}

      {!isListWorkspace && review ? (
        <article className="mini-card cadastro-form qc-form">
          <div className="workspace-toolbar">
            <div className="workspace-toolbar__copy">
              <h3>
                OS {review.serviceOrder.orderNo}
                {review.versionNo > 1 ? ` · Versão ${review.versionNo}` : ""}
              </h3>
              <p>
                {review.customer.legalName}
                {review.customer.phone ? ` · ${review.customer.phone}` : ""} · {osStatusLabel(review.serviceOrder.status)} ·{" "}
                {qualityPhaseLabel(review.phase)}
              </p>
            </div>
            <div className="button-row" style={{ marginTop: 0 }}>
              {review.phase === "rework_issued" && review.serviceOrder.status === "awaiting_quality" && canWrite ? (
                <button className="button" disabled={saving} onClick={() => void startReturn()} type="button">
                  Revisar retorno
                </button>
              ) : null}
              <button
                className="button-secondary"
                onClick={() => {
                  if (isMobile) {
                    navigateWithinWorkspace("/quality");
                    return;
                  }
                  if (currentTabId) closeWorkspace(currentTabId);
                }}
                type="button"
              >
                Voltar
              </button>
              <RowOverflowMenu
                items={buildQualityRowMenu({
                  id: review.serviceOrder.id,
                  orderNo: review.serviceOrder.orderNo,
                  productionOrderId: review.productionOrder.id,
                })}
                label={`Opções da OP ${review.serviceOrder.orderNo}`}
              />
            </div>
          </div>

          {review.phase === "rework_issued" && review.serviceOrder.status === "awaiting_quality" ? (
            <p className="field__hint">A refação voltou da esteira. Clique em Revisar retorno para aprovar ou reprovar de novo.</p>
          ) : null}
          {review.phase === "rework_issued" && review.serviceOrder.status !== "awaiting_quality" ? (
            <p className="field__hint">
              A sacola voltou para Pegar sacola. A revisão do retorno abre depois do Terminei.
            </p>
          ) : null}
          {review.phase === "ready" ? (
            <p className="field__hint">Todas as peças desta OS foram aprovadas.</p>
          ) : null}

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th title="Sequência">S</th>
                  <th>Produto</th>
                  <th>Serviço</th>
                  <th>Detalhar o serviço</th>
                  <th>Marca / modelo / série</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {review.items.map((item, index) => {
                  const equipment = [item.brand, item.model, item.serialNo].filter((part) => part.trim()).join(" · ");
                  return (
                    <tr key={item.id}>
                      <td className="os-item-seq" title={`Sequência ${index + 1}`}>
                        {index + 1}
                      </td>
                      <td>
                        <HoverPeek text={item.itemType}>{item.itemType}</HoverPeek>
                      </td>
                      <td>
                        <HoverPeek text={item.description}>{item.description}</HoverPeek>
                      </td>
                      <td>
                        <HoverPeek text={item.complement}>
                          <div className="qc-work">{item.complement || "—"}</div>
                        </HoverPeek>
                      </td>
                      <td className="table-subtle">{equipment || "—"}</td>
                      <td>
                        {qualityDecisionLabel(item.decision)}
                        {item.reason ? <div className="table-subtle">{item.reason}</div> : null}
                      </td>
                      <td>
                        {item.canDecide && canWrite ? (
                          <div className="qc-actions">
                            <button
                              className="button qc-approve"
                              disabled={saving}
                              onClick={() => void decide(item.id, "approved")}
                              type="button"
                            >
                              Aprovado
                            </button>
                            <button
                              className="button-secondary qc-reject"
                              disabled={saving}
                              onClick={() => {
                                setRejectingId(item.id);
                                setRejectReason(item.reason ?? "");
                              }}
                              type="button"
                            >
                              Reprovado
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                        {rejectingId === item.id ? (
                          <div className="qc-reason">
                            <textarea
                              placeholder="Motivo da reprovação"
                              required
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                            />
                            <div className="button-row">
                              <button
                                className="button"
                                disabled={saving || !rejectReason.trim()}
                                onClick={() => void decide(item.id, "rejected", rejectReason)}
                                type="button"
                              >
                                Confirmar reprovação
                              </button>
                              <button className="button-ghost" onClick={() => setRejectingId(null)} type="button">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </>
  );
}
