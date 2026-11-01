import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addCalendarDays, publicLinkExpiry } from 'src/modules/privacy/application/privacy.rules';

describe('public link expiry', () => {
  it('keeps the link open before pickup', () => {
    const state = publicLinkExpiry({
      status: 'ready_for_pickup',
      actualPickupDate: null,
      warrantyDays: 90,
      marginDays: 30,
      today: '2026-11-01',
    });
    assert.equal(state.expired, false);
    assert.equal(state.expiresOn, null);
  });

  it('expires the day after pickup plus warranty plus margin', () => {
    const expiresOn = addCalendarDays('2026-06-01', 120);
    assert.equal(expiresOn, '2026-09-29');
    const open = publicLinkExpiry({
      status: 'picked_up',
      actualPickupDate: '2026-06-01',
      warrantyDays: 90,
      marginDays: 30,
      today: expiresOn,
    });
    const closed = publicLinkExpiry({
      status: 'picked_up',
      actualPickupDate: '2026-06-01',
      warrantyDays: 90,
      marginDays: 30,
      today: '2026-09-30',
    });
    assert.equal(open.expired, false);
    assert.equal(closed.expired, true);
  });
});
