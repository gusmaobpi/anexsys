import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { TenantStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

describe('TenantService', () => {
  it('creates an active tenant with normalized code and writes audit', async () => {
    const auditCalls: Array<Record<string, unknown>> = [];
    const tenantRepository = {
      async findByCode() {
        return null;
      },
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
    };
    const auditService = {
      async record(payload: Record<string, unknown>) {
        auditCalls.push(payload);
      },
    };
    const service = new TenantService(
      tenantRepository as never,
      auditService as never,
      { async assertTenantCanDeactivate() {} } as never,
    );

    const tenant = await service.create({
      code: ' atelier ',
      legalName: 'Atelier Ltda',
      displayName: 'Atelier',
      actorUserId: '312bf1b5-801b-45dc-8528-b24af8a9edb9',
    });

    assert.equal(tenant.code, 'ATELIER');
    assert.equal(tenant.status, TenantStatus.ACTIVE);
    assert.equal(tenant.warrantyAdjustmentPeriodDays, 7);
    assert.equal(tenant.warrantyExecutionPeriodDays, 7);
    assert.equal(tenant.maxPiecesPerBag, 5);
    assert.equal(tenant.machineWaitMinutes, 3);
    assert.equal(auditCalls[0]?.action, 'tenant.created');
    assert.equal(auditCalls[0]?.newValues?.code, 'ATELIER');
  });

  it('updates tenant warranty configuration periods', async () => {
    const auditCalls: Array<Record<string, unknown>> = [];
    const tenantRepository = {
      async findById(id: string) {
        assert.equal(id, 'tenant-1');
        return {
          id: 'tenant-1',
          code: 'TENANT1',
          legalName: 'Tenant 1',
          displayName: 'Tenant 1',
          warrantyAdjustmentPeriodDays: 7,
          warrantyExecutionPeriodDays: 7,
        };
      },
      async findByCode() {
        return null;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
    };
    const service = new TenantService(
      tenantRepository as never,
      {
        async record(payload: Record<string, unknown>) {
          auditCalls.push(payload);
        },
      } as never,
      { async assertTenantCanDeactivate() {} } as never,
    );

    const tenant = await service.update('tenant-1', {
      warrantyAdjustmentPeriodDays: 10,
      warrantyExecutionPeriodDays: 14,
      actorUserId: 'actor-1',
    });

    assert.equal(tenant.warrantyAdjustmentPeriodDays, 10);
    assert.equal(tenant.warrantyExecutionPeriodDays, 14);
    assert.equal(auditCalls[0]?.metadata?.warrantyAdjustmentPeriodDays, 10);
    assert.equal(auditCalls[0]?.metadata?.warrantyExecutionPeriodDays, 14);
    assert.equal(auditCalls[0]?.previousValues?.warrantyAdjustmentPeriodDays, 7);
  });

  it('rejects duplicate tenant code on update', async () => {
    const tenantRepository = {
      async findById(id: string) {
        assert.equal(id, 'tenant-1');
        return { id: 'tenant-1', code: 'TENANT1', legalName: 'Tenant 1', displayName: 'Tenant 1' };
      },
      async findByCode(code: string) {
        assert.equal(code, 'TENANT2');
        return { id: 'tenant-2', code: 'TENANT2' };
      },
    };
    const service = new TenantService(tenantRepository as never, {} as never, {} as never);

    await assert.rejects(
      () => service.update('tenant-1', { code: 'tenant2', actorUserId: 'actor-1' }),
      DomainValidationError,
    );
  });

  it('blocks tenant deactivation when dependency validation fails', async () => {
    const service = new TenantService(
      {
        async findById() {
          return { id: 'tenant-1', code: 'TENANT1', legalName: 'Tenant 1', displayName: 'Tenant 1', status: TenantStatus.ACTIVE };
        },
        async save(payload: Record<string, unknown>) {
          return payload;
        },
      } as never,
      { async record() {} } as never,
      {
        async assertTenantCanDeactivate() {
          throw new DomainValidationError('Tenant vinculada a filiais.');
        },
      } as never,
    );

    await assert.rejects(() => service.deactivate('tenant-1', 'actor-1'), DomainValidationError);
  });
});
