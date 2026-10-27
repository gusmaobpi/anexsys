import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeliveryType, UserStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { todayDateOnly } from 'src/modules/service-orders/application/service-order/service-order-return';

function buildDataSource() {
  return {
    async transaction(callback: (manager: any) => Promise<unknown>) {
      const manager = {
        create(_entity: unknown, payload: Record<string, unknown>) {
          return payload;
        },
        async save(_entity: unknown, payload: Record<string, unknown>) {
          return payload;
        },
      };
      return callback(manager);
    },
  };
}

function piece(overrides: Record<string, unknown> = {}) {
  return {
    itemType: 'uniform',
    description: 'Jacket',
    quantity: 1,
    brand: 'Levi',
    model: '501',
    serialNo: 'SN-1',
    ...overrides,
  };
}

describe('ServiceOrderService', () => {
  it('creates a service order with default commercial responsibility and calculated totals', async () => {
    const audits: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; }, async save(payload: Record<string, unknown>) { return payload; }, async nextGroupSeq() { return 2; } } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; }, async suggestDeliveryDate() { return '2026-10-01'; } } as never,
      { async record(payload: Record<string, unknown>) { audits.push(payload); }, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const created = await service.create({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      actorUserId: 'user-1',
      promisedDeliveryTime: '18:00',
      deliveryType: DeliveryType.PRIORITY,
      deliverySurchargeMethod: 'fixed' as never,
      deliverySurchargeValue: 15,
      discountValue: 5,
      items: [
        piece({ quantity: 2, unitPrice: 50, discountValue: 10 }),
      ],
    });

    assert.equal(created.serviceOrder.commercialResponsibleActorId, 'user-1');
    assert.equal(created.serviceOrder.promisedDeliveryDate, '2026-10-01');
    assert.equal(created.serviceOrder.promisedDeliveryTime, '18:00');
    assert.equal(created.serviceOrder.orderNo, 'AAA000002');
    assert.equal(created.serviceOrder.bagClosed, false);
    assert.equal(created.items[0]?.itemType, 'uniform');
    assert.equal(created.items[0]?.description, 'Jacket');
    assert.equal(created.items[0]?.quantity, '1.0000');
    assert.equal(created.items[0]?.brand, 'Levi');
    assert.equal(created.items[0]?.model, '501');
    assert.equal(created.items[0]?.serialNo, 'SN-1');
    assert.equal(created.items[0]?.discountValue, '10.00');
    assert.equal(audits[0]?.action, 'service_order.created');
  });

  it('stores the promised delivery time as HH:MM when the suggestion includes seconds', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; }, async save(payload: Record<string, unknown>) { return payload; }, async nextGroupSeq() { return 2; } } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-14', promisedDeliveryTime: '18:00:00' }; } } as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const created = await service.create({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      actorUserId: 'user-1',
      promisedDeliveryTime: '18:00:00',
      items: [piece({ itemType: 'uniform', description: 'Calça', unitPrice: 40 })],
    });

    assert.equal(created.serviceOrder.promisedDeliveryTime, '18:00');
  });

  it('normalizes service order items before persistence and total calculation', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; }, async save(payload: Record<string, unknown>) { return payload; }, async nextGroupSeq() { return 2; } } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; }, async suggestDeliveryDate() { return '2026-10-01'; } } as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const created = await service.create({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      actorUserId: 'user-1',
      items: [
        piece({ itemType: '  uniform  ', description: '  Jacket  ', quantity: 2, unitPrice: undefined, discountValue: undefined, deliveryType: undefined, operationalPriority: '   ', brand: '  Levi  ', model: '  501  ', serialNo: '  SN-1  ' }),
      ],
    });

    assert.equal(created.items[0]?.itemType, 'uniform');
    assert.equal(created.items[0]?.description, 'Jacket');
    assert.equal(created.items[0]?.brand, 'Levi');
    assert.equal(created.items[0]?.model, '501');
    assert.equal(created.items[0]?.serialNo, 'SN-1');
    assert.equal(created.items[0]?.unitPrice, null);
    assert.equal(created.items[0]?.discountValue, '0.00');
    assert.equal(created.items[0]?.deliveryType, null);
    assert.equal(created.items[0]?.operationalPriority, null);
    assert.equal(created.serviceOrder.totalValue, null);
  });

  it('rejects a branch-scoped customer from another branch', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; } } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-2' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; }, async suggestDeliveryDate() { return '2026-10-01'; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          customerId: 'customer-1',
          actorUserId: 'user-1',
          items: [piece()],
        }),
      DomainValidationError,
    );
  });

  it('rejects a piece without brand', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; } } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          customerId: 'customer-1',
          actorUserId: 'user-1',
          items: [piece({ brand: '   ' })],
        }),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /marca/);
        return true;
      },
    );
  });

  it('saves a piece with brand and empty model and serial', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; }, async save(payload: Record<string, unknown>) { return payload; }, async nextGroupSeq() { return 2; } } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; } } as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const created = await service.create({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      actorUserId: 'user-1',
      items: [piece({ model: '', serialNo: '  ' })],
    });
    assert.equal(created.items[0]?.brand, 'Levi');
    assert.equal(created.items[0]?.model, '');
    assert.equal(created.items[0]?.serialNo, '');
  });

  it('prints the service order with values and keeps internal notes out', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { async findById() { return { id: 'so-1', tenantId: 'tenant-1', customerId: 'customer-1', commercialResponsibleActorId: 'user-1', technicalMeasurementResponsibleActorId: 'user-1', orderNo: 'OS-1', status: 'open', openedAt: '2026-10-07T10:00:00.000Z', promisedDeliveryDate: '2026-10-14', promisedDeliveryTime: '18:00', deliveryType: DeliveryType.STANDARD, totalValue: '90.00', customerNotes: 'Garantia 90 dias', commercialNotes: 'nao imprimir' }; }, async findByGroupId() { return []; }, async findByOriginServiceOrderId() { return []; } } as never,
      { async findByServiceOrder() { return [{ id: 'item-1', itemNo: 1, itemType: 'Calça', description: 'Bainha', complement: 'Barra 4 cm', brand: 'Levi', model: '501', serialNo: 'SN-1', quantity: '1', unitPrice: '90.00', discountValue: '0.00', status: 'open', isDeleted: false }]; } } as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', legalName: 'Maria Silva', phone: '11988887777', email: 'maria@test.com' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-14', promisedDeliveryTime: '18:00' }; } } as never,
      { async listByEntity() { return []; } } as never,
      {} as never,
    );

    const printView = await service.getPrintView('tenant-1', 'so-1');
    assert.equal(printView.orderNo, 'OS-1');
    assert.equal(printView.totalValue, '90.00');
    assert.equal(printView.items[0]?.subtotal, '90.00');
    assert.equal(printView.items[0]?.brand, 'Levi');
    assert.equal(printView.items[0]?.model, '501');
    assert.equal(printView.items[0]?.serialNo, 'SN-1');
    assert.equal(printView.customerNotes, 'Garantia 90 dias');
    assert.equal('commercialNotes' in printView, false);
  });

  it('recalculates the promised delivery from the current type without changing status', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      status: 'open',
      deliveryType: DeliveryType.PRIORITY,
      deliveryCommitmentSourceAt: '2026-10-03T10:00:00.000Z',
      promisedDeliveryDate: '2026-10-14',
      promisedDeliveryTime: '18:00',
      orderNo: 'AAA000001',
    };
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return source;
        },
        async save(payload: Record<string, unknown>) {
          Object.assign(source, payload);
          return source;
        },
      } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-08', promisedDeliveryTime: '18:00' }; } } as never,
      { async record() {} } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.recalculateDeliveryDate('so-1', 'tenant-1', 'user-1');
    assert.equal(result.promisedDeliveryDate, '2026-10-08');
    assert.equal(result.promisedDeliveryTime, '18:00');
    assert.equal(result.status, 'open');
  });

  it('rejects more than five pieces on a service order', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; } } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          customerId: 'customer-1',
          actorUserId: 'user-1',
          items: Array.from({ length: 6 }, (_, index) => piece({
            itemType: `Peca ${index + 1}`,
            description: 'Bainha',
            serialNo: `SN-${index + 1}`,
          })),
        }),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /Feche a sacola/);
        return true;
      },
    );
  });

  it('respects a parametrized piece limit smaller than the default', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      { create(payload: Record<string, unknown>) { return payload; } } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 3 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-01', promisedDeliveryTime: '18:00' }; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          customerId: 'customer-1',
          actorUserId: 'user-1',
          items: Array.from({ length: 4 }, (_, index) => piece({
            itemType: `Peca ${index + 1}`,
            description: 'Bainha',
            serialNo: `SN-${index + 1}`,
          })),
        }),
      DomainValidationError,
    );
  });

  it('spawns the next linked OS version with the same header and a numeric suffix', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      groupId: 'so-1',
      groupSeq: 2,
      versionSuffix: null,
      orderNo: '00002',
      bagClosed: true,
      status: 'open',
      deliveryCommitmentSourceAt: new Date('2026-10-07T10:00:00.000Z'),
      promisedDeliveryDate: '2026-10-14',
      promisedDeliveryTime: '18:00',
      paymentTermsDays: 0,
      deliveryType: DeliveryType.STANDARD,
      operationalPriority: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
      deliverySurchargeMethod: null,
      deliverySurchargeValue: null,
      commercialNotes: 'interno',
      customerNotes: 'Garantia 90 dias',
    };
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById(id: string) {
          return id === 'so-2' ? saved[0] : source;
        },
        async findByGroupId() {
          return [source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async save(payload: Record<string, unknown>) {
          saved.push({ ...payload, id: 'so-2' });
          return saved[0];
        },
      } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const spawned = await service.spawnNextVersion('tenant-1', 'so-1', 'user-1');
    assert.equal(saved[0]?.orderNo, '00002-1');
    assert.equal(saved[0]?.versionSuffix, '1');
    assert.equal(saved[0]?.bagClosed, false);
    assert.equal(saved[0]?.customerId, 'customer-1');
    assert.equal(saved[0]?.customerNotes, 'Garantia 90 dias');
    assert.equal(spawned.serviceOrder.orderNo, '00002-1');
  });

  it('rejects spawning the next version before the bag is closed', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return { id: 'so-1', tenantId: 'tenant-1', bagClosed: false };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () => service.spawnNextVersion('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /Feche a sacola/);
        return true;
      },
    );
  });

  it('closes the bag, locks the version and refuses later piece edits', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      bagClosed: false,
      status: 'open',
      orderNo: 'AAA000001',
      groupId: 'so-1',
    };
    const saved: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return saved[0] ?? source;
        },
        async findByGroupId() {
          return [saved[0] ?? source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async save(payload: Record<string, unknown>) {
          saved.push({ ...source, ...payload });
          return saved[saved.length - 1];
        },
      } as never,
      {
        async findByServiceOrder() {
          return [{ id: 'item-1', itemNo: 1, status: 'open', isDeleted: false, quantity: '1.0000', unitPrice: '40.00', discountValue: '0.00' }];
        },
      } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const closed = await service.closeBag('tenant-1', 'so-1', 'user-1');
    assert.equal(saved[0]?.bagClosed, true);
    assert.equal(closed.serviceOrder.bagClosed, true);

    await assert.rejects(
      () => service.closeBag('tenant-1', 'so-1', 'user-1'),
      DomainValidationError,
    );
    await assert.rejects(
      () =>
        service.update('so-1', 'tenant-1', {
          actorUserId: 'user-1',
          customerNotes: 'nao pode',
        }),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /já está fechada/);
        return true;
      },
    );
    await assert.rejects(
      () =>
        service.addItem({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          serviceOrderId: 'so-1',
          actorUserId: 'user-1',
          itemType: 'Calça',
          description: 'Bainha',
          quantity: 1,
        }),
      DomainValidationError,
    );

    const reopened = await service.reopenBag('tenant-1', 'so-1', 'user-1');
    assert.equal(saved[saved.length - 1]?.bagClosed, false);
    assert.equal(reopened.serviceOrder.bagClosed, false);
  });

  it('rejects reopening a bag that is already open', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return { id: 'so-1', tenantId: 'tenant-1', bagClosed: false, status: 'open' };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () => service.reopenBag('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /já está aberta/);
        return true;
      },
    );
  });

  it('keeps a bag in production until each item is finished', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return { id: 'so-1', tenantId: 'tenant-1', status: 'in_production', bagClosed: true, branchId: 'branch-1' };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () => service.advanceFloor('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /último item/);
        return true;
      },
    );
  });

  it('refuses floor advance while the bag is open', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return { id: 'so-1', tenantId: 'tenant-1', status: 'open', bagClosed: false, branchId: 'branch-1' };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () => service.advanceFloor('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /próximo passo/);
        return true;
      },
    );
  });

  it('refuses reopening the bag after production started', async () => {
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return { id: 'so-1', tenantId: 'tenant-1', status: 'in_production', bagClosed: true };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () => service.reopenBag('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /produção começou/);
        return true;
      },
    );
  });

  it('marks a ready OS as picked up and refuses a second delivery', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'ready_for_pickup',
      bagClosed: true,
      orderNo: 'AAA000001',
      actualPickupDate: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
    };
    const saved: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return saved[0] ?? source;
        },
        async findByGroupId() {
          return [saved[0] ?? source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async save(payload: Record<string, unknown>) {
          saved.push({ ...source, ...payload });
          return saved[saved.length - 1];
        },
      } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const delivered = await service.markPickedUp('tenant-1', 'so-1', 'user-1');
    assert.equal(delivered.serviceOrder.status, 'picked_up');
    assert.equal(typeof delivered.serviceOrder.actualPickupDate, 'string');

    await assert.rejects(
      () => service.markPickedUp('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /já foi retirada/);
        return true;
      },
    );
  });

  it('opens a pickup window and records paper or attendant evidence', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'ready_for_pickup',
      bagClosed: true,
      orderNo: 'AAA000001',
      actualPickupDate: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
    };
    const pickups: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return source;
        },
        async findByGroupId() {
          return [source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async save(payload: Record<string, unknown>) {
          Object.assign(source, payload);
          return source;
        },
      } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1', phone: '11988887777' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE, displayName: 'Ana' }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
      {} as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async save(payload: Record<string, unknown>) {
          const index = pickups.findIndex((row) => row.id === payload.id);
          if (index >= 0) {
            pickups[index] = { ...pickups[index], ...payload };
            return pickups[index];
          }
          pickups.push(payload);
          return payload;
        },
        async findLatestByServiceOrder() {
          return pickups[pickups.length - 1] ?? null;
        },
      } as never,
    );

    const started = await service.startPickup('tenant-1', 'so-1', 'user-1');
    assert.equal(started.pickup.windowOpen, true);
    assert.equal(started.pickup.recebiReady, true);
    assert.equal(started.serviceOrder.status, 'ready_for_pickup');

    await assert.rejects(
      () => service.completePickup('tenant-1', 'so-1', 'user-1', { method: 'paper' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /foto da OP assinada/);
        return true;
      },
    );

    const paper = await service.completePickup('tenant-1', 'so-1', 'user-1', {
      method: 'paper',
      photo: { mimeType: 'image/jpeg', contentBase64: 'AAAA', fileName: 'op.jpg' },
    });
    assert.equal(paper.serviceOrder.status, 'picked_up');
    assert.equal(paper.pickup.method, 'paper');
    assert.equal(paper.pickup.photoAvailable, true);
    assert.equal(paper.pickup.customerPhone, '11988887777');

    source.status = 'ready_for_pickup';
    source.actualPickupDate = null;
    pickups.length = 0;
    const linked = await service.startPickup('tenant-1', 'so-1', 'user-1');
    assert.equal(linked.pickup.recebiReady, true);
    const fromLink = await service.confirmPickupFromLink('tenant-1', 'so-1', { userAgent: 'Mozilla', ip: '127.0.0.1' });
    assert.equal(fromLink.pickup.method, 'link');
    assert.match(fromLink.pickup.acceptedText, /Confirmo que retirei a OS AAA000001/);

    source.status = 'ready_for_pickup';
    source.actualPickupDate = null;
    pickups.length = 0;
    await assert.rejects(
      () => service.confirmPickupFromLink('tenant-1', 'so-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /inicia a retirada/);
        return true;
      },
    );
  });

  it('sends an in-production OS to proof on the same plate and same OP version', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'in_production',
      bagClosed: true,
      orderNo: 'AAA000001',
      versionSuffix: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
    };
    const saved: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return saved[saved.length - 1] ?? source;
        },
        async findByGroupId() {
          return [saved[saved.length - 1] ?? source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async findActiveFloorBags() {
          return [];
        },
        async save(payload: Record<string, unknown>) {
          saved.push({ ...source, ...payload });
          return saved[saved.length - 1];
        },
      } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      {} as never,
      { async record(payload: Record<string, unknown>) { audits.push(payload); }, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const sent = await service.sendToProof('tenant-1', 'so-1', 'user-1');
    assert.equal(sent.serviceOrder.status, 'awaiting_proof');
    assert.equal(sent.serviceOrder.orderNo, 'AAA000001');
    assert.equal(sent.serviceOrder.versionSuffix, null);
    assert.equal(audits[0]?.action, 'service_order.proof.send_to_proof');

    const completed = await service.completeProof('tenant-1', 'so-1', 'user-1');
    assert.equal(completed.serviceOrder.status, 'in_production');
    assert.equal(completed.serviceOrder.orderNo, 'AAA000001');
  });

  it('returns from proof to production on the same OS and refuses a second busy bag', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'awaiting_proof',
      bagClosed: true,
      orderNo: 'AAA000001',
      versionSuffix: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
    };
    const saved: Array<Record<string, unknown>> = [];
    let busy: Array<{ orderNo: string }> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return saved[0] ?? source;
        },
        async findByGroupId() {
          return [saved[0] ?? source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async findActiveFloorBags() {
          return busy;
        },
        async save(payload: Record<string, unknown>) {
          saved.push({ ...source, ...payload });
          return saved[saved.length - 1];
        },
      } as never,
      { async findByServiceOrder() { return []; } } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const completed = await service.completeProof('tenant-1', 'so-1', 'user-1');
    assert.equal(completed.serviceOrder.status, 'in_production');
    assert.equal(completed.serviceOrder.orderNo, 'AAA000001');

    source.status = 'awaiting_proof';
    saved.length = 0;
    busy = [{ orderNo: 'AAA000009' }];
    await assert.rejects(
      () => service.completeProof('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /Já existe uma sacola em produção \(AAA000009\)/);
        return true;
      },
    );

    await assert.rejects(
      () => service.sendToProof('tenant-1', 'so-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /em produção/);
        return true;
      },
    );
  });

  it('records piece-linked proof notes and reprints only when there is text', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'awaiting_proof',
      bagClosed: true,
      orderNo: 'AAA000001',
      versionSuffix: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
    };
    const items = [
      { id: 'item-1', itemNo: 1, itemType: 'Calça', description: 'Bainha', status: 'open', isDeleted: false },
      { id: 'item-2', itemNo: 2, itemType: 'Saia', description: 'Cintura', status: 'open', isDeleted: false },
    ];
    const savedNotes: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return source;
        },
        async findByGroupId() {
          return [source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async findActiveFloorBags() {
          return [];
        },
        async save(payload: Record<string, unknown>) {
          Object.assign(source, payload);
          return source;
        },
      } as never,
      { async findByServiceOrder() { return items; } } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE, displayName: 'Técnica Ana' }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async save(payload: Record<string, unknown>) {
          savedNotes.push(payload);
          return payload;
        },
        async findByServiceOrder() {
          return savedNotes.map((note) => ({
            ...note,
            createdAt: new Date('2026-10-08T15:00:00.000Z'),
            createdBy: 'user-1',
          }));
        },
      } as never,
    );

    const empty = await service.completeProof('tenant-1', 'so-1', 'user-1', [{ itemId: 'item-1', note: '   ' }]);
    assert.equal(empty.reprintProof, false);
    assert.equal(savedNotes.length, 0);
    assert.equal(empty.serviceOrder.status, 'in_production');

    source.status = 'awaiting_proof';
    const withNotes = await service.completeProof('tenant-1', 'so-1', 'user-1', [
      { itemId: 'item-1', note: 'subir 1 cm' },
      { itemId: 'item-2', note: '' },
    ]);
    assert.equal(withNotes.reprintProof, true);
    assert.equal(savedNotes.length, 1);
    assert.equal(savedNotes[0]?.serviceOrderItemId, 'item-1');
    assert.equal(savedNotes[0]?.note, 'subir 1 cm');
    assert.equal(savedNotes[0]?.serviceOrderId, 'so-1');
    assert.equal(withNotes.proofNotes[0]?.items[0]?.note, 'subir 1 cm');
    assert.equal(withNotes.proofNotes[0]?.createdByName, 'Técnica Ana');

    const latest = await service.latestProofNotesByItem('so-1');
    assert.equal(latest.get('item-1'), 'subir 1 cm');

    source.status = 'awaiting_proof';
    await assert.rejects(
      () => service.completeProof('tenant-1', 'so-1', 'user-1', [{ itemId: 'item-x', note: 'peça de outra OS' }]),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /peça desta OS/);
        return true;
      },
    );
  });

  it('opens a reconserto in the same family with letter R and zero prices', async () => {
    const origin = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'picked_up',
      bagClosed: true,
      orderNo: 'AAA000001',
      groupId: 'so-1',
      groupSeq: 1,
      versionSuffix: null,
      actualPickupDate: todayDateOnly(),
      deliveryType: DeliveryType.STANDARD,
      operationalPriority: null,
      paymentTermsDays: 0,
      commercialResponsibleActorId: 'tech-1',
      technicalMeasurementResponsibleActorId: 'tech-1',
      workflowDefinitionId: null,
      deliverySurchargeMethod: null,
      deliverySurchargeValue: null,
      commercialNotes: null,
      customerNotes: 'Garantia 90 dias',
      discountValue: null,
    };
    const created: Array<Record<string, unknown>> = [];
    const items: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      {
        async transaction(callback: (manager: any) => Promise<unknown>) {
          const manager = {
            create(_entity: unknown, payload: Record<string, unknown>) {
              return payload;
            },
            async save(_entity: unknown, payload: Record<string, unknown>) {
              if (payload.orderNo) {
                created.push(payload);
              } else {
                items.push(payload);
              }
              return payload;
            },
          };
          return callback(manager);
        },
      } as never,
      {
        async findById(id: string) {
          if (created[0] && id === created[0].id) {
            return created[0];
          }
          return origin;
        },
        async findByGroupId() {
          return created;
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async nextGroupSeq() {
          return 9;
        },
      } as never,
      {
        async findByServiceOrder(serviceOrderId: string) {
          if (serviceOrderId === 'so-1') {
            return [
              {
                id: 'item-1',
                itemNo: 1,
                itemType: 'Calça',
                description: 'Bainha',
                complement: 'Barra 4 cm',
                brand: 'Levi',
                model: '501',
                serialNo: 'SN-1',
                productId: null,
                serviceId: null,
                quantity: '1.0000',
                unitPrice: '90.00',
                discountValue: '0.00',
                deliveryType: null,
                operationalPriority: null,
                status: 'open',
                isDeleted: false,
              },
            ];
          }
          return items;
        },
      } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1', legalName: 'Maria' }; } } as never,
      { async getById() { return { id: 'tech-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-15', promisedDeliveryTime: '18:00' }; } } as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const child = await service.createClientReturn('tenant-1', 'so-1', 'user-1', ['item-1']);
    assert.equal(created[0]?.orderNo, 'AAA000001-R');
    assert.equal(created[0]?.originServiceOrderId, 'so-1');
    assert.equal(created[0]?.returnKind, 'reconserto');
    assert.equal(created[0]?.versionSuffix, 'R');
    assert.equal(created[0]?.groupId, 'so-1');
    assert.equal(created[0]?.technicalMeasurementResponsibleActorId, 'tech-1');
    assert.equal(created[0]?.totalValue, null);
    assert.equal(items[0]?.unitPrice, null);
    assert.equal(child.serviceOrder.orderNo, 'AAA000001-R');
  });

  it('opens counter rework in the same family with letter C and keeps the mother ready for pickup', async () => {
    const origin = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'ready_for_pickup',
      bagClosed: true,
      orderNo: 'AAA000001',
      groupId: 'so-1',
      groupSeq: 1,
      versionSuffix: null,
      deliveryType: DeliveryType.STANDARD,
      operationalPriority: null,
      paymentTermsDays: 0,
      commercialResponsibleActorId: 'tech-1',
      technicalMeasurementResponsibleActorId: 'tech-1',
      workflowDefinitionId: null,
      deliverySurchargeMethod: null,
      deliverySurchargeValue: null,
      commercialNotes: null,
      customerNotes: null,
      discountValue: null,
    };
    const created: Array<Record<string, unknown>> = [];
    const items: Array<Record<string, unknown>> = [];
    const originItem = {
      id: 'item-1',
      itemNo: 1,
      itemType: 'Calça',
      description: 'Bainha',
      complement: 'Barra 4 cm',
      brand: 'Levi',
      model: '501',
      serialNo: 'SN-1',
      productId: null,
      serviceId: null,
      quantity: '1.0000',
      unitPrice: '90.00',
      discountValue: '0.00',
      deliveryType: null,
      operationalPriority: null,
      status: 'open',
      isDeleted: false,
      heldForRework: false,
    };
    const service = new ServiceOrderService(
      {
        async transaction(callback: (manager: any) => Promise<unknown>) {
          const manager = {
            create(_entity: unknown, payload: Record<string, unknown>) {
              return payload;
            },
            async save(_entity: unknown, payload: Record<string, unknown>) {
              if (payload.orderNo) {
                created.push(payload);
              } else {
                items.push(payload);
              }
              return payload;
            },
          };
          return callback(manager);
        },
      } as never,
      {
        async findById(id: string) {
          if (created[0] && id === created[0].id) {
            return created[0];
          }
          return origin;
        },
        async findByGroupId() {
          return created;
        },
        async findByOriginServiceOrderId() {
          return [];
        },
      } as never,
      {
        async findByServiceOrder(serviceOrderId: string) {
          if (serviceOrderId === 'so-1') {
            return [originItem];
          }
          return items;
        },
      } as never,
      { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1', legalName: 'Maria' }; } } as never,
      { async getById() { return { id: 'tech-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE }; } } as never,
      { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-15', promisedDeliveryTime: '18:00' }; } } as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
    );

    const child = await service.createCounterRework('tenant-1', 'so-1', 'user-1', ['item-1'], 'Bainha ficou curta');
    assert.equal(created[0]?.orderNo, 'AAA000001-C');
    assert.equal(created[0]?.versionSuffix, 'C');
    assert.equal(created[0]?.returnKind, 'counter');
    assert.equal(created[0]?.groupId, 'so-1');
    assert.equal(created[0]?.originServiceOrderId, 'so-1');
    assert.equal(origin.status, 'ready_for_pickup');
    assert.equal(originItem.heldForRework, true);
    assert.match(String(created[0]?.commercialNotes), /Bainha ficou curta/);
    assert.equal(child.serviceOrder.orderNo, 'AAA000001-C');
  });

  it('exposes the printed OS on the public link and confirms Recebi only with an open window', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      status: 'ready_for_pickup',
      bagClosed: true,
      orderNo: 'AAA000001',
      publicToken: '11111111-1111-4111-8111-111111111111',
      deliveryType: 'Standard',
      totalValue: '90.00',
      customerNotes: 'Barra original',
      openedAt: '2026-10-03T10:00:00.000Z',
      promisedDeliveryDate: '2026-10-18',
      promisedDeliveryTime: '18:00',
      actualPickupDate: null,
      commercialResponsibleActorId: 'user-1',
      technicalMeasurementResponsibleActorId: 'user-1',
    };
    const pickups: Array<Record<string, unknown>> = [];
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findById() {
          return source;
        },
        async findByPublicToken(token: string) {
          return token === source.publicToken ? source : null;
        },
        async findByGroupId() {
          return [source];
        },
        async findByOriginServiceOrderId() {
          return [];
        },
        async save(payload: Record<string, unknown>) {
          Object.assign(source, payload);
          return source;
        },
      } as never,
      { async findByServiceOrder() { return [{ id: 'item-1', itemNo: 1, itemType: 'Calça', description: 'Bainha', complement: 'barra', unitPrice: '90.00' }]; } } as never,
      { async getById() { return { id: 'tenant-1', displayName: 'Ateliê A', legalName: 'Ateliê A Ltda', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
      { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1', legalName: 'Sandra Legramanti', phone: '11988887777' }; } } as never,
      { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE, displayName: 'Ana' }; } } as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {} as never,
      {} as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async save(payload: Record<string, unknown>) {
          pickups.push({ ...payload });
          return pickups[pickups.length - 1];
        },
        async findLatestByServiceOrder() {
          return pickups[pickups.length - 1] ?? null;
        },
      } as never,
    );

    const closed = await service.getPublicTrackingView(source.publicToken);
    assert.equal(closed.customerFirstName, 'Sandra');
    assert.equal(closed.customerName, 'Sandra Legramanti');
    assert.equal(closed.statusLabel, 'Pronto para retirada');
    assert.equal(closed.recebiReady, false);
    assert.equal(closed.items[0].unitPrice, '90.00');
    assert.equal(closed.items[0].subtotal, '90.00');
    assert.equal(closed.totalValue, '90.00');
    assert.equal(closed.customerNotes, 'Barra original');

    await service.startPickup('tenant-1', 'so-1', 'user-1');
    const opened = await service.getPublicTrackingView(source.publicToken);
    assert.equal(opened.recebiReady, true);

    const confirmed = await service.confirmPublicRecebi(source.publicToken, { userAgent: 'Mozilla', ip: '127.0.0.1' });
    assert.equal(confirmed.pickedUp, true);
    assert.equal(confirmed.statusLabel, 'Retirado');
  });

  it('opens the public OS without loading attendant identity or audit history', async () => {
    const source = {
      id: 'so-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      status: 'in_production',
      orderNo: 'AAA000001',
      publicToken: '11111111-1111-4111-8111-111111111111',
      deliveryType: 'Standard',
      totalValue: '40.00',
      customerNotes: null,
      openedAt: '2026-10-03T10:00:00.000Z',
      promisedDeliveryDate: '2026-10-18',
      promisedDeliveryTime: null,
    };
    const service = new ServiceOrderService(
      buildDataSource() as never,
      {
        async findByPublicToken(token: string) {
          return token === source.publicToken ? source : null;
        },
      } as never,
      { async findByServiceOrder() { return [{ id: 'item-1', itemNo: 1, itemType: 'Calça', description: 'Bainha', unitPrice: '40.00' }]; } } as never,
      { async getById() { return { id: 'tenant-1', displayName: 'Ateliê A', legalName: 'Ateliê A Ltda' }; } } as never,
      {} as never,
      { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', legalName: 'Sandra Legramanti', phone: null }; } } as never,
      {
        async getById() {
          throw new Error('public tracking must not load the attendant identity');
        },
      } as never,
      {} as never,
      {
        async listByEntity() {
          throw new Error('public tracking must not load the audit trail');
        },
      } as never,
      {} as never,
      {} as never,
      {
        async findLatestByServiceOrder() {
          return null;
        },
      } as never,
    );

    const view = await service.getPublicTrackingView(source.publicToken);
    assert.equal(view.orderNo, 'AAA000001');
    assert.equal(view.statusLabel, 'Em produção');
    assert.equal(view.items[0].unitPrice, '40.00');
    await assert.rejects(() => service.getPublicTrackingView('not-a-token'), /Este link não foi encontrado/);
  });
});
