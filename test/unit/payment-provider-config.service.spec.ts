import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentProviderConfigService } from 'src/modules/finance/application/finance/payment-provider-config.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

type ConfigRow = {
  id: string;
  tenantId: string;
  companyId: string;
  provider: string;
  environment: string;
  credentials: Record<string, string>;
  status: 'active' | 'inactive';
  updatedBy?: string;
  createdAt?: Date;
};

function buildRow(id: string, provider: string, status: 'active' | 'inactive'): ConfigRow {
  return {
    id,
    tenantId: 'tenant-1',
    companyId: 'company-1',
    provider,
    environment: 'sandbox',
    credentials: {},
    status,
    createdAt: new Date('2026-10-15T12:00:00Z'),
  };
}

function createService(options: { rows?: ConfigRow[] } = {}) {
  const rows = options.rows ?? [];
  const saved: ConfigRow[] = [];
  const configRepository = {
    create(payload: ConfigRow) {
      return payload;
    },
    async save(entity: ConfigRow) {
      saved.push(entity);
      return entity;
    },
    async findById(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findListedByCompany() {
      return rows;
    },
    async findActiveByCompanyAndProvider(tenantId: string, companyId: string, provider: string) {
      return rows.filter(
        (row) => row.tenantId === tenantId && row.companyId === companyId && row.provider === provider && row.status === 'active',
      );
    },
  };
  const service = new PaymentProviderConfigService(
    {
      async getById() {
        return { id: 'tenant-1' };
      },
    } as never,
    {
      async getById(id: string) {
        return { id, legalName: 'Empresa Teste LTDA', tradeName: 'Empresa Teste' };
      },
    } as never,
    { async record() {} } as never,
    configRepository as never,
  );
  return { service, saved, rows };
}

describe('PaymentProviderConfigService', () => {
  it('creates the first active config for the company and provider', async () => {
    const { service, saved } = createService();

    const created = await service.createConfig({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      provider: 'cielo' as never,
      environment: 'sandbox' as never,
      credentials: { clientId: 'abc', clientSecret: 'secret' },
      actorUserId: 'user-1',
    });

    assert.equal(created.status, 'active');
    assert.equal(created.provider, 'cielo');
    assert.equal(created.environment, 'sandbox');
    assert.deepEqual(created.credentials, { clientId: 'abc', clientSecret: 'secret' });
    assert.equal(saved.length, 1);
  });

  it('keeps only one active config per company and provider', async () => {
    const previous = buildRow('config-1', 'cielo', 'active');
    const { service, saved } = createService({ rows: [previous] });

    const created = await service.createConfig({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      provider: 'cielo' as never,
      environment: 'production' as never,
      actorUserId: 'user-1',
    });

    assert.equal(previous.status, 'inactive');
    assert.equal(created.status, 'active');
    assert.equal(
      saved.filter((row) => row.status === 'active').length,
      1,
    );
  });

  it('allows an active config per provider without touching other providers', async () => {
    const cielo = buildRow('config-cielo', 'cielo', 'active');
    const { service } = createService({ rows: [cielo] });

    const created = await service.createConfig({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      provider: 'stone' as never,
      environment: 'sandbox' as never,
      actorUserId: 'user-1',
    });

    assert.equal(created.status, 'active');
    assert.equal(cielo.status, 'active');
  });

  it('activating an inactive config inactivates the current active one', async () => {
    const current = buildRow('config-active', 'cielo', 'active');
    const target = buildRow('config-inactive', 'cielo', 'inactive');
    const { service } = createService({ rows: [current, target] });

    const updated = await service.updateConfig('config-inactive', {
      tenantId: 'tenant-1',
      status: 'active',
      actorUserId: 'user-1',
    });

    assert.equal(updated.status, 'active');
    assert.equal(current.status, 'inactive');
  });

  it('stores generic credentials trimming empty keys', async () => {
    const { service } = createService();

    const created = await service.createConfig({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      provider: 'pagbank' as never,
      environment: 'sandbox' as never,
      credentials: { '  ': 'ignored', merchantId: '123' },
      actorUserId: 'user-1',
    });

    assert.deepEqual(created.credentials, { merchantId: '123' });
  });

  it('rejects credentials that are not a key-value object', async () => {
    const { service } = createService();

    await assert.rejects(
      () =>
        service.createConfig({
          tenantId: 'tenant-1',
          companyId: 'company-1',
          provider: 'cielo' as never,
          environment: 'sandbox' as never,
          credentials: ['clientId'] as never,
          actorUserId: 'user-1',
        }),
      DomainValidationError,
    );
  });
});
