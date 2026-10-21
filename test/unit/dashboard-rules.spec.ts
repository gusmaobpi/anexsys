import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closingTime,
  deadlineInstant,
  delayKind,
  gradeMinutes,
  summarizeProduction,
} from '../../src/modules/dashboard/application/dashboard-rules';

test('saturday closes at 14:00 and other days at 18:00 when the OS has no time', () => {
  assert.equal(closingTime('2026-10-24'), '14:00');
  assert.equal(closingTime('2026-10-21'), '18:00');
  const deadline = deadlineInstant('2026-10-21', null);
  assert.equal(deadline.toISOString(), '2026-10-21T21:00:00.000Z');
});

test('delay alert opens inside the lead window and stays after the deadline', () => {
  const deadline = deadlineInstant('2026-10-21', '18:00');
  const twoHoursBefore = new Date('2026-10-21T19:00:00.000Z');
  const after = new Date('2026-10-21T22:00:00.000Z');
  const early = new Date('2026-10-21T12:00:00.000Z');
  assert.equal(delayKind('in_production', deadline, twoHoursBefore, 2), 'soon');
  assert.equal(delayKind('quality', deadline, after, 2), 'late');
  assert.equal(delayKind('open', deadline, early, 2), null);
  assert.equal(delayKind('ready_for_pickup', deadline, after, 2), null);
  assert.equal(delayKind('picked_up', deadline, after, 2), null);
});

test('grade minutes follow the Conta parameter', () => {
  assert.equal(gradeMinutes([30, 70, 90, 180], 2), 70);
  assert.equal(gradeMinutes([30, 60, 90, 180], null), null);
});

test('production summary counts pieces and grades per person', () => {
  const rows = summarizeProduction([
    { userId: 'a', displayName: 'Ana', serviceOrderId: 'so-1', orderNo: 'AAA000001', difficultyGrade: 2, pieces: 3 },
    { userId: 'a', displayName: 'Ana', serviceOrderId: 'so-2', orderNo: 'AAA000002', difficultyGrade: null, pieces: 1 },
    { userId: 'b', displayName: 'Bia', serviceOrderId: 'so-3', orderNo: 'AAA000003', difficultyGrade: 4, pieces: 2 },
  ]);
  assert.equal(rows[0]?.displayName, 'Ana');
  assert.equal(rows[0]?.pieces, 4);
  assert.equal(rows[0]?.orders, 2);
  assert.deepEqual(rows[0]?.grades, [2]);
  assert.equal(rows[1]?.pieces, 2);
});
