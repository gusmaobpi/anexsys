import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentTerminalsService } from 'src/modules/finance/application/finance/payment-terminals.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

type TerminalRow = {
  id: string;
  tenantId: string;
  branchId: string;
  provider: string;
  name: string;
  terminalCode: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
  updatedBy?: string;
  createdAt?: Date;
};

function buildRow(id: string, overrides: Partial<TerminalRow> = {}): TerminalRow {
  return {
    id,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    provider: 'cielo',
    name: `Terminal ${id}`,
    terminalCode: `CODE-${id}`,
    isDefault: false,
    status: 'active',
    createdAt: new Date('2026-10-15T12:00:00Z'),
    ...overrides,
  };
}

function createService(options: { rows?: TerminalRow[] } = {}) {
  const rows = options.rows ?? [];
  const saved: TerminalRow[] = [];
  const terminalRepository = {
    create(payload: TerminalRow) {
      return payload;
    },
    async save(entity: TerminalRow) {
      saved.push(entity);
      return entity;
    },
    async findById(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findListedByBranch(tenantId: string, branchId: string) {
      return rows.filter((row) => row.tenantId === tenantId && row.branchId === branchId);
    },
    async findActiveByBranch(tenantId: string, branchId: string) {
      return rows.filter((row) => row.tenantId === tenantId && row.branchId === branchId && row.status === 'active');
    },
  };
  const service = new PaymentTerminalsService(
    {
      async getById() {
        return { id: 'tenant-1' };
      },
    } as never,
    {
      async getById(id: string) {
        return { id, tenantId: 'tenant-1' };
      },
    } as never,
    { async record() {} } as never,
    terminalRepository as never,
  );
  return { service, saved, rows };
}

describe('PaymentTerminalsService', () => {
  it('makes the first terminal of the branch the default one automatically', async () => {
    const { service } = createService();

    const created = await service.createTerminal({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      provider: 'cielo' as never,
      name: 'Balcão 1',
      terminalCode: 'SN-001',
      actorUserId: 'user-1',
    });

    assert.equal(created.isDefault, true);
    assert.equal(created.status, 'active');
  });

  it('keeps only one default terminal per branch', async () => {
    const previous = buildRow('term-1', { isDefault: true });
    const { service, saved } = createService({ rows: [previous] });

    const created = await service.createTerminal({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      provider: 'cielo' as never,
      name: 'Balcão 2',
      terminalCode: 'SN-002',
      isDefault: true,
      actorUserId: 'user-1',
    });

    assert.equal(previous.isDefault, false);
    assert.equal(created.isDefault, true);
    assert.equal(
      saved.filter((row) => row.isDefault).length,
      1,
    );
  });

  it('marking a terminal as default via update unsets the others', async () => {
    const current = buildRow('term-1', { isDefault: true });
    const target = buildRow('term-2', { isDefault: false });
    const { service } = createService({ rows: [current, target] });

    const updated = await service.updateTerminal('term-2', {
      tenantId: 'tenant-1',
      isDefault: true,
      actorUserId: 'user-1',
    });

    assert.equal(updated.isDefault, true);
    assert.equal(current.isDefault, false);
  });

  it('resolves the single active terminal without asking', async () => {
    const only = buildRow('term-1');
    const { service } = createService({ rows: [only] });

    const resolved = await service.resolveForCharge('tenant-1', 'branch-1');

    assert.equal(resolved.id, 'term-1');
  });

  it('prefers the default terminal when the branch has several actives', async () => {
    const other = buildRow('term-1');
    const preferred = buildRow('term-2', { isDefault: true });
    const { service } = createService({ rows: [other, preferred] });

    const resolved = await service.resolveForCharge('tenant-1', 'branch-1');

    assert.equal(resolved.id, 'term-2');
  });

  it('honours an explicit terminal choice among actives', async () => {
    const preferred = buildRow('term-1', { isDefault: true });
    const chosen = buildRow('term-2');
    const { service } = createService({ rows: [preferred, chosen] });

    const resolved = await service.resolveForCharge('tenant-1', 'branch-1', 'term-2');

    assert.equal(resolved.id, 'term-2');
  });

  it('rejects the charge when the branch has no active terminal', async () => {
    const { service } = createService({ rows: [buildRow('term-1', { status: 'inactive' })] });

    await assert.rejects(
      () => service.resolveForCharge('tenant-1', 'branch-1'),
      DomainValidationError,
    );
  });
});
