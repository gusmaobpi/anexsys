import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClientReturnPreview,
  calendarDaysBetween,
  classifyClientReturn,
  osOpHeaderTerm,
  osReturnKindLabel,
  todayDateOnly,
} from '../../src/modules/service-orders/application/service-order/service-order-return';

test('classifies client return by days since pickup against tenant periods', () => {
  assert.equal(classifyClientReturn(0, 7, 90), 'reconserto');
  assert.equal(classifyClientReturn(7, 7, 90), 'reconserto');
  assert.equal(classifyClientReturn(8, 7, 90), 'warranty');
  assert.equal(classifyClientReturn(90, 7, 90), 'warranty');
  assert.equal(classifyClientReturn(91, 7, 90), 'charged');
});

test('when both tenant periods are 7 days, day 8 is charged and warranty never applies', () => {
  assert.equal(classifyClientReturn(7, 7, 7), 'reconserto');
  assert.equal(classifyClientReturn(8, 7, 7), 'charged');
});

test('counts calendar days between date-only strings', () => {
  assert.equal(calendarDaysBetween('2026-10-01', '2026-10-08'), 7);
  assert.equal(todayDateOnly(new Date('2026-10-08T18:22:00.000Z')), '2026-10-08');
});

test('builds a preview from the pickup date', () => {
  const preview = buildClientReturnPreview('2026-10-01', 7, 90, new Date('2026-10-08T12:00:00.000Z'));
  assert.equal(preview.kind, 'reconserto');
  assert.equal(preview.daysSincePickup, 7);
});

test('labels return kinds and OP header terms', () => {
  assert.equal(osReturnKindLabel('reconserto'), 'Reconserto');
  assert.equal(osReturnKindLabel('warranty'), 'Em garantia');
  assert.equal(osReturnKindLabel('charged'), 'Cobrada');
  assert.equal(osReturnKindLabel('counter'), 'Refação no balcão');
  assert.equal(osOpHeaderTerm({ returnKind: 'reconserto', paymentStatus: 'paid' }), 'Reconserto');
  assert.equal(osOpHeaderTerm({ returnKind: 'warranty', paymentStatus: 'pending' }), 'Em garantia');
  assert.equal(osOpHeaderTerm({ returnKind: 'counter', paymentStatus: 'pending' }), 'Refação no balcão');
  assert.equal(osOpHeaderTerm({ returnKind: 'charged', paymentStatus: 'paid' }), 'Pago');
  assert.equal(osOpHeaderTerm({ returnKind: null, paymentStatus: 'pending' }), 'Saldo em aberto');
});
