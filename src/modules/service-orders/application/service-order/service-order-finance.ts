import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { isProcessRow } from './service-order-version';

export type OsListPaymentStatus = 'pending' | 'partial' | 'paid';

export function osListPaymentFromTotals(
  totalValue: string | number | null | undefined,
  amountPaid: number,
): { amountPaid: string; outstandingBalance: string; paymentStatus: OsListPaymentStatus } {
  const total = Number(totalValue ?? 0);
  const paid = Number.isFinite(amountPaid) ? amountPaid : 0;
  const outstanding = Math.max(Number((total - paid).toFixed(2)), 0);
  return {
    amountPaid: paid.toFixed(2),
    outstandingBalance: outstanding.toFixed(2),
    paymentStatus: outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending',
  };
}

export function osGroupPaymentFromMembers(
  members: Array<{ id: string; totalValue?: string | number | null }>,
  paidById: Map<string, number>,
  heldById?: Map<string, number>,
) {
  const total = members.reduce((sum, member) => sum + Number(member.totalValue ?? 0), 0);
  const suspended = members.reduce((sum, member) => sum + (heldById?.get(member.id) ?? 0), 0);
  const chargeable = Math.max(Number((total - suspended).toFixed(2)), 0);
  const paid = members.reduce((sum, member) => sum + (paidById.get(member.id) ?? 0), 0);
  return osListPaymentFromTotals(chargeable, paid);
}

export function osHasPendingProcessSibling(
  selfId: string,
  members: Array<{ id: string; versionSuffix?: string | null; returnKind?: string | null; status?: string | null }>,
) {
  return members.some(
    (member) => member.id !== selfId && member.status !== 'cancelled' && isProcessRow(member),
  );
}

export function isCounterFinancialChild(row?: { returnKind?: string | null; versionSuffix?: string | null } | null) {
  if (!row) {
    return false;
  }
  return row.returnKind === 'counter' || String(row.versionSuffix ?? '').trim().toUpperCase() === 'C';
}

export function osPayLockedOnParent(input: {
  isProcessRow?: boolean;
  hasPendingProcessSibling?: boolean;
  returnKind?: string | null;
  versionSuffix?: string | null;
}) {
  return isCounterFinancialChild(input);
}

export function assertServiceOrderCanReceive(order: { returnKind?: string | null; versionSuffix?: string | null }) {
  if (isCounterFinancialChild(order)) {
    throw new DomainValidationError('O recebimento fica na OS mãe. Esta OS não tem título.');
  }
}
