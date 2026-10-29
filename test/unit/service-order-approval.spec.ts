import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVAL_ACCEPTED_TEXT,
  APPROVAL_PHOTO_MAX_BYTES,
  APPROVAL_RELEASE_TEXT,
  approvalMethodLabel,
  buildApprovalMeasurementsSnapshot,
  buildApprovalServicesSnapshot,
  canRecordApproval,
  isCustomerSignatureMethod,
  normalizeApprovalPhoto,
  normalizeReleaseReason,
} from '../../src/modules/service-orders/application/service-order/service-order-approval';
import { approvalMethodLabel as approvalMethodLabelUi, formatOsInstant } from '../../frontend/src/components/service-orders/os-approval';
import { DomainValidationError } from '../../src/shared/errors/domain-validation.error';
import { UserStatus } from '../../src/shared/domain/enums';
import { ServiceOrderService } from '../../src/modules/service-orders/application/service-order/service-order.service';

test('approval is a signature, not a status change', () => {
  assert.equal(canRecordApproval('open'), true);
  assert.equal(canRecordApproval('in_production'), true);
  assert.equal(canRecordApproval('cancelled'), false);
  assert.equal(canRecordApproval('picked_up'), false);
  assert.equal(isCustomerSignatureMethod('counter'), true);
  assert.equal(isCustomerSignatureMethod('paper'), true);
  assert.equal(isCustomerSignatureMethod('link'), true);
  assert.equal(approvalMethodLabel('link'), 'Link do cliente');
  assert.equal(APPROVAL_ACCEPTED_TEXT, 'Concordo com o serviço e o preço.');
  assert.equal(APPROVAL_RELEASE_TEXT, 'Produção liberada sem assinatura do cliente.');
  assert.equal(approvalMethodLabel('counter'), 'Balcão');
  assert.equal(approvalMethodLabel('paper'), 'Papel');
  assert.equal(approvalMethodLabel('release'), 'Liberação');
  assert.equal(approvalMethodLabelUi('counter'), 'Balcão');
  assert.equal(APPROVAL_PHOTO_MAX_BYTES, 4 * 1024 * 1024);
  assert.match(String(formatOsInstant('2026-10-09T03:15:00.000Z')), /\d/);
  assert.equal(formatOsInstant(null), null);
});

test('paper approval requires a photo and release requires a reason', () => {
  assert.equal(normalizeApprovalPhoto(null), null);
  const photo = normalizeApprovalPhoto({
    mimeType: 'image/jpeg',
    contentBase64: 'data:image/jpeg;base64,AAAA',
    fileName: 'os.jpg',
  });
  assert.equal(photo?.fileName, 'os.jpg');
  assert.throws(
    () => normalizeApprovalPhoto({ mimeType: 'application/pdf', contentBase64: 'AAAA' }),
    (error: unknown) => error instanceof DomainValidationError,
  );
  assert.equal(normalizeReleaseReason('Cliente vai assinar depois'), 'Cliente vai assinar depois');
  assert.throws(
    () => normalizeReleaseReason('  '),
    (error: unknown) => error instanceof DomainValidationError,
  );
});

test('approval snapshots lock the services and measurements used', () => {
  const services = buildApprovalServicesSnapshot([
    { itemNo: 1, itemType: 'Calça', description: 'Bainha', quantity: '1', unitPrice: '40.00', discountValue: null },
  ]);
  assert.equal(services[0]?.description, 'Bainha');
  const measurements = buildApprovalMeasurementsSnapshot([
    {
      measurementLabel: 'Calça',
      measurementData: { comprimento: 100 },
      versionNo: 2,
      measuredAt: new Date('2026-10-09T12:00:00.000Z'),
    },
  ]);
  assert.equal((measurements?.Calça as { comprimento: number }).comprimento, 100);
  assert.equal((measurements?.Calça as { versionNo: number }).versionNo, 2);
});

test('completeApproval keeps the OS open, locks measurements and records paper or release', async () => {
  const source = {
    id: 'so-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    customerId: 'customer-1',
    status: 'open',
    bagClosed: false,
    orderNo: 'AAA000001',
    totalValue: '90.00',
    discountValue: '0.00',
    commercialResponsibleActorId: 'user-1',
    technicalMeasurementResponsibleActorId: 'user-1',
  };
  const approvals: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const service = new ServiceOrderService(
    { async transaction() { return null; } } as never,
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
    {
      async findByServiceOrder() {
        return [{ itemNo: 1, itemType: 'Calça', description: 'Bainha', quantity: '1.0000', unitPrice: '90.00', discountValue: null }];
      },
    } as never,
    { async getById() { return { id: 'tenant-1', maxPiecesPerBag: 5, warrantyAdjustmentPeriodDays: 7, warrantyExecutionPeriodDays: 90 }; } } as never,
    { async getById() { return { id: 'branch-1', tenantId: 'tenant-1' }; } } as never,
    { async getById() { return { id: 'customer-1', tenantId: 'tenant-1', branchId: 'branch-1', phone: '11988887777' }; } } as never,
    { async getById() { return { id: 'user-1', tenantId: 'tenant-1', status: UserStatus.ACTIVE, displayName: 'Ana' }; } } as never,
    { async suggestDelivery() { return { promisedDeliveryDate: '2026-10-16', promisedDeliveryTime: '18:00' }; } } as never,
    { async record(payload: Record<string, unknown>) { audits.push(payload); }, async listByEntity() { return []; } } as never,
    {} as never,
    {} as never,
    { async findLatestByServiceOrder() { return null; } } as never,
    {
      async listByCustomer() {
        return {
          latestByLabel: [
            {
              measurementLabel: 'Calça',
              measurementData: { comprimento: 100 },
              versionNo: 1,
              measuredAt: new Date('2026-10-09T10:00:00.000Z'),
            },
          ],
        };
      },
    } as never,
    {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        const index = approvals.findIndex((row) => row.id === payload.id);
        if (index >= 0) {
          approvals[index] = { ...approvals[index], ...payload };
          return approvals[index];
        }
        approvals.push(payload);
        return payload;
      },
      async findLatestByServiceOrder() {
        return approvals[approvals.length - 1] ?? null;
      },
      async findLatestSignatureByServiceOrder() {
        return [...approvals].reverse().find((row) => row.method === 'counter' || row.method === 'paper') ?? null;
      },
    } as never,
  );

  await assert.rejects(
    () => service.completeApproval('tenant-1', 'so-1', 'user-1', { method: 'paper' }),
    (error: unknown) => {
      assert.ok(error instanceof DomainValidationError);
      assert.match(error.message, /foto da OS assinada/);
      return true;
    },
  );

  const paper = await service.completeApproval('tenant-1', 'so-1', 'user-1', {
    method: 'paper',
    photo: { mimeType: 'image/jpeg', contentBase64: 'AAAA', fileName: 'os.jpg' },
    userAgent: 'Mozilla',
    ip: '127.0.0.1',
  });
  assert.equal(paper.serviceOrder.status, 'open');
  assert.equal(paper.approval.method, 'paper');
  assert.equal(paper.approval.signed, true);
  assert.equal(paper.approval.measurementsLocked, true);
  assert.equal(paper.approval.acceptedText, 'Concordo com o serviço e o preço.');
  assert.equal(paper.approval.photoAvailable, true);
  assert.equal(source.status, 'open');
  assert.equal(audits.at(-1)?.action, 'service_order.approval.recorded');

  await assert.rejects(
    () => service.completeApproval('tenant-1', 'so-1', 'user-1', { method: 'counter' }),
    (error: unknown) => {
      assert.ok(error instanceof DomainValidationError);
      assert.match(error.message, /já foi assinada/);
      return true;
    },
  );

  approvals.length = 0;
  const released = await service.completeApproval('tenant-1', 'so-1', 'user-1', {
    method: 'release',
    releaseReason: 'Cliente volta amanhã para assinar',
  });
  assert.equal(released.serviceOrder.status, 'open');
  assert.equal(released.approval.releasedWithoutSignature, true);
  assert.equal(released.approval.signed, false);
  assert.match(String(released.approval.releaseReason), /volta amanhã/);
  assert.equal(audits.at(-1)?.action, 'service_order.approval.released');

  const later = await service.completeApproval('tenant-1', 'so-1', 'user-1', { method: 'counter' });
  assert.equal(later.approval.signed, true);
  assert.equal(later.approval.method, 'counter');
  assert.equal(later.serviceOrder.status, 'open');
});

test('the OS list highlights rows that already have a paper photo', async () => {
  const service = new ServiceOrderService(
    { async transaction() { return null; } } as never,
    {
      async search() {
        return [{ id: 'so-1' }, { id: 'so-2' }, { id: 'so-3' }];
      },
    } as never,
    {} as never,
    { async getById() { return { id: 'tenant-1' }; } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async findIdsWithPhoto() {
        return ['so-2'];
      },
    } as never,
    {} as never,
    {
      async findIdsWithPhoto() {
        return ['so-1'];
      },
    } as never,
  );

  const listed = await service.search('tenant-1', { accessibleBranchIds: ['branch-1'] });
  assert.equal(listed.find((row) => row.id === 'so-1')?.hasAttachments, true);
  assert.equal(listed.find((row) => row.id === 'so-2')?.hasAttachments, true);
  assert.equal(listed.find((row) => row.id === 'so-3')?.hasAttachments, false);
});
