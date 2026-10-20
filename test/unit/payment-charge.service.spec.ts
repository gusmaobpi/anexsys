import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentChargeService } from 'src/modules/finance/application/finance/payment-charge.service';
import { PaymentProviderRegistry } from 'src/modules/finance/application/finance/payment-provider-registry';
import { PaymentProviderAdapter } from 'src/modules/finance/contracts/provider/payment-provider.contract';
import { PaymentProviderRequestError } from 'src/modules/finance/contracts/provider/payment-provider-request-error';
import { PaymentModality } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

type PaymentRow = {
  id: string;
  tenantId: string;
  branchId: string;
  serviceOrderId: string;
  paymentReferenceNo: string | null;
  paymentMethod: string;
  paymentProvider: string | null;
  paymentDirection: string;
  paymentAmount: string;
  status: string;
  billingScopeId?: string;
  informedModality?: string | null;
  confirmedModality?: string | null;
  authorizedAt?: Date | null;
  updatedBy?: string;
};

function createHarness(options: {
  adapter?: PaymentProviderAdapter | null;
  hasActiveConfig?: boolean;
  configEnvironment?: string;
  rows?: PaymentRow[];
  serviceOrder?: Record<string, unknown>;
} = {}) {
  const rows = options.rows ?? [];
  const saved: PaymentRow[] = [];
  const auditRecords: Array<Record<string, unknown>> = [];
  const registry = new PaymentProviderRegistry();
  if (options.adapter) {
    registry.register(options.adapter);
  }
  const service = new PaymentChargeService(
    {
      async getById() {
        return options.serviceOrder ?? { id: 'os-1', branchId: 'branch-1', orderNo: 'AAA000001' };
      },
    } as never,
    {
      async getById() {
        return { id: 'branch-1', companyId: 'company-1' };
      },
    } as never,
    {
      async getActiveConfig() {
        return options.hasActiveConfig === false
          ? null
          : { id: 'config-1', provider: 'cielo', environment: options.configEnvironment ?? 'sandbox', credentials: { clientId: 'test-client' } };
      },
    } as never,
    {
      async resolveForCharge() {
        return { id: 'terminal-1', name: 'Balcão 1', provider: 'cielo', isDefault: true, terminalCode: 'SN-001' };
      },
    } as never,
    registry,
    {
      create(payload: PaymentRow) {
        return payload;
      },
      async save(entity: PaymentRow) {
        saved.push({ ...entity });
        return entity;
      },
      async runInTransaction<T>(callback: (manager: { getRepository: () => { save: (entity: PaymentRow) => Promise<PaymentRow> } }) => Promise<T>) {
        return callback({
          getRepository: () => ({
            async save(entity: PaymentRow) {
              saved.push({ ...entity });
              return entity;
            },
          }),
        });
      },
      async findById(id: string) {
        return rows.find((row) => row.id === id) ?? saved.find((row) => row.id === id) ?? null;
      },
    } as never,
    {
      async record(entry: Record<string, unknown>) {
        auditRecords.push(entry);
      },
    } as never,
    {
      async assertInboundReceipt(_tenantId: string, _serviceOrderId: string, amount: number) {
        if (amount > 60.009) {
          throw new DomainValidationError('O valor não pode superar o saldo em aberto.');
        }
        return { billingScopeId: 'os-1', outstandingBalance: '60.00' };
      },
      async assertNoPendingCharge(scope: string) {
        const latest = new Map<string, PaymentRow>();
        for (const row of saved) {
          if (row.id) latest.set(row.id, row);
        }
        if ([...latest.values()].some((row) => row.billingScopeId === scope && row.status === 'pending')) {
          throw new DomainValidationError('Já existe uma cobrança aguardando confirmação neste grupo.');
        }
      },
      async getFinancialSummary() {
        return {
          serviceOrderId: 'os-1',
          billingScopeId: 'os-1',
          orderTotal: '60.00',
          exigivel: '60.00',
          suspenso: '0.00',
          amountPaid: '0.00',
          outstandingBalance: '60.00',
          paymentStatus: 'pending',
          openCharge: null,
          payments: [],
        };
      },
    } as never,
  );
  return { service, saved, auditRecords };
}

function buildAdapter(behavior: {
  authorized: boolean;
  settled?: boolean;
  awaitingTerminal?: boolean;
  reconcileError?: Error;
}): PaymentProviderAdapter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    provider: 'cielo' as never,
    calls,
    async initiatePayment(request) {
      calls.push(request);
      return {
        provider: 'cielo' as never,
        referenceNo: request.referenceNo,
        authorized: behavior.authorized,
        authorizedAt: behavior.authorized ? '2026-10-15T13:00:00Z' : null,
        failureReason: behavior.authorized || behavior.awaitingTerminal ? null : 'Recusada na operadora',
        awaitingTerminal: behavior.awaitingTerminal ?? false,
      };
    },
    async reconcileSettlement(referenceNo: string) {
      if (behavior.reconcileError) {
        throw behavior.reconcileError;
      }
      return {
        provider: 'cielo' as never,
        referenceNo,
        settled: behavior.settled ?? false,
        settledAt: behavior.settled ? '2026-10-15T14:00:00Z' : null,
      };
    },
  };
}

describe('PaymentChargeService', () => {
  it('registers the attempt as pending and then authorized when the adapter authorizes', async () => {
    const adapter = buildAdapter({ authorized: true });
    const { service, saved } = createHarness({ adapter });

    const result = await service.initiateCharge({
      tenantId: 'tenant-1',
      serviceOrderId: 'os-1',
      amount: 60,
      informedModality: PaymentModality.CREDIT,
      actorUserId: 'user-1',
    });

    assert.equal(saved[0].status, 'pending');
    assert.equal(result.payment.status, 'authorized');
    assert.equal(result.terminalName, 'Balcão 1');
    assert.equal(result.environment, 'sandbox');
    assert.equal((adapter.calls[0] as { referenceNo: string }).referenceNo, result.payment.paymentReferenceNo);
    assert.equal(result.payment.paymentMethod, 'card');
    assert.equal(result.payment.paymentProvider, 'cielo');
  });

  it('fails the attempt and throws when the provider has no adapter registered', async () => {
    const { service, saved } = createHarness({ adapter: null });

    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-1',
          amount: 60,
          informedModality: PaymentModality.CREDIT,
          actorUserId: 'user-1',
        }),
      DomainValidationError,
    );
    assert.equal(saved[0].status, 'failed');
  });

  it('marks the attempt as failed when the adapter does not authorize', async () => {
    const { service, saved } = createHarness({ adapter: buildAdapter({ authorized: false }) });

    const result = await service.initiateCharge({
      tenantId: 'tenant-1',
      serviceOrderId: 'os-1',
      amount: 60,
      informedModality: PaymentModality.CREDIT,
      actorUserId: 'user-1',
    });

    assert.equal(result.payment.status, 'failed');
    assert.equal(saved[saved.length - 1].status, 'failed');
  });

  it('requires an active provider config for the terminal company', async () => {
    const { service, saved } = createHarness({ adapter: buildAdapter({ authorized: true }), hasActiveConfig: false });

    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-1',
          amount: 60,
          informedModality: PaymentModality.CREDIT,
          actorUserId: 'user-1',
        }),
      DomainValidationError,
    );
    assert.equal(saved.length, 0);
  });

  it('rejects a non-positive charge amount', async () => {
    const { service } = createHarness({ adapter: buildAdapter({ authorized: true }) });

    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-1',
          amount: 0,
          informedModality: PaymentModality.CREDIT,
          actorUserId: 'user-1',
        }),
      DomainValidationError,
    );
  });

  it('keeps the charge pending while the terminal waits for the customer', async () => {
    const { service, saved } = createHarness({ adapter: buildAdapter({ authorized: false, awaitingTerminal: true }) });

    const result = await service.initiateCharge({
      tenantId: 'tenant-1',
      serviceOrderId: 'os-1',
      amount: 60,
      informedModality: PaymentModality.CREDIT,
      actorUserId: 'user-1',
    });

    assert.equal(result.payment.status, 'pending');
    assert.equal(saved[saved.length - 1].status, 'pending');
  });

  it('passes credentials, environment and terminal code to the adapter', async () => {
    const adapter = buildAdapter({ authorized: true });
    const { service } = createHarness({ adapter });

    await service.initiateCharge({
      tenantId: 'tenant-1',
      serviceOrderId: 'os-1',
      amount: 60,
      informedModality: PaymentModality.CREDIT,
      actorUserId: 'user-1',
    });

    const request = adapter.calls[0] as {
      credentials: Record<string, string>;
      environment: string;
      terminalCode: string;
      description: string;
      informedModality: string;
    };
    assert.deepEqual(request.credentials, { clientId: 'test-client' });
    assert.equal(request.environment, 'sandbox');
    assert.equal(request.terminalCode, 'SN-001');
    assert.equal(request.description, 'OS AAA000001');
    assert.equal(request.informedModality, PaymentModality.CREDIT);
  });

  it('settles a pending charge when the provider confirms the payment', async () => {
    const rows: PaymentRow[] = [
      {
        id: 'pay-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        serviceOrderId: 'os-1',
        paymentReferenceNo: 'ch_123',
        paymentMethod: 'card',
        paymentProvider: 'cielo',
        paymentDirection: 'inbound',
        paymentAmount: '60.00',
        status: 'pending',
      },
    ];
    const { service } = createHarness({ adapter: buildAdapter({ authorized: true, settled: true }), rows });

    const result = await service.refreshCharge('tenant-1', 'pay-1', 'user-1');

    assert.equal(result.payment.status, 'settled');
  });

  it('shows the real provider error in sandbox and records the diagnostics', async () => {
    const failingAdapter: PaymentProviderAdapter = {
      provider: 'cielo' as never,
      async initiatePayment() {
        throw new PaymentProviderRequestError({
          failureType: 'http_error',
          url: 'https://api2.cielo.com.br/v1/orders',
          method: 'POST',
          status: 401,
          responseBody: '{"message":"invalid client"}',
          exceptionMessage: 'HTTP 401',
        });
      },
      async reconcileSettlement(referenceNo: string) {
        return { provider: 'cielo' as never, referenceNo, settled: false };
      },
    };
    const { service, saved, auditRecords } = createHarness({ adapter: failingAdapter });

    const error = await service
      .initiateCharge({ tenantId: 'tenant-1', serviceOrderId: 'os-1', amount: 60, informedModality: PaymentModality.CREDIT, actorUserId: 'user-1' })
      .catch((caught: unknown) => caught);

    assert.ok(error instanceof DomainValidationError);
    assert.match((error as Error).message, /401 Unauthorized/);
    assert.equal(saved[saved.length - 1].status, 'failed');
    const failureAudit = auditRecords.find(
      (entry) => (entry as { action?: string }).action === 'finance.charge.failed',
    ) as { metadata: Record<string, unknown> };
    assert.equal(failureAudit.metadata.failureType, 'http_error');
    assert.equal(failureAudit.metadata.failureStatus, 401);
    assert.equal(failureAudit.metadata.failureUrl, 'https://api2.cielo.com.br/v1/orders');
    assert.equal(failureAudit.metadata.failureMethod, 'POST');
  });

  it('shows the real provider error when refreshing the status in sandbox', async () => {
    const rows: PaymentRow[] = [
      {
        id: 'pay-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        serviceOrderId: 'os-1',
        paymentReferenceNo: 'ch_123',
        paymentMethod: 'card',
        paymentProvider: 'cielo',
        paymentDirection: 'inbound',
        paymentAmount: '60.00',
        status: 'pending',
      },
    ];
    const adapter = buildAdapter({
      authorized: true,
      reconcileError: new PaymentProviderRequestError({
        failureType: 'timeout',
        exceptionMessage: 'The operation was aborted',
      }),
    });
    const { service } = createHarness({ adapter, rows });

    const error = await service.refreshCharge('tenant-1', 'pay-1', 'user-1').catch((caught: unknown) => caught);

    assert.ok(error instanceof DomainValidationError);
    assert.match((error as Error).message, /timeout/i);
  });

  function buildSimulatingAdapter() {
    const simulateCalls: Array<[string, unknown]> = [];
    const adapter = {
      provider: 'cielo' as never,
      async initiatePayment() {
        throw new Error('not used');
      },
      async reconcileSettlement(referenceNo: string) {
        return { provider: 'cielo' as never, referenceNo, settled: true, settledAt: '2026-10-15T14:00:00Z' };
      },
      async simulateSandboxPayment(orderId: string, options: unknown) {
        simulateCalls.push([orderId, options]);
      },
    };
    return { adapter, simulateCalls };
  }

  function buildPendingRow(): PaymentRow {
    return {
      id: 'pay-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      serviceOrderId: 'os-1',
      paymentReferenceNo: 'ch_123',
      paymentMethod: 'card',
      paymentProvider: 'cielo',
      paymentDirection: 'inbound',
      paymentAmount: '60.00',
      status: 'pending',
    };
  }

  it('simulates the sandbox payment and settles the charge', async () => {
    const { adapter, simulateCalls } = buildSimulatingAdapter();
    const { service } = createHarness({ adapter: adapter as never, rows: [buildPendingRow()] });

    const result = await service.simulateCharge('tenant-1', 'pay-1', 'user-1');

    assert.equal(result.payment.status, 'settled');
    assert.equal(simulateCalls.length, 1);
    assert.equal(simulateCalls[0][0], 'ch_123');
    assert.deepEqual((simulateCalls[0][1] as { environment: string }).environment, 'sandbox');
  });

  it('rejects the simulation outside the sandbox environment', async () => {
    const { adapter } = buildSimulatingAdapter();
    const { service } = createHarness({
      adapter: adapter as never,
      rows: [buildPendingRow()],
      configEnvironment: 'production',
    });

    await assert.rejects(() => service.simulateCharge('tenant-1', 'pay-1', 'user-1'), DomainValidationError);
  });

  it('cancels a pending charge without marking the OS as paid', async () => {
    const closed: string[] = [];
    const adapter: PaymentProviderAdapter = {
      provider: 'cielo' as never,
      async initiatePayment() {
        throw new Error('not used');
      },
      async reconcileSettlement(referenceNo: string) {
        return { provider: 'cielo' as never, referenceNo, settled: false, canceled: false };
      },
      async cancelOrder(orderId: string) {
        closed.push(orderId);
      },
    };
    const { service } = createHarness({ adapter, rows: [buildPendingRow()] });

    const result = await service.cancelCharge('tenant-1', 'pay-1', 'user-1');

    assert.deepEqual(closed, ['ch_123']);
    assert.equal(result.payment.status, 'canceled');
  });

  it('rejects the simulation when the provider has no simulation flow', async () => {
    const { service } = createHarness({ adapter: buildAdapter({ authorized: true }), rows: [buildPendingRow()] });

    await assert.rejects(() => service.simulateCharge('tenant-1', 'pay-1', 'user-1'), DomainValidationError);
  });

  it('keeps the charge pending when the operator call may have created the order', async () => {
    const failingAdapter: PaymentProviderAdapter = {
      provider: 'cielo' as never,
      async initiatePayment() {
        throw new PaymentProviderRequestError({
          failureType: 'timeout',
          exceptionMessage: 'The operation was aborted',
        });
      },
      async reconcileSettlement(referenceNo: string) {
        return { provider: 'cielo' as never, referenceNo, settled: false };
      },
    };
    const { service, saved } = createHarness({ adapter: failingAdapter });

    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-1',
          amount: 60,
          informedModality: PaymentModality.CREDIT,
          actorUserId: 'user-1',
        }),
      DomainValidationError,
    );
    assert.equal(saved[saved.length - 1].status, 'pending');
  });

  it('refuses a second charge while one is still pending', async () => {
    const { service } = createHarness({ adapter: buildAdapter({ authorized: false, awaitingTerminal: true }) });
    await service.initiateCharge({
      tenantId: 'tenant-1',
      serviceOrderId: 'os-1',
      amount: 60,
      informedModality: PaymentModality.CREDIT,
      actorUserId: 'user-1',
    });

    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-1',
          amount: 10,
          informedModality: PaymentModality.DEBIT,
          actorUserId: 'user-1',
        }),
      /aguardando confirmação/,
    );
  });

  it('refuses to charge a counter child because the mother keeps the receivable', async () => {
    const { service, saved } = createHarness({
      adapter: buildAdapter({ authorized: true }),
      serviceOrder: { id: 'os-c', branchId: 'branch-1', orderNo: 'AAA000001-C', returnKind: 'counter', versionSuffix: 'C' },
    });

    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-c',
          amount: 10,
          informedModality: PaymentModality.CREDIT,
          actorUserId: 'user-1',
        }),
      /OS mãe/,
    );
    assert.equal(saved.length, 0);
  });

  it('rejects a charge above the open balance', async () => {
    const { service } = createHarness({ adapter: buildAdapter({ authorized: true }) });
    await assert.rejects(
      () =>
        service.initiateCharge({
          tenantId: 'tenant-1',
          serviceOrderId: 'os-1',
          amount: 61,
          informedModality: PaymentModality.CREDIT,
          actorUserId: 'user-1',
        }),
      /saldo em aberto/,
    );
  });

  it('keeps the informed modality when the operator confirms another one', async () => {
    const rows: PaymentRow[] = [
      {
        id: 'pay-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        serviceOrderId: 'os-1',
        paymentReferenceNo: 'ch_123',
        paymentMethod: 'card',
        paymentProvider: 'cielo',
        paymentDirection: 'inbound',
        paymentAmount: '60.00',
        status: 'pending',
        informedModality: PaymentModality.CREDIT,
      },
    ];
    const adapter = buildAdapter({ authorized: true, settled: true });
    adapter.reconcileSettlement = async (referenceNo: string) => ({
      provider: 'cielo' as never,
      referenceNo,
      settled: true,
      settledAt: '2026-10-15T14:00:00Z',
      cardBrand: 'VISA',
      confirmedModality: PaymentModality.DEBIT,
      operatorProductCode: 'DEBIT',
    });
    const { service, auditRecords } = createHarness({ adapter, rows });

    const result = await service.refreshCharge('tenant-1', 'pay-1', 'user-1');

    assert.equal(result.payment.informedModality, PaymentModality.CREDIT);
    assert.equal(result.payment.confirmedModality, PaymentModality.DEBIT);
    assert.equal(result.payment.cardBrand, 'VISA');
    assert.equal(auditRecords.some((entry) => entry.action === 'modality_mismatch'), true);
  });
});
