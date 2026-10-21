import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QualityService } from 'src/modules/quality/application/quality/quality.service';
import { QualityInspectionResult, QualityReleaseDecision } from 'src/shared/domain/enums';

describe('QualityService', () => {
  it('requests rework from a quality record and links the created case', async () => {
    const audits: Array<Record<string, unknown>> = [];
    const reworkCalls: Array<Record<string, unknown>> = [];
    const record = {
      id: 'quality-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      productionOrderId: 'production-1',
      releaseDecision: QualityReleaseDecision.PENDING,
      inspectionResult: QualityInspectionResult.PENDING,
      updatedBy: null,
      qualityResponsibleActorId: null,
    };

    const service = new QualityService(
      {
        async findById() {
          return record;
        },
        async save(payload: typeof record) {
          return payload;
        },
        create(payload: typeof record) {
          return payload;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { async record(payload: Record<string, unknown>) { audits.push(payload); }, async listByEntity() { return []; } } as never,
      {
        async create(payload: Record<string, unknown>) {
          reworkCalls.push(payload);
          return { id: 'rework-1' };
        },
      } as never,
      {} as never,
    );

    const response = await service.requestRework('quality-1', 'tenant-1', {
      actorUserId: 'user-1',
      affectedServiceOrderItemIds: ['item-1'],
      reworkReason: 'Loose seam found during final inspection',
      correctiveOperationalResourceId: 'resource-2',
      assignmentNotes: 'Route to specialist',
    });

    assert.equal(response.qualityRecord.releaseDecision, QualityReleaseDecision.REWORK_REQUESTED);
    assert.equal(response.qualityRecord.inspectionResult, QualityInspectionResult.FAILED);
    assert.equal(response.reworkCase.id, 'rework-1');
    assert.equal(reworkCalls[0]?.qualityRecordId, 'quality-1');
    assert.equal(audits[0]?.action, 'quality_record.rework.requested');
  });

  it('approves every piece and moves the OS to ready for pickup', async () => {
    const records: Array<Record<string, unknown>> = [];
    const statuses: string[] = [];
    const details = {
      productionOrder: { id: 'production-1', productionNo: 'PO-1' },
      serviceOrder: {
        id: 'so-1',
        orderNo: 'AAA000001',
        status: 'quality',
        bagClosed: true,
        openedAt: '2026-10-03T10:00:00.000Z',
        promisedDeliveryDate: '2026-10-18',
      },
      customer: { legalName: 'Sandra', phone: null },
      items: [
        { id: 'item-1', itemType: 'Calça', description: 'Bainha', complement: 'teste', brand: 'Zara', model: '', serialNo: '' },
      ],
      versions: [],
    };

    const service = new QualityService(
      {
        async findById(id: string) {
          return records.find((record) => record.id === id) ?? null;
        },
        async findByProductionOrder() {
          return records;
        },
        async save(payload: Record<string, unknown>) {
          const index = records.findIndex((record) => record.id === payload.id);
          if (index >= 0) records[index] = { ...records[index], ...payload };
          else records.push(payload);
          return payload;
        },
        create(payload: Record<string, unknown>) {
          return payload;
        },
      } as never,
      {} as never,
      {
        async getDetails() {
          return details;
        },
        async getDetailsByServiceOrder() {
          return details;
        },
        async getPrintView() {
          return { items: details.items };
        },
      } as never,
      {
        async applyQualityStatus(_id: string, _tenant: string, status: string) {
          statuses.push(status);
          details.serviceOrder.status = status;
          return details.serviceOrder;
        },
      } as never,
      {} as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      { async create() { return { id: 'rework-1' }; } } as never,
      {} as never,
    );

    const response = await service.decideItem('tenant-1', 'so-1', 'item-1', 'user-1', ['branch-1'], 'approved');
    assert.equal(response.review.phase, 'ready');
    assert.equal(response.issuedRework, false);
    assert.ok(statuses.includes('quality'));
    assert.ok(statuses.includes('ready_for_pickup'));
  });

  it('issues a rework OP with only rejected pieces and keeps the OS in quality', async () => {
    const records: Array<Record<string, unknown>> = [];
    const reworkCalls: Array<Record<string, unknown>> = [];
    const versions: Array<Record<string, unknown>> = [];
    const details = {
      productionOrder: { id: 'production-1', productionNo: 'PO-1' },
      serviceOrder: {
        id: 'so-1',
        orderNo: 'AAA000001',
        status: 'open',
        bagClosed: true,
        openedAt: '2026-10-03T10:00:00.000Z',
        promisedDeliveryDate: '2026-10-18',
      },
      customer: { legalName: 'Sandra', phone: null },
      items: [
        { id: 'item-1', itemType: 'Calça', description: 'Bainha', complement: 'ok', brand: 'Zara', model: '', serialNo: '' },
        { id: 'item-2', itemType: 'Saia', description: 'Barra', complement: 'curta', brand: 'Zara', model: '', serialNo: '' },
      ],
      versions,
    };

    const service = new QualityService(
      {
        async findById(id: string) {
          return records.find((record) => record.id === id) ?? null;
        },
        async findByProductionOrder() {
          return records;
        },
        async save(payload: Record<string, unknown>) {
          const index = records.findIndex((record) => record.id === payload.id);
          if (index >= 0) records[index] = { ...records[index], ...payload };
          else records.push(payload);
          return payload;
        },
        create(payload: Record<string, unknown>) {
          return payload;
        },
      } as never,
      {} as never,
      {
        async getDetails() {
          return details;
        },
        async getDetailsByServiceOrder() {
          return details;
        },
        async getPrintView() {
          return { items: [{ id: 'item-2', itemType: 'Saia' }], version: { versionNo: 2, versionReason: 'rework' } };
        },
      } as never,
      {
        async applyQualityStatus(_id: string, _tenant: string, status: string) {
          details.serviceOrder.status = status;
          return details.serviceOrder;
        },
      } as never,
      {} as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {
        async create(payload: Record<string, unknown>) {
          reworkCalls.push(payload);
          versions.push({
            isActive: true,
            versionNo: 2,
            versionReason: 'rework',
            affectedServiceOrderItemIds: payload.affectedServiceOrderItemIds,
          });
          return { id: 'rework-1' };
        },
      } as never,
      {} as never,
    );

    await service.decideItem('tenant-1', 'so-1', 'item-1', 'user-1', ['branch-1'], 'approved');
    const response = await service.decideItem('tenant-1', 'so-1', 'item-2', 'user-1', ['branch-1'], 'rejected', 'Barra curta');
    assert.equal(response.issuedRework, true);
    assert.equal(response.review.phase, 'rework_issued');
    assert.deepEqual(reworkCalls[0]?.affectedServiceOrderItemIds, ['item-2']);
    assert.equal(details.serviceOrder.status, 'quality');
    assert.equal(response.printView.items[0]?.rejectionReason, 'Barra curta');
  });

  it('shows approve on a returned rework bag and does not open another version for the other piece', async () => {
    const records: Array<Record<string, unknown>> = [
      {
        id: 'old-1',
        serviceOrderItemId: 'item-1',
        inspectionAt: '2026-10-07T10:00:00.000Z',
        releaseDecision: QualityReleaseDecision.REJECTED,
        notes: 'Barra',
      },
      {
        id: 'old-2',
        serviceOrderItemId: 'item-2',
        inspectionAt: '2026-10-07T10:00:00.000Z',
        releaseDecision: QualityReleaseDecision.REJECTED,
        notes: 'Cós',
      },
    ];
    const reworkCalls: Array<Record<string, unknown>> = [];
    const details = {
      productionOrder: { id: 'production-1', productionNo: 'PO-1', branchId: 'branch-1' },
      serviceOrder: {
        id: 'so-1',
        orderNo: 'AAA000042',
        status: 'awaiting_quality',
        bagClosed: true,
        openedAt: '2026-10-03T10:00:00.000Z',
        promisedDeliveryDate: '2026-10-18',
      },
      customer: { legalName: 'Sandra', phone: null },
      items: [
        { id: 'item-1', itemType: 'Calça', description: 'Bainha', complement: 'ok', brand: 'Zara', model: '', serialNo: '' },
        { id: 'item-2', itemType: 'Saia', description: 'Barra', complement: 'curta', brand: 'Zara', model: '', serialNo: '' },
      ],
      versions: [
        {
          isActive: true,
          versionNo: 2,
          versionReason: 'rework',
          affectedServiceOrderItemIds: ['item-1', 'item-2'],
        },
      ],
    };
    const service = new QualityService(
      {
        async findById(id: string) {
          return records.find((record) => record.id === id) ?? null;
        },
        async findByProductionOrder() {
          return records;
        },
        async save(payload: Record<string, unknown>) {
          const index = records.findIndex((record) => record.id === payload.id);
          if (index >= 0) records[index] = { ...records[index], ...payload };
          else records.push(payload);
          return payload;
        },
        create(payload: Record<string, unknown>) {
          return payload;
        },
      } as never,
      {} as never,
      {
        async getDetails() {
          return details;
        },
        async getDetailsByServiceOrder() {
          return details;
        },
      } as never,
      {
        async applyQualityStatus(_id: string, _tenant: string, status: string) {
          details.serviceOrder.status = status;
          return details.serviceOrder;
        },
      } as never,
      {} as never,
      {} as never,
      { async record() {}, async listByEntity() { return []; } } as never,
      {
        async create(payload: Record<string, unknown>) {
          reworkCalls.push(payload);
          return { id: 'rework-2' };
        },
      } as never,
      {} as never,
    );

    const review = await service.getReview('tenant-1', 'so-1', ['branch-1']);
    assert.equal(review.phase, 'needs_review');
    assert.equal(review.items.find((item) => item.id === 'item-1')?.canDecide, true);
    assert.equal(review.items.find((item) => item.id === 'item-2')?.decision, 'pending');

    const response = await service.decideItem('tenant-1', 'so-1', 'item-1', 'user-1', ['branch-1'], 'approved');
    assert.equal(response.issuedRework, false);
    assert.equal(response.review.phase, 'needs_review');
    assert.equal(response.review.items.find((item) => item.id === 'item-1')?.decision, 'approved');
    assert.equal(response.review.items.find((item) => item.id === 'item-2')?.canDecide, true);
    assert.equal(reworkCalls.length, 0);
  });

  it('lists only closed bags waiting for quality review', async () => {
    const detailsById: Record<string, { serviceOrder: Record<string, unknown>; customer: { legalName: string }; productionOrder?: { productionNo: string }; versions: unknown[] }> = {
      'po-open-bag': {
        serviceOrder: { id: 'so-draft', orderNo: 'AAA000005', status: 'open', bagClosed: false, promisedDeliveryDate: '2026-10-18' },
        customer: { legalName: 'Rascunho' },
        versions: [],
      },
      'po-open': {
        serviceOrder: { id: 'so-open', orderNo: 'AAA000006', status: 'open', bagClosed: true, promisedDeliveryDate: '2026-10-18' },
        customer: { legalName: 'Regiane' },
        productionOrder: { productionNo: 'PO-6' },
        versions: [],
      },
      'po-waiting': {
        serviceOrder: { id: 'so-waiting', orderNo: 'AAA000007', status: 'awaiting_quality', bagClosed: true, promisedDeliveryDate: '2026-10-18' },
        customer: { legalName: 'Isabel' },
        productionOrder: { id: 'po-waiting', productionNo: 'PO-7' },
        versions: [],
      },
      'po-ready': {
        serviceOrder: { id: 'so-ready', orderNo: 'AAA000008', status: 'ready_for_pickup', bagClosed: true, promisedDeliveryDate: '2026-10-18' },
        customer: { legalName: 'André' },
        productionOrder: { productionNo: 'PO-8' },
        versions: [],
      },
    };
    const service = new QualityService(
      {} as never,
      {} as never,
      {
        async getDetailsByServiceOrder(_tenant: string, serviceOrderId: string) {
          const match = Object.values(detailsById).find((details) => details.serviceOrder.id === serviceOrderId);
          return match ?? null;
        },
      } as never,
      {
        async search() {
          return [
            detailsById['po-open-bag'].serviceOrder,
            detailsById['po-open'].serviceOrder,
            detailsById['po-waiting'].serviceOrder,
            detailsById['po-ready'].serviceOrder,
          ];
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reviews = await service.searchReviews('tenant-1', { accessibleBranchIds: ['branch-1'] });
    assert.deepEqual(reviews.map((review) => review.orderNo), ['AAA000007']);
    assert.equal(reviews[0]?.status, 'awaiting_quality');
  });
});
