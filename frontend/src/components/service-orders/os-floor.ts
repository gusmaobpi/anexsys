export type FloorAction = "pick_up" | "finish_production" | "open_review" | "pick_up_rework" | "finish_rework";

export function nextFloorAction(status: string, bagClosed: boolean): FloorAction | null {
  if (
    !bagClosed ||
    status === "cancelled" ||
    status === "awaiting_proof" ||
    status === "ready_for_pickup" ||
    status === "picked_up"
  ) {
    return null;
  }
  if (status === "open" || status === "approved") {
    return "pick_up";
  }
  if (status === "in_production") {
    return "finish_production";
  }
  if (status === "awaiting_quality") {
    return "open_review";
  }
  if (status === "quality") {
    return "pick_up_rework";
  }
  if (status === "in_rework") {
    return "finish_rework";
  }
  return null;
}

export function floorActionLabel(action: FloorAction) {
  if (action === "pick_up") return "Pegar sacola";
  if (action === "finish_production") return "Terminei";
  if (action === "open_review") return "Abrir revisão";
  if (action === "pick_up_rework") return "Pegar refação";
  return "Terminei a refação";
}

export function beltActionLabel(action: FloorAction) {
  if (action === "pick_up" || action === "pick_up_rework") return "Pegar sacola";
  if (action === "finish_production" || action === "finish_rework") return "Terminei";
  return floorActionLabel(action);
}

export function isProductionFloorAction(action: FloorAction | null): action is Exclude<FloorAction, "open_review"> {
  return action !== null && action !== "open_review";
}

export function productionFloorAction(status: string, bagClosed: boolean): Exclude<FloorAction, "open_review"> | null {
  const action = nextFloorAction(status, bagClosed);
  return isProductionFloorAction(action) ? action : null;
}

export function floorActionHint(action: FloorAction) {
  if (action === "pick_up") return "Pegue a sacola da esteira. A OS vai para Em produção. A leitura do QR, quando existir, dispara o mesmo passo.";
  if (action === "finish_production") return "Termine cada item. A OP vai para Aguardando qualidade quando o último item terminar.";
  if (action === "open_review") return "O revisor abre a sacola no Controle de qualidade.";
  if (action === "pick_up_rework") return "Pegue as peças reprovadas para refação.";
  return "Termine cada item da refação. A OP volta para Aguardando qualidade quando o último item terminar.";
}

export function floorActionSuccessMessage(action: FloorAction, orderNo: string) {
  if (action === "pick_up") return `OS ${orderNo} em produção. Termine item a item.`;
  if (action === "finish_production") return `OS ${orderNo} aguardando controle de qualidade.`;
  if (action === "open_review") return `OS ${orderNo} em Controle de qualidade. Revise peça a peça.`;
  if (action === "pick_up_rework") return `OS ${orderNo} em refação. Termine item a item.`;
  return `OS ${orderNo} voltou para Aguardando controle de qualidade.`;
}

export function canRunFloorAction(
  action: FloorAction,
  permissions: { canWriteOs: boolean; canWriteProduction: boolean; canWriteQuality: boolean },
) {
  if (action === "open_review") {
    return permissions.canWriteOs || permissions.canWriteQuality;
  }
  return permissions.canWriteOs || permissions.canWriteProduction;
}

export function canReopenBagAfterFloor(status: string) {
  return status === "open" || status === "approved";
}
