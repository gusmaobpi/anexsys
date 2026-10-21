import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPickBagListFilters,
  belongsToPickBagQueue,
  buildPickBagExcelCsv,
  pickBagAction,
} from '../../frontend/src/components/production/pick-bag-list';
import { floorActionHint, productionFloorAction } from '../../frontend/src/components/service-orders/os-floor';

test('pick bag queue keeps production steps and skips quality review', () => {
  assert.equal(pickBagAction({ status: 'open', bagClosed: false }), null);
  assert.equal(pickBagAction({ status: 'open', bagClosed: true }), 'pick_up');
  assert.equal(pickBagAction({ status: 'in_production', bagClosed: true }), 'finish_production');
  assert.equal(productionFloorAction('awaiting_quality', true), null);
  assert.equal(belongsToPickBagQueue({ status: 'awaiting_quality', bagClosed: true }), false);
  assert.equal(pickBagAction({ status: 'awaiting_proof', bagClosed: true }), null);
  assert.equal(belongsToPickBagQueue({ status: 'awaiting_proof', bagClosed: true }), false);
  assert.equal(pickBagAction({ status: 'quality', bagClosed: true }), null);
  assert.equal(pickBagAction({ status: 'quality', bagClosed: true, reworkOnBelt: true }), 'pick_up_rework');
  assert.equal(pickBagAction({ status: 'in_rework', bagClosed: true }), 'finish_rework');
  assert.equal(pickBagAction({ status: 'ready_for_pickup', bagClosed: true }), null);
  assert.equal(pickBagAction({ status: 'picked_up', bagClosed: true }), null);
});

test('pick bag filters by number and status after queue rule', () => {
  const records = [
    { id: '1', orderNo: 'AAA000001', status: 'open', promisedDeliveryDate: '2026-10-10', bagClosed: true },
    { id: '2', orderNo: 'AAA000002', status: 'in_production', promisedDeliveryDate: '2026-10-12', bagClosed: true },
    { id: '3', orderNo: 'AAA000003', status: 'awaiting_quality', promisedDeliveryDate: '2026-10-13', bagClosed: true },
  ];
  assert.deepEqual(applyPickBagListFilters(records, { name: '', status: '' }).map((item) => item.id), ['1', '2']);
  assert.deepEqual(applyPickBagListFilters(records, { name: '000002', status: '' }).map((item) => item.id), ['2']);
  assert.deepEqual(applyPickBagListFilters(records, { name: '', status: 'open' }).map((item) => item.id), ['1']);
  assert.match(buildPickBagExcelCsv([records[0]]), /Aberta/);
  assert.equal(/Passo/.test(buildPickBagExcelCsv([records[0]])), false);
  assert.match(floorActionHint('pick_up'), /mesmo passo/);
  assert.equal(/provisório/i.test(floorActionHint('finish_production')), false);
});
