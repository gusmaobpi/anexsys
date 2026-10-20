import { ServiceOrderReturnKind } from 'src/shared/domain/enums';

export function parseDateOnlyUtc(value: string): Date {
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

export function todayDateOnly(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function calendarDaysBetween(fromDate: string, toDate: string): number {
  const from = parseDateOnlyUtc(fromDate);
  const to = parseDateOnlyUtc(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function classifyClientReturn(
  daysSincePickup: number,
  adjustmentPeriodDays: number,
  executionPeriodDays: number,
): ServiceOrderReturnKind {
  if (daysSincePickup <= adjustmentPeriodDays) {
    return ServiceOrderReturnKind.RECONSERTO;
  }
  if (daysSincePickup <= executionPeriodDays) {
    return ServiceOrderReturnKind.WARRANTY;
  }
  return ServiceOrderReturnKind.CHARGED;
}

export function osReturnKindLabel(kind: string | null | undefined): string | null {
  if (kind === ServiceOrderReturnKind.RECONSERTO) {
    return 'Reconserto';
  }
  if (kind === ServiceOrderReturnKind.WARRANTY) {
    return 'Em garantia';
  }
  if (kind === ServiceOrderReturnKind.CHARGED) {
    return 'Cobrada';
  }
  if (kind === ServiceOrderReturnKind.COUNTER) {
    return 'Refação no balcão';
  }
  return null;
}

export function osOpHeaderTerm(input: {
  returnKind?: string | null;
  paymentStatus?: string | null;
}): string {
  if (input.returnKind === ServiceOrderReturnKind.RECONSERTO) {
    return 'Reconserto';
  }
  if (input.returnKind === ServiceOrderReturnKind.WARRANTY) {
    return 'Em garantia';
  }
  if (input.returnKind === ServiceOrderReturnKind.COUNTER) {
    return 'Refação no balcão';
  }
  return input.paymentStatus === 'paid' ? 'Pago' : 'Saldo em aberto';
}

export function buildClientReturnPreview(
  actualPickupDate: string,
  adjustmentPeriodDays: number,
  executionPeriodDays: number,
  now = new Date(),
) {
  const daysSincePickup = calendarDaysBetween(actualPickupDate, todayDateOnly(now));
  const kind = classifyClientReturn(daysSincePickup, adjustmentPeriodDays, executionPeriodDays);
  return {
    kind,
    daysSincePickup,
    adjustmentPeriodDays,
    executionPeriodDays,
  };
}
