import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AtelierCatalogService } from 'src/modules/service-orders/application/atelier-catalog/atelier-catalog.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

type MinuteRateRow = {
  id: string;
  tenantId: string;
  companyId: string;
  valuePerMinute: string;
  status: 'active' | 'inactive';
  updatedBy?: string;
  createdAt?: Date;
};

function buildRow(id: string, status: 'active' | 'inactive', value = '1.50'): MinuteRateRow {
  return {
    id,
    tenantId: 'tenant-1',
    companyId: 'company-1',
    valuePerMinute: value,
    status,
    createdAt: new Date('2026-10-15T12:00:00Z'),
  };
}

function createService(options: { rows?: MinuteRateRow[] } = {}) {
  const rows = options.rows ?? [];
  const saved: MinuteRateRow[] = [];
  const minuteRateRepository = {
    create(payload: MinuteRateRow) {
      return payload;
    },
    async save(entity: MinuteRateRow) {
      saved.push(entity);
      return entity;
    },
    async findById(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findListedByCompany() {
      return rows;
    },
    async findActiveByCompany(tenantId: string, companyId: string) {
      return rows.filter((row) => row.tenantId === tenantId && row.companyId === companyId && row.status === 'active');
    },
  };
  const service = new AtelierCatalogService(
    {
      async getById() {
        return { id: 'tenant-1' };
      },
    } as never,
    {} as never,
    {} as never,
    { async record() {} } as never,
    {} as never,
    {} as never,
    minuteRateRepository as never,
    {
      async getById(id: string) {
        return { id, legalName: 'Empresa Teste LTDA', tradeName: 'Empresa Teste' };
      },
    } as never,
  );
  return { service, saved, rows };
}

describe('AtelierCatalogService minute rates', () => {
  it('creates the first active minute-rate table for the company', async () => {
    const { service, saved } = createService();

    const created = await service.createMinuteRate({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      valuePerMinute: 1.5,
      actorUserId: 'user-1',
    });

    assert.equal(created.status, 'active');
    assert.equal(created.valuePerMinute, '1.50');
    assert.equal(created.companyName, 'Empresa Teste');
    assert.equal(saved.length, 1);
  });

  it('inactivates the previous active table when a new one is created', async () => {
    const previous = buildRow('rate-1', 'active');
    const { service, saved } = createService({ rows: [previous] });

    const created = await service.createMinuteRate({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      valuePerMinute: 2,
      actorUserId: 'user-1',
    });

    assert.equal(previous.status, 'inactive');
    assert.equal(saved[0].id, 'rate-1');
    assert.equal(created.status, 'active');
    assert.equal(
      saved.filter((row) => row.status === 'active').length,
      1,
    );
  });

  it('activating an inactive table inactivates the current active one', async () => {
    const current = buildRow('rate-active', 'active');
    const target = buildRow('rate-inactive', 'inactive');
    const { service } = createService({ rows: [current, target] });

    const updated = await service.updateMinuteRate('rate-inactive', {
      tenantId: 'tenant-1',
      status: 'active',
      actorUserId: 'user-1',
    });

    assert.equal(updated.status, 'active');
    assert.equal(current.status, 'inactive');
  });

  it('rejects a non-positive value per minute', async () => {
    const { service } = createService();

    await assert.rejects(
      () =>
        service.createMinuteRate({
          tenantId: 'tenant-1',
          companyId: 'company-1',
          valuePerMinute: 0,
          actorUserId: 'user-1',
        }),
      DomainValidationError,
    );
  });

  it('updating the value keeps the current status', async () => {
    const current = buildRow('rate-1', 'active');
    const { service } = createService({ rows: [current] });

    const updated = await service.updateMinuteRate('rate-1', {
      tenantId: 'tenant-1',
      valuePerMinute: 2.5,
      actorUserId: 'user-1',
    });

    assert.equal(updated.valuePerMinute, '2.50');
    assert.equal(updated.status, 'active');
  });
});
