import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MACHINE_WAIT_AUDIT_ACTION,
  PaymentParametersService,
} from 'src/modules/finance/application/finance/payment-parameters.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

describe('PaymentParametersService', () => {
  function buildService(initialMinutes = 3) {
    const tenant = { id: 'tenant-1', machineWaitMinutes: initialMinutes, updatedBy: null as string | null };
    const audits: Array<Record<string, unknown>> = [];
    const service = new PaymentParametersService(
      {
        async findById(id: string) {
          assert.equal(id, 'tenant-1');
          return tenant;
        },
        async save(saved: typeof tenant) {
          tenant.machineWaitMinutes = saved.machineWaitMinutes;
          tenant.updatedBy = saved.updatedBy;
          return tenant;
        },
      } as never,
      {
        async record(payload: Record<string, unknown>) {
          audits.push(payload);
        },
        async listByAction() {
          return audits.map((audit, index) => ({
            occurredAt: new Date(`2026-10-19T17:${String(index).padStart(2, '0')}:00.000Z`),
            actorUserId: audit.actorUserId,
            previousValues: audit.previousValues,
            newValues: audit.newValues,
          }));
        },
      } as never,
      {
        async listByTenant() {
          return [{ id: 'actor-1', displayName: 'Gerente' }];
        },
      } as never,
    );
    return { service, tenant, audits };
  }

  it('reads the default wait and an empty history', async () => {
    const { service } = buildService();
    const view = await service.get('tenant-1');
    assert.equal(view.machineWaitMinutes, 3);
    assert.deepEqual(view.history, []);
  });

  it('rejects a wait outside 1 to 30 minutes', async () => {
    const { service, audits } = buildService();
    await assert.rejects(() => service.update('tenant-1', 'actor-1', 0), DomainValidationError);
    await assert.rejects(() => service.update('tenant-1', 'actor-1', 31), DomainValidationError);
    await assert.rejects(() => service.update('tenant-1', 'actor-1', 1.5), DomainValidationError);
    assert.equal(audits.length, 0);
  });

  it('keeps the same wait without a history row', async () => {
    const { service, audits } = buildService(3);
    const view = await service.update('tenant-1', 'actor-1', 3);
    assert.equal(view.machineWaitMinutes, 3);
    assert.equal(audits.length, 0);
    assert.deepEqual(view.history, []);
  });

  it('records who changed the wait, from which value to which', async () => {
    const { service, tenant, audits } = buildService(3);
    const view = await service.update('tenant-1', 'actor-1', 5);
    assert.equal(tenant.machineWaitMinutes, 5);
    assert.equal(tenant.updatedBy, 'actor-1');
    assert.equal(view.machineWaitMinutes, 5);
    assert.equal(audits[0]?.action, MACHINE_WAIT_AUDIT_ACTION);
    assert.deepEqual(audits[0]?.previousValues, { machineWaitMinutes: 3 });
    assert.deepEqual(audits[0]?.newValues, { machineWaitMinutes: 5 });
    assert.equal(view.history[0]?.actorName, 'Gerente');
    assert.equal(view.history[0]?.previousMinutes, 3);
    assert.equal(view.history[0]?.newMinutes, 5);
  });
});
