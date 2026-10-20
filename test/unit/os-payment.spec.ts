import assert from 'node:assert/strict';
import test from 'node:test';
import {
  osCanOpenPay,
  osHasOutstandingBalance,
  osChargeWatchExpired,
  osPayCanSend,
  osPaymentHistoryLabel,
  osPaymentMethodLabel,
  osShouldCloseOrderTab,
  osShowsFaltaPagamento,
} from '../../frontend/src/components/service-orders/os-payment';
import {
  assertServiceOrderCanReceive,
  osGroupPaymentFromMembers,
  osHasPendingProcessSibling,
  osListPaymentFromTotals,
  osPayLockedOnParent,
} from '../../src/modules/service-orders/application/service-order/service-order-finance';
import { pickupBlockedByOutstanding } from '../../src/modules/service-orders/application/service-order/service-order-pickup';

test('enables payment only after a side-by-side option, and keeps the card terminal rule', () => {
  const base = { outstanding: 80, pendingCharge: false, busy: false, terminalReady: true };
  assert.equal(osPayCanSend({ ...base, channel: "", option: "" }), false);
  assert.equal(osPayCanSend({ ...base, channel: "card", option: "" }), false);
  assert.equal(osPayCanSend({ ...base, channel: "card", option: "credit", terminalReady: false }), false);
  assert.equal(osPayCanSend({ ...base, channel: "card", option: "debit" }), true);
  assert.equal(osPayCanSend({ ...base, channel: "card", option: "pix", pendingCharge: true }), false);
  assert.equal(osPayCanSend({ ...base, channel: "internal", option: "cash", terminalReady: false }), false);
  assert.equal(osPayCanSend({ ...base, channel: "internal", option: "cash", terminalReady: false, reason: "Cliente pagou no caixa" }), true);
  assert.equal(osPayCanSend({ ...base, channel: "internal", option: "credit", reason: "Maquininha fora" }), true);
  assert.equal(osPayCanSend({ ...base, channel: "internal", option: "debit", reason: "Débito no caixa" }), true);
  assert.equal(osPayCanSend({ ...base, channel: "internal", option: "pix", reason: "Pix no celular" }), true);
  assert.equal(
    osPaymentHistoryLabel({
      paymentMethod: "card",
      informedModality: "credit",
      paymentProvider: null,
      status: "received",
      manualReason: "Maquininha fora",
    }),
    "Interno · Crédito · Maquininha fora",
  );
  assert.equal(
    osPaymentHistoryLabel({
      paymentMethod: "card",
      informedModality: "debit",
      paymentProvider: null,
      status: "received",
      manualReason: "Débito no caixa",
    }),
    "Interno · Débito · Débito no caixa",
  );
  assert.equal(
    osPaymentHistoryLabel({
      paymentMethod: "cash",
      paymentProvider: null,
      status: "reversed",
      manualReason: "Caixa",
      reversalReason: "Cliente desistiu",
    }),
    "Interno · Dinheiro · Caixa · Estornado · Cliente desistiu",
  );
  assert.equal(
    osPaymentHistoryLabel({ paymentMethod: "card", informedModality: "credit", paymentProvider: "cielo", status: "pending" }),
    "Cartão · Crédito · Aguardando maquininha",
  );
});

test('stops following the card machine when the wait time ends', () => {
  assert.equal(osChargeWatchExpired(1_000, 1_000 + 3 * 60 * 1000 - 1), false);
  assert.equal(osChargeWatchExpired(1_000, 1_000 + 3 * 60 * 1000), true);
  assert.equal(osChargeWatchExpired(0, 59_999, 60_000), false);
  assert.equal(osChargeWatchExpired(0, 60_000, 60_000), true);
});

test('closes the OS tab only when the balance is zero and payment was opened from the form', () => {
  assert.equal(osShouldCloseOrderTab({ outstandingBalance: '0.00', openCharge: null, fromList: false }), true);
  assert.equal(osShouldCloseOrderTab({ outstandingBalance: '0.00', openCharge: null, fromList: true }), false);
  assert.equal(osShouldCloseOrderTab({ outstandingBalance: '40.00', openCharge: null, fromList: false }), false);
  assert.equal(
    osShouldCloseOrderTab({ outstandingBalance: '0.00', openCharge: { status: 'pending' }, fromList: false }),
    false,
  );
});

test('labels counter payment methods without calling a gateway', () => {
  assert.equal(osPaymentMethodLabel('cash'), 'Dinheiro');
  assert.equal(osPaymentMethodLabel('card'), 'Cartão');
  assert.equal(osPaymentMethodLabel('pix'), 'Pix');
  assert.equal(osPaymentMethodLabel('bank_transfer'), 'Transferência');
  assert.equal(osPaymentMethodLabel('other'), 'Outro');
});

test('Falta pagamento is a warning for open balance, not a status', () => {
  assert.equal(osShowsFaltaPagamento({ outstandingBalance: '80.00', paymentStatus: 'pending' }), true);
  assert.equal(osShowsFaltaPagamento({ outstandingBalance: '20.00', paymentStatus: 'partial' }), true);
  assert.equal(osShowsFaltaPagamento({ outstandingBalance: '0.00', paymentStatus: 'paid' }), false);
  assert.equal(osHasOutstandingBalance({ outstandingBalance: '0.01' }), true);
});

test('disables Pagar after the OS is quitada', () => {
  assert.equal(osCanOpenPay({ status: 'open', paymentStatus: 'pending' }), true);
  assert.equal(osCanOpenPay({ status: 'open', paymentStatus: 'partial' }), true);
  assert.equal(osCanOpenPay({ status: 'open', paymentStatus: 'paid' }), false);
  assert.equal(osCanOpenPay({ status: 'cancelled', paymentStatus: 'pending' }), false);
  assert.equal(osCanOpenPay({ status: 'ready_for_pickup', paymentStatus: 'pending', payLockedOnParent: true }), false);
  assert.equal(osCanOpenPay({ status: 'open', paymentStatus: 'pending', payLockedOnParent: false }), true);
  assert.deepEqual(osListPaymentFromTotals('80.00', 0), {
    amountPaid: '0.00',
    outstandingBalance: '80.00',
    paymentStatus: 'pending',
  });
  assert.equal(osListPaymentFromTotals('80.00', 20).paymentStatus, 'partial');
  assert.equal(osListPaymentFromTotals('80.00', 80).paymentStatus, 'paid');
});

test('keeps Pagar on the mother and hides it on the counter child', () => {
  const members = [
    { id: 'so-1', totalValue: '80.00', versionSuffix: null, returnKind: null, status: 'ready_for_pickup' },
    { id: 'so-c', totalValue: '0.00', versionSuffix: 'C', returnKind: 'counter', status: 'open' },
  ];
  const paidById = new Map<string, number>([['so-1', 50]]);
  assert.equal(osHasPendingProcessSibling('so-1', members), true);
  assert.equal(osPayLockedOnParent({ returnKind: null, versionSuffix: null, hasPendingProcessSibling: true }), false);
  assert.equal(osPayLockedOnParent({ returnKind: 'counter', versionSuffix: 'C' }), true);
  assert.equal(osCanOpenPay({ status: 'ready_for_pickup', paymentStatus: 'partial', payLockedOnParent: false }), true);
  assert.equal(osCanOpenPay({ status: 'open', paymentStatus: 'pending', payLockedOnParent: true }), false);
  assert.equal(osGroupPaymentFromMembers(members, paidById).outstandingBalance, '30.00');
  assert.doesNotThrow(() => assertServiceOrderCanReceive({ returnKind: null, versionSuffix: null }));
  assert.throws(() => assertServiceOrderCanReceive({ returnKind: 'counter', versionSuffix: 'C' }), /OS mãe/);
});

test('delivery stays open unless the Conta blocks unpaid pickup', () => {
  assert.equal(pickupBlockedByOutstanding({ blockDeliveryWithOutstandingBalance: false, outstandingBalance: 80 }), false);
  assert.equal(pickupBlockedByOutstanding({ blockDeliveryWithOutstandingBalance: true, outstandingBalance: 0 }), false);
  assert.equal(pickupBlockedByOutstanding({ blockDeliveryWithOutstandingBalance: true, outstandingBalance: 10 }), true);
});
