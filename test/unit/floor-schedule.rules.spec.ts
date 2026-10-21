import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { balanceProduction, dayBoardDates, eachIsoDate, floorPresence, schedulePeriodError, weekdayOfIsoDate } from 'src/modules/floor-schedule/application/floor-schedule.rules';

describe('floor schedule rules', () => {
  it('limits the grade to one month and skips an inverted period', () => {
    assert.equal(schedulePeriodError('2026-10-01', '2026-10-31'), null);
    assert.equal(schedulePeriodError('2026-10-01', '2026-11-15'), 'O período da grade vai até um mês.');
    assert.equal(schedulePeriodError('2026-10-20', '2026-10-01'), 'Informe um período válido.');
  });

  it('counts the days and marks Sunday', () => {
    assert.equal(eachIsoDate('2026-10-19', '2026-10-21').length, 3);
    assert.equal(weekdayOfIsoDate('2026-10-18'), 0);
  });

  it('opens today and the next five days, including the month change', () => {
    assert.deepEqual(dayBoardDates('2026-10-20'), [
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    assert.deepEqual(dayBoardDates('2026-10-29').slice(0, 3), ['2026-10-29', '2026-10-30', '2026-10-31']);
    assert.deepEqual(dayBoardDates('2026-10-29').slice(3), ['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('pushes extra pieces forward and pulls spare capacity from a later day', () => {
    assert.deepEqual(balanceProduction([14, 2], [11, 6]), [11, 5]);
    assert.deepEqual(balanceProduction([8, 2], [11, 6]), [10, 0]);
    assert.deepEqual(balanceProduction([4], [2]), [4]);
  });

  it('turns the first picked bag into the active state', () => {
    assert.equal(floorPresence({ scheduled: true, sessionOpen: false, pickedToday: false }), 'confirmed');
    assert.equal(floorPresence({ scheduled: true, sessionOpen: true, pickedToday: false }), 'identified');
    assert.equal(floorPresence({ scheduled: true, sessionOpen: true, pickedToday: true }), 'active');
    assert.equal(floorPresence({ scheduled: false, sessionOpen: false, pickedToday: false }), null);
  });
});
