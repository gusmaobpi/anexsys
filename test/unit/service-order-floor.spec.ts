import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReopenBagAfterFloor,
  floorActionResultStatus,
  measuredExecutionMinutes,
  nextFloorAction,
} from '../../src/modules/service-orders/application/service-order/service-order-floor';

test('floor steps follow the production sequence for the manual Pegar sacola path', () => {
  assert.equal(nextFloorAction('open', false), null);
  assert.equal(nextFloorAction('open', true), 'pick_up');
  assert.equal(floorActionResultStatus('pick_up'), 'in_production');
  assert.equal(nextFloorAction('in_production', true), 'finish_production');
  assert.equal(floorActionResultStatus('finish_production'), 'awaiting_quality');
  assert.equal(nextFloorAction('awaiting_quality', true), 'open_review');
  assert.equal(floorActionResultStatus('open_review'), 'quality');
  assert.equal(nextFloorAction('quality', true), 'pick_up_rework');
  assert.equal(floorActionResultStatus('pick_up_rework'), 'in_rework');
  assert.equal(nextFloorAction('in_rework', true), 'finish_rework');
  assert.equal(floorActionResultStatus('finish_rework'), 'awaiting_quality');
  assert.equal(nextFloorAction('awaiting_proof', true), null);
  assert.equal(nextFloorAction('ready_for_pickup', true), null);
  assert.equal(nextFloorAction('picked_up', true), null);
});

test('measures the last execution from the previous click, per unit', () => {
  const start = new Date('2026-10-27T12:00:00.000Z');
  assert.equal(measuredExecutionMinutes(start, new Date('2026-10-27T12:01:30.000Z'), 1), 2);
  assert.equal(measuredExecutionMinutes(start, new Date('2026-10-27T12:00:20.000Z'), 1), 1);
  assert.equal(measuredExecutionMinutes(start, new Date('2026-10-27T12:10:00.000Z'), 2), 5);
});

test('blocks reopening the bag after production started', () => {
  assert.equal(canReopenBagAfterFloor('open'), true);
  assert.equal(canReopenBagAfterFloor('in_production'), false);
  assert.equal(canReopenBagAfterFloor('quality'), false);
});
