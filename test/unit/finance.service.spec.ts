import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FinanceService } from 'src/modules/finance/application/finance/finance.service';
import {
  FinancialExceptionStatus,
  FinancialExceptionType,
  PaymentDirection,
  PaymentMethod,
  PaymentProviderName,
  PaymentRecordStatus,
  ServiceOrderPaymentStatus,
} from 'src/shared/domain/enums';

function createFinanceFixture(options?: {
  items?: Array<Record<string, unknown>>;
  totalValue?: string;
}) {
  const payments: Array<Record<string, any>> = [];
  const allocations: Array<Record<string, any>> = [];
  const exceptions: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];
  const serviceOrder = {
    id: 'service-order-1',
    branchId: 'branch-1',
    customerId: 'customer-1',
    promisedDeliveryDate: '2026-09-25',
    paymentTermsDays: 3,
    totalValue: options?.totalValue ?? '80.00',
  };
  const items = options?.items ?? [
    { id: 'item-1', itemNo: 1, description: 'Blue Shirt', quantity: '1', unitPrice: '50.00', discountValue: '0.00' },
    { id: 'item-2', itemNo: 2, description: 'Gray Pants', quantity: '1', unitPrice: '30.00', discountValue: '0.00' },
  ];

  const paymentRecordRepository = {
    create(payload: Record<string, any>) {
      return { createdAt: new Date(), updatedAt: new Date(), ...payload };
    },
    async save(entity: Record<string, any>) {
      const index = payments.findIndex((payment) => payment.id === entity.id);
      if (index >= 0) payments[index] = entity;
      else payments.push(entity);
      return entity;
    },
    async runInTransaction<T>(callback: (manager: any) => Promise<T>) {
      return callback({
        getRepository(entity: { name?: string }) {
          if (entity?.name === 'PaymentRecordEntity') {
            return {
              save: async (value: Record<string, any>) => {
                const index = payments.findIndex((payment) => payment.id === value.id);
                if (index >= 0) payments[index] = value;
                else payments.push(value);
                return value;
              },
            };
          }
          return {
            save: async (values: Array<Record<string, any>>) => {
              allocations.push(...values);
              return values;
            },
            find: async ({ where }: Record<string, any>) => {
              if (where.paymentRecordId) return allocations.filter((allocation) => allocation.paymentRecordId === where.paymentRecordId);
              if (where.serviceOrderId) return allocations.filter((allocation) => allocation.serviceOrderId === where.serviceOrderId);
              return [];
            },
          };
        },
      });
    },
    async findById(id: string) {
      return payments.find((payment) => payment.id === id) ?? null;
    },
    async findByServiceOrder(serviceOrderId: string) {
      return payments.filter((payment) => payment.serviceOrderId === serviceOrderId);
    },
    async findPendingByBillingScope(billingScopeId: string) {
      return payments.find((payment) => payment.billingScopeId === billingScopeId && payment.status === 'pending') ?? null;
    },
    async search(_tenantId: string, filters: Record<string, any>) {
      return payments.filter((payment) => {
        if (filters.branchId && payment.branchId !== filters.branchId) return false;
        if (filters.paymentMethod && payment.paymentMethod !== filters.paymentMethod) return false;
        if (filters.serviceOrderId && payment.serviceOrderId !== filters.serviceOrderId) return false;
        if (filters.status && payment.status !== filters.status) return false;
        if (filters.statuses?.length && !filters.statuses.includes(payment.status)) return false;
        if (filters.paymentDirection && payment.paymentDirection !== filters.paymentDirection) return false;
        if (filters.fromReceivedDate && (!payment.receivedAt || payment.receivedAt.toISOString().slice(0, 10) < filters.fromReceivedDate)) return false;
        if (filters.toReceivedDate && (!payment.receivedAt || payment.receivedAt.toISOString().slice(0, 10) > filters.toReceivedDate)) return false;
        return (filters.accessibleBranchIds ?? []).includes(payment.branchId);
      });
    },
  };

  const partialPaymentRepository = {
    create(payload: Record<string, any>) {
      return { createdAt: new Date(), updatedAt: new Date(), ...payload };
    },
    async saveMany(entities: Array<Record<string, any>>) {
      allocations.push(...entities);
      return entities;
    },
    async saveManyInTransaction(entities: Array<Record<string, any>>) {
      allocations.push(...entities);
      return entities;
    },
    async findByPaymentRecord(paymentRecordId: string) {
      return allocations.filter((allocation) => allocation.paymentRecordId === paymentRecordId);
    },
    async findByServiceOrder(serviceOrderId: string) {
      return allocations.filter((allocation) => allocation.serviceOrderId === serviceOrderId);
    },
  };

  const financialExceptionRepository = {
    create(payload: Record<string, any>) {
      return { createdAt: new Date(), updatedAt: new Date(), ...payload };
    },
    async save(entity: Record<string, any>) {
      const index = exceptions.findIndex((item) => item.id === entity.id);
      if (index >= 0) exceptions[index] = entity;
      else exceptions.push(entity);
      return entity;
    },
    async findById(id: string) {
      return exceptions.find((item) => item.id === id) ?? null;
    },
  };

  const service = new FinanceService(
    paymentRecordRepository as never,
    partialPaymentRepository as never,
    financialExceptionRepository as never,
    {
      async getById(serviceOrderId: string) {
        return { ...serviceOrder, id: serviceOrderId };
      },
      async getDetails() {
        return { serviceOrder: { ...serviceOrder }, items: items.map((item) => ({ ...item })) };
      },
      async search() {
        return [{ ...serviceOrder }];
      },
    } as never,
    {
      async getById() {
        return { id: 'tenant-1', blockDeliveryWithOutstandingBalance: true };
      },
    } as never,
    {
      async getById() {
        return { id: 'branch-1', tenantId: 'tenant-1' };
      },
    } as never,
    {
      async record(payload: Record<string, any>) {
        audits.push(payload);
      },
      async listByEntity() {
        return audits;
      },
    } as never,
    {
      async getActiveConfig() {
        return { environment: "sandbox" };
      },
    } as never,
  );

  return { service, payments, allocations, exceptions, audits, serviceOrder };
}

describe('FinanceService', () => {
  it('creates partial item payments and computes financial summary balances', async () => {
    const { service, audits } = createFinanceFixture();

    const result = await service.createPayment({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.PIX,
      paymentProvider: PaymentProviderName.PAGBANK,
      paymentAmount: 20,
      allocations: [{ serviceOrderItemId: 'item-1', allocatedAmount: 20 }],
    });

    assert.equal(result.payment.paymentAmount, '20.00');
    assert.equal(result.allocations.length, 1);
    assert.equal(result.allocations[0]?.serviceOrderItemId, 'item-1');
    assert.equal(result.paymentStatus, ServiceOrderPaymentStatus.PARTIAL);
    assert.equal(result.amountPaid, '20.00');
    assert.equal(result.outstandingBalance, '60.00');
    assert.equal(result.unallocatedPaymentAmount, '0.00');
    assert.equal(result.items[0]?.amountPaid, '20.00');
    assert.equal(result.items[0]?.outstandingBalance, '30.00');
    assert.equal(result.items[1]?.amountPaid, '0.00');
    assert.equal(result.deliveryBlocked, true);
    assert.equal(result.payments?.length, 1);
    assert.equal(result.payments?.[0]?.paymentMethod, PaymentMethod.PIX);
    assert.equal(result.payments?.[0]?.paymentAmount, '20.00');
    assert.equal(audits.some((audit) => audit.action === 'payment_record.created'), true);
  });

  it('auto-allocates payments across multiple items when no explicit allocation is provided', async () => {
    const { service } = createFinanceFixture();

    const result = await service.createPayment({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.CARD,
      manualReason: 'Baixa no balcão',
      paymentAmount: 60,
    });

    assert.equal(result.allocations.length, 2);
    assert.equal(result.allocations[0]?.serviceOrderItemId, 'item-1');
    assert.equal(result.allocations[0]?.allocatedAmount, '50.00');
    assert.equal(result.allocations[1]?.serviceOrderItemId, 'item-2');
    assert.equal(result.allocations[1]?.allocatedAmount, '10.00');
    assert.equal(result.paymentStatus, ServiceOrderPaymentStatus.PARTIAL);
    assert.equal(result.outstandingBalance, '20.00');
    assert.equal(result.items[0]?.outstandingBalance, '0.00');
    assert.equal(result.items[1]?.outstandingBalance, '20.00');
  });

  it('rejects allocation updates that exceed the remaining item balance', async () => {
    const { service } = createFinanceFixture();

    const payment = await service.createPayment({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.CASH,
      manualReason: 'Baixa no balcão',
      paymentAmount: 80,
      allocations: [{ serviceOrderItemId: 'item-1', allocatedAmount: 40 }],
    });

    await assert.rejects(
      () =>
        service.addAllocations(payment.payment.id, 'tenant-1', {
          actorUserId: 'user-2',
          allocations: [{ serviceOrderItemId: 'item-1', allocatedAmount: 20 }],
        }),
      /outstanding balance of the Service Order item/,
    );
  });

  it('forecasts expected cashflow from promised delivery date, payment terms, and outstanding balance', async () => {
    const { service, payments } = createFinanceFixture();
    payments.push({
      id: 'payment-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.PIX,
      paymentDirection: PaymentDirection.INBOUND,
      paymentAmount: '25.00',
      receivedAt: new Date('2026-09-20T10:00:00.000Z'),
      reconciledAt: new Date('2026-09-20T11:00:00.000Z'),
      status: PaymentRecordStatus.RECEIVED,
    });

    const expected = await service.getExpectedCashflow('tenant-1', {
      accessibleBranchIds: ['branch-1'],
      fromDate: '2026-09-20',
      toDate: '2026-10-01',
    });

    assert.equal(expected.length, 1);
    assert.equal(expected[0]?.expectedReceiptDate, '2026-09-28');
    assert.equal(expected[0]?.outstandingBalance, '55.00');
    assert.equal(expected[0]?.paymentStatus, ServiceOrderPaymentStatus.PARTIAL);
  });

  it('tracks financial exceptions with creation and resolution audit entries', async () => {
    const { service, audits } = createFinanceFixture();

    const created = await service.createFinancialException({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      exceptionType: FinancialExceptionType.ALLOCATION_CORRECTION,
      reason: ' Allocation adjusted after review ',
      amountImpact: 5,
    });
    assert.equal(created.status, FinancialExceptionStatus.OPEN);
    assert.equal(created.reason, 'Allocation adjusted after review');

    const resolved = await service.resolveFinancialException(created.id, 'tenant-1', {
      actorUserId: 'manager-1',
      resolutionNotes: 'Approved correction',
    });

    assert.equal(resolved.status, FinancialExceptionStatus.RESOLVED);
    assert.equal(Boolean(resolved.resolvedAt), true);
    assert.equal(audits.some((audit) => audit.action === 'financial_exception.created'), true);
    assert.equal(audits.some((audit) => audit.action === 'financial_exception.resolved'), true);
  });

  it('rejects financial exceptions linked to payments from another service order', async () => {
    const { service, payments } = createFinanceFixture();
    payments.push({
      id: 'payment-other-order',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      serviceOrderId: 'service-order-2',
      paymentMethod: PaymentMethod.PIX,
      paymentDirection: PaymentDirection.INBOUND,
      paymentAmount: '10.00',
      receivedAt: new Date('2026-09-20T10:00:00.000Z'),
      reconciledAt: null,
      status: PaymentRecordStatus.RECEIVED,
    });

    await assert.rejects(
      () =>
        service.createFinancialException({
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          serviceOrderId: 'service-order-1',
          paymentRecordId: 'payment-other-order',
          exceptionType: FinancialExceptionType.DUPLICATE_PAYMENT,
          reason: 'Payment mismatch',
        }),
      /must belong to the same Service Order/,
    );
  });

  it('returns actual cashflow using only inbound received or settled payments', async () => {
    const { service, payments } = createFinanceFixture();
    payments.push(
      {
        id: 'payment-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        serviceOrderId: 'service-order-1',
        paymentMethod: PaymentMethod.PIX,
        paymentDirection: PaymentDirection.INBOUND,
        paymentAmount: '25.00',
        receivedAt: new Date('2026-09-20T10:00:00.000Z'),
        reconciledAt: null,
        status: PaymentRecordStatus.RECEIVED,
      },
      {
        id: 'payment-2',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        serviceOrderId: 'service-order-1',
        paymentMethod: PaymentMethod.PIX,
        paymentDirection: PaymentDirection.OUTBOUND,
        paymentAmount: '5.00',
        receivedAt: new Date('2026-09-20T10:30:00.000Z'),
        reconciledAt: null,
        status: PaymentRecordStatus.RECEIVED,
      },
      {
        id: 'payment-3',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        serviceOrderId: 'service-order-1',
        paymentMethod: PaymentMethod.PIX,
        paymentDirection: PaymentDirection.INBOUND,
        paymentAmount: '8.00',
        receivedAt: new Date('2026-09-20T11:00:00.000Z'),
        reconciledAt: null,
        status: PaymentRecordStatus.FAILED,
      },
    );

    const actual = await service.getActualCashflow('tenant-1', {
      accessibleBranchIds: ['branch-1'],
      paymentMethod: PaymentMethod.PIX,
    });

    assert.equal(actual.length, 1);
    assert.equal(actual[0]?.paymentId, 'payment-1');
    assert.equal(actual[0]?.paymentAmount, '25.00');
  });

  it('keeps the suspended piece out of the open balance and blocks a second pending charge', async () => {
    const { service } = createFinanceFixture({
      totalValue: '80.00',
      items: [
        { id: 'item-1', itemNo: 1, description: 'Entregue', quantity: '1', unitPrice: '50.00', discountValue: '0.00', heldForRework: false },
        { id: 'item-2', itemNo: 2, description: 'Suspensa', quantity: '1', unitPrice: '30.00', discountValue: '0.00', heldForRework: true },
      ],
    });

    const partial = await service.createPayment({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.CASH,
      manualReason: 'Baixa no balcão',
      paymentAmount: 20,
    });
    assert.equal(partial.exigivel, '50.00');
    assert.equal(partial.suspenso, '30.00');
    assert.equal(partial.outstandingBalance, '30.00');

    await assert.rejects(
      () =>
        service.createPayment({
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          serviceOrderId: 'service-order-1',
          paymentMethod: PaymentMethod.CARD,
          paymentAmount: 40,
          status: PaymentRecordStatus.PENDING,
        }),
      /saldo em aberto/,
    );

    await service.createPayment({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.CARD,
      paymentAmount: 10,
      status: PaymentRecordStatus.PENDING,
    });
    await assert.rejects(
      () =>
        service.createPayment({
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          serviceOrderId: 'service-order-1',
          paymentMethod: PaymentMethod.PIX,
          manualReason: 'Baixa no balcão',
          paymentAmount: 10,
        }),
      /aguardando confirmação/,
    );
  });

  it('reverses a received payment with a reason and reopens the balance', async () => {
    const { service, audits } = createFinanceFixture();
    const created = await service.createPayment({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      serviceOrderId: 'service-order-1',
      paymentMethod: PaymentMethod.CASH,
      manualReason: 'Baixa no balcão',
      paymentAmount: 80,
    });
    assert.equal(created.outstandingBalance, '0.00');

    await assert.rejects(() => service.reversePayment(created.payment.id, 'tenant-1', 'manager-1', '   '), /motivo do estorno/);

    const reversed = await service.reversePayment(created.payment.id, 'tenant-1', 'manager-1', 'Cliente desistiu');
    assert.equal(reversed.paymentStatus, ServiceOrderPaymentStatus.PENDING);
    assert.equal(reversed.outstandingBalance, '80.00');
    assert.equal(reversed.amountPaid, '0.00');
    assert.equal(reversed.payments?.[0]?.status, PaymentRecordStatus.REVERSED);
    assert.equal(reversed.payments?.[0]?.reversalReason, 'Cliente desistiu');
    assert.equal(audits.some((audit) => audit.action === 'finance.payment.reversed'), true);
  });
});
