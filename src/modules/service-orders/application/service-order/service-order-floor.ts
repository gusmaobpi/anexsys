import { ServiceOrderStatus } from 'src/shared/domain/enums';

export type FloorAction = 'pick_up' | 'finish_production' | 'open_review' | 'pick_up_rework' | 'finish_rework';

const BUSY_FLOOR_STATUSES: ServiceOrderStatus[] = [ServiceOrderStatus.IN_PRODUCTION, ServiceOrderStatus.IN_REWORK];

export function nextFloorAction(status: string, bagClosed: boolean): FloorAction | null {
  if (
    !bagClosed ||
    status === ServiceOrderStatus.CANCELLED ||
    status === ServiceOrderStatus.AWAITING_PROOF ||
    status === ServiceOrderStatus.READY_FOR_PICKUP ||
    status === ServiceOrderStatus.PICKED_UP
  ) {
    return null;
  }
  if (status === ServiceOrderStatus.OPEN || status === ServiceOrderStatus.APPROVED) {
    return 'pick_up';
  }
  if (status === ServiceOrderStatus.IN_PRODUCTION) {
    return 'finish_production';
  }
  if (status === ServiceOrderStatus.AWAITING_QUALITY) {
    return 'open_review';
  }
  if (status === ServiceOrderStatus.QUALITY) {
    return 'pick_up_rework';
  }
  if (status === ServiceOrderStatus.IN_REWORK) {
    return 'finish_rework';
  }
  return null;
}

export function floorActionLabel(action: FloorAction): string {
  if (action === 'pick_up') return 'Pegar sacola';
  if (action === 'finish_production') return 'Terminei';
  if (action === 'open_review') return 'Abrir revisão';
  if (action === 'pick_up_rework') return 'Pegar refação';
  return 'Terminei a refação';
}

export function beltFloorActionLabel(action: FloorAction): string {
  if (action === 'pick_up' || action === 'pick_up_rework') return 'Pegar sacola';
  if (action === 'finish_production' || action === 'finish_rework') return 'Terminei';
  return floorActionLabel(action);
}

export function floorActionResultStatus(action: FloorAction): ServiceOrderStatus {
  if (action === 'pick_up') {
    return ServiceOrderStatus.IN_PRODUCTION;
  }
  if (action === 'finish_production' || action === 'finish_rework') {
    return ServiceOrderStatus.AWAITING_QUALITY;
  }
  if (action === 'open_review') {
    return ServiceOrderStatus.QUALITY;
  }
  return ServiceOrderStatus.IN_REWORK;
}

export function floorActionAudit(action: FloorAction): string {
  return `service_order.floor.${action}`;
}

export function isBusyFloorStatus(status: string): boolean {
  return BUSY_FLOOR_STATUSES.includes(status as ServiceOrderStatus);
}

export function canReopenBagAfterFloor(status: string): boolean {
  return status === ServiceOrderStatus.OPEN || status === ServiceOrderStatus.APPROVED;
}

export function isItemFinishAction(action: FloorAction): boolean {
  return action === 'finish_production' || action === 'finish_rework';
}

export function measuredExecutionMinutes(startedAt: Date, finishedAt: Date, quantity: number): number {
  const units = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const elapsedMinutes = Math.max(0, finishedAt.getTime() - startedAt.getTime()) / 60000;
  return Math.max(1, Math.round(elapsedMinutes / units));
}
