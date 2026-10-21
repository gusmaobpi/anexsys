"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceRegistration } from "@/components/app-shell/workspace-manager";
import { useWorkspacePane } from "@/components/app-shell/workspace-pane";
import {
  applyPickBagListFilters,
  buildPickBagExcelCsv,
  pickBagAction,
  type PickBagRecord,
} from "@/components/production/pick-bag-list";
import { useSession } from "@/components/providers/session-provider";
import { printProductionOrderDocument, type OpPrintView } from "@/components/service-orders/os-documents";
import {
  beltActionLabel,
  canRunFloorAction,
  floorActionSuccessMessage,
} from "@/components/service-orders/os-floor";
import { osStatusLabel } from "@/components/service-orders/os-list";
import { canSendToProof, proofActionLabel, proofActionSuccessMessage } from "@/components/service-orders/os-proof";
import { type OsFinancialSummary } from "@/components/service-orders/os-pay-panel";
import { osOpHeaderTerm } from "@/components/service-orders/service-order-workspace-view-model";
import { CadastroListPanel } from "@/components/ui/cadastro-list-panel";
import { type RowMenuItem } from "@/components/ui/row-overflow-menu";
import { WorkspaceFlash, describeWorkspaceError } from "@/components/ui/workspace-flash";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function PickBagWorkspace() {
  const pane = useWorkspacePane();
  const { session, hasAnyPermission, apiJson } = useSession();
  const canRead = hasAnyPermission("production_orders.read", "service_orders.read");
  const canWriteOs = hasAnyPermission("service_orders.write");
  const canWriteProduction = hasAnyPermission("production_orders.write");
  const canReadProduction = hasAnyPermission("production_orders.read");
  const canAct = canWriteOs || canWriteProduction;
  const companyName = session?.companies.find((company) => company.tenantId === session?.tenantId)?.displayName ?? "ANEXSYS";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<PickBagRecord[]>([]);

  const { currentTabId } = useWorkspaceRegistration({
    label: "Pegar sacola",
    subtitle: "Esteira de produção",
  });
  const isActivePane = !pane || pane.tabId === currentTabId;

  const loadList = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiJson<PickBagRecord[]>("/service-orders");
      setRecords(response.filter((record) => pickBagAction(record) !== null));
    } catch (error) {
      setMessage(describeWorkspaceError(error, "A lista de producao nao pode ser carregada."));
    } finally {
      setLoading(false);
    }
  }, [apiJson, canRead]);

  useEffect(() => {
    if (!isActivePane) {
      return;
    }
    void loadList();
  }, [isActivePane, loadList, session?.activeBranchId, session?.tenantId]);

  const advanceFloor = useCallback(
    async (row: PickBagRecord) => {
      const action = pickBagAction(row);
      if (!action || saving) {
        return;
      }
      if (
        !canRunFloorAction(action, {
          canWriteOs,
          canWriteProduction,
          canWriteQuality: false,
        })
      ) {
        setMessage("Você não tem permissão para este passo de produção.");
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson(`/service-orders/${row.id}/floor-advance`, { method: "POST" });
        await loadList();
        setMessage(floorActionSuccessMessage(action, row.orderNo));
      } catch (error) {
        setMessage(describeWorkspaceError(error, "O passo de produção não pôde ser avançado."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canWriteOs, canWriteProduction, loadList, saving],
  );

  const sendToProof = useCallback(
    async (row: PickBagRecord) => {
      if (saving || !canSendToProof(row.status, Boolean(row.bagClosed))) {
        return;
      }
      if (!canAct) {
        setMessage("Você não tem permissão para enviar esta OS para prova.");
        return;
      }
      setSaving(true);
      setMessage(null);
      try {
        await apiJson(`/service-orders/${row.id}/send-to-proof`, { method: "POST" });
        await loadList();
        setMessage(proofActionSuccessMessage("send_to_proof", row.orderNo));
      } catch (error) {
        setMessage(describeWorkspaceError(error, "A OS não pôde ser enviada para prova."));
      } finally {
        setSaving(false);
      }
    },
    [apiJson, canAct, loadList, saving],
  );

  const reprintProductionOrder = useCallback(
    async (serviceOrderId: string) => {
      try {
        const existing = await apiJson<{ productionOrder: { id: string } }>(
          `/service-orders/${serviceOrderId}/production-order`,
        );
        const view = await apiJson<OpPrintView>(`/production-orders/${existing.productionOrder.id}/print-view`);
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

  const buildRowMenu = useCallback(
    (row: PickBagRecord): RowMenuItem[] => [
      ...(canSendToProof(row.status, Boolean(row.bagClosed)) && canAct
        ? [
            {
              id: "send-to-proof",
              label: proofActionLabel("send_to_proof"),
              onSelect: () => {
                void sendToProof(row);
              },
            },
          ]
        : []),
      {
        id: "print",
        label: "Imprimir",
        children: [
          {
            id: "print-op",
            label: "Ordem de produção",
            disabled: !canReadProduction && !canWriteProduction,
            onSelect: () => {
              void reprintProductionOrder(row.id);
            },
          },
        ],
      },
    ],
    [canAct, canReadProduction, canWriteProduction, reprintProductionOrder, sendToProof],
  );

  if (!canRead) {
    return (
      <section className="mini-card">
        <h3>Pegar sacola indisponível</h3>
        <p>Você não possui acesso à esteira de produção no contexto atual.</p>
      </section>
    );
  }

  return (
    <>
      {message ? <WorkspaceFlash message={message} /> : null}
      <p className="os-rule-banner">
        Esta é a esteira manual. Quem não usa QR avança os passos aqui. A leitura do QR, quando existir, dispara o mesmo
        passo. Uma sacola por vez nesta Filial.
      </p>
      <CadastroListPanel
        applyFilters={applyPickBagListFilters}
        buildExcelCsv={buildPickBagExcelCsv}
        canWrite={canAct && !saving}
        columnStorageKey="anexsys.frontend.pick-bag.grid-columns.v2"
        columns={[
          {
            id: "name",
            label: "OS",
            locked: true,
            render: (row) => <strong>{row.orderNo}</strong>,
          },
          { id: "delivery", label: "Entrega", render: (row) => formatDate(row.promisedDeliveryDate) },
          {
            id: "status",
            label: "Status",
            render: (row) => <span className="status-chip status-chip--active">{osStatusLabel(row.status)}</span>,
          },
        ]}
        defaultColumnIds={["name", "delivery", "status"]}
        editLabel="Pegar sacola"
        editLabelForRow={(row) => {
          const action = pickBagAction(row);
          return action ? beltActionLabel(action) : "Pegar sacola";
        }}
        emptyFilters={{ name: "", status: "" }}
        emptyMessage="Nenhuma OS em aberto para pegar nesta Filial."
        excelFileName="pegar-sacola.csv"
        filterFields={[
          { id: "name", label: "Número", lookup: true, placeholder: "Número da OS" },
          {
            id: "status",
            kind: "select",
            label: "Status",
            options: [
              { value: "", label: "Todos" },
              { value: "open", label: "Aberta" },
              { value: "in_production", label: "Em produção" },
              { value: "quality", label: "Controle de qualidade" },
              { value: "in_rework", label: "Em refação" },
            ],
          },
        ]}
        hideCreate
        loading={loading}
        onCreate={() => undefined}
        onEdit={(row) => {
          void advanceFloor(row);
        }}
        records={records}
        rowLabel={(row) => row.orderNo}
        rowMenu={buildRowMenu}
        searchKey="name"
        searchOptions={records.map((record) => ({
          id: record.id,
          label: record.orderNo,
          hint: osStatusLabel(record.status),
        }))}
        searchPlaceholder="Buscar por número da OS"
        title="Pegar sacola"
      />
    </>
  );
}
