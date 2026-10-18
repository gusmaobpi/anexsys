import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import {
  FinancialExceptionStatus,
  PaymentDirection,
  PaymentRecordStatus,
  ServiceOrderPaymentStatus,
} from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { AddPaymentAllocationDto } from '../../contracts/dto/add-payment-allocation.dto';
import { CreateFinancialExceptionDto } from '../../contracts/dto/create-financial-exception.dto';
import { CreatePaymentDto } from '../../contracts/dto/create-payment.dto';
import { ResolveFinancialExceptionDto } from '../../contracts/dto/resolve-financial-exception.dto';
import { SearchActualCashflowDto } from '../../contracts/dto/search-actual-cashflow.dto';
import { SearchExpectedCashflowDto } from '../../contracts/dto/search-expected-cashflow.dto';
import { SearchPaymentsDto } from '../../contracts/dto/search-payments.dto';
import { FinancialExceptionEntity } from '../../infrastructure/persistence/entities/financial-exception.entity';
import { PartialPaymentEntity } from '../../infrastructure/persistence/entities/partial-payment.entity';
import { PaymentRecordEntity } from '../../infrastructure/persistence/entities/payment-record.entity';
import { FinancialExceptionRepository } from '../../infrastructure/persistence/repositories/financial-exception.repository';
import { PartialPaymentRepository } from '../../infrastructure/persistence/repositories/partial-payment.repository';
import { PaymentRecordRepository } from '../../infrastructure/persistence/repositories/payment-record.repository';

@Injectable()
export class FinanceService {
  constructor(
    @Inject(PaymentRecordRepository)
    private readonly paymentRecordRepository: PaymentRecordRepository,
    @Inject(PartialPaymentRepository)
    private readonly partialPaymentRepository: PartialPaymentRepository,
    @Inject(FinancialExceptionRepository)
    private readonly financialExceptionRepository: FinancialExceptionRepository,
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async searchPayments(tenantId: string, filters: SearchPaymentsDto & { accessibleBranchIds: string[] }) {
    await this.tenantService.getById(tenantId);
    if (filters.branchId) {
      const branch = await this.branchService.getById(filters.branchId);
      if (branch.tenantId !== tenantId) throw new DomainValidationError('Branch must belong to the same tenant.');
    }
    if (filters.serviceOrderId) await this.serviceOrderService.getById(filters.serviceOrderId, tenantId);
    return this.paymentRecordRepository.search(tenantId, filters);
  }

  async getPaymentById(id: string, tenantId: string): Promise<PaymentRecordEntity> {
    const payment = await this.paymentRecordRepository.findById(id);
    if (!payment || payment.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Payment Record '${id}' was not found.`);
    }
    return payment;
  }

  async getPaymentDetails(tenantId: string, paymentId: string) {
    const payment = await this.getPaymentById(paymentId, tenantId);
    const serviceOrder = await this.serviceOrderService.getById(payment.serviceOrderId, tenantId);
    const [allocations, history] = await Promise.all([
      this.partialPaymentRepository.findByPaymentRecord(payment.id),
      this.auditService.listByEntity(tenantId, 'payment_record', payment.id, 200),
    ]);
    return {
      payment,
      serviceOrder,
      allocations,
      allocatedAmount: this.sumMoney(allocations.map((allocation) => allocation.allocatedAmount)),
      unallocatedAmount: this.formatMoney(this.toMoney(payment.paymentAmount) - this.sumMoney(allocations.map((allocation) => allocation.allocatedAmount))),
      history,
      timeline: [...history].reverse(),
    };
  }

  async createPayment(dto: CreatePaymentDto) {
    const serviceOrderDetails = await this.serviceOrderService.getDetails(dto.tenantId, dto.serviceOrderId);
    const status = dto.status ?? PaymentRecordStatus.RECEIVED;
    const receivedAt = dto.receivedAt
      ? new Date(dto.receivedAt)
      : [PaymentRecordStatus.RECEIVED, PaymentRecordStatus.SETTLED].includes(status)
        ? new Date()
        : null;
    const payment = this.paymentRecordRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      branchId: serviceOrderDetails.serviceOrder.branchId,
      serviceOrderId: dto.serviceOrderId,
      paymentReferenceNo: dto.paymentReferenceNo?.trim() || null,
      paymentMethod: dto.paymentMethod,
      paymentProvider: dto.paymentProvider ?? null,
      paymentDirection: dto.paymentDirection ?? PaymentDirection.INBOUND,
      paymentAmount: this.formatMoney(dto.paymentAmount),
      receivedAt,
      authorizedAt: dto.authorizedAt ? new Date(dto.authorizedAt) : null,
      reconciledAt: dto.reconciledAt ? new Date(dto.reconciledAt) : null,
      status,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });
    const { savedPayment, savedAllocations } = await this.paymentRecordRepository.runInTransaction(async (manager) => {
      const savedPayment = await manager.getRepository(PaymentRecordEntity).save(payment);
      const savedAllocations = await this.persistAllocations(
        savedPayment,
        serviceOrderDetails.items,
        dto.allocations ?? null,
        dto.actorUserId,
        dto.tenantId,
        manager,
      );
      return { savedPayment, savedAllocations };
    });
    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: savedPayment.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'payment_record',
      entityId: savedPayment.id,
      action: 'payment_record.created',
      eventType: 'finance.write',
      metadata: {
        serviceOrderId: savedPayment.serviceOrderId,
        paymentAmount: savedPayment.paymentAmount,
        paymentMethod: savedPayment.paymentMethod,
      },
    });
    return {
      payment: savedPayment,
      allocations: savedAllocations,
      ...(await this.getFinancialSummary(dto.tenantId, dto.serviceOrderId)),
    };
  }

  async addAllocations(paymentId: string, tenantId: string, dto: AddPaymentAllocationDto) {
    const payment = await this.getPaymentById(paymentId, tenantId);
    const serviceOrderDetails = await this.serviceOrderService.getDetails(tenantId, payment.serviceOrderId);
    const allocations = await this.persistAllocations(payment, serviceOrderDetails.items, dto.allocations, dto.actorUserId, tenantId);
    await this.auditService.record({
      tenantId,
      branchId: payment.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'payment_record',
      entityId: payment.id,
      action: 'payment_record.allocations.updated',
      eventType: 'finance.write',
      metadata: { allocationCount: allocations.length },
    });
    return this.getPaymentDetails(tenantId, paymentId);
  }

  async listPartialPaymentsByServiceOrder(tenantId: string, serviceOrderId: string) {
    await this.serviceOrderService.getById(serviceOrderId, tenantId);
    const [payments, allocations] = await Promise.all([
      this.paymentRecordRepository.findByServiceOrder(serviceOrderId),
      this.partialPaymentRepository.findByServiceOrder(serviceOrderId),
    ]);
    const paymentsById = new Map(payments.map((payment) => [payment.id, payment] as const));
    return allocations.map((allocation) => ({
      ...allocation,
      payment: paymentsById.get(allocation.paymentRecordId) ?? null,
    }));
  }

  async getFinancialSummary(tenantId: string, serviceOrderId: string) {
    const [tenant, details, payments, allocations] = await Promise.all([
      this.tenantService.getById(tenantId),
      this.serviceOrderService.getDetails(tenantId, serviceOrderId),
      this.paymentRecordRepository.findByServiceOrder(serviceOrderId),
      this.partialPaymentRepository.findByServiceOrder(serviceOrderId),
    ]);

    const members =
      typeof this.serviceOrderService.listGroupMembers === 'function'
        ? await this.serviceOrderService.listGroupMembers(tenantId, serviceOrderId)
        : [details.serviceOrder];
    const groupPayments =
      members.length > 1
        ? (
            await Promise.all(
              members.map((member) =>
                member.id === serviceOrderId
                  ? Promise.resolve(payments)
                  : this.paymentRecordRepository.findByServiceOrder(member.id),
              ),
            )
          ).flat()
        : payments;
    const orderTotal =
      members.length > 1
        ? members.reduce((sum, member) => sum + this.toMoney(member.totalValue ?? '0'), 0)
        : this.toMoney(details.serviceOrder.totalValue ?? this.calculateItemsTotal(details.items));
    const amountPaid = this.calculateNetPaid(groupPayments);
    const outstandingBalance = Math.max(orderTotal - amountPaid, 0);
    const effectivePayments = new Map(
      groupPayments
        .filter((payment) => ![PaymentRecordStatus.FAILED, PaymentRecordStatus.REVERSED, PaymentRecordStatus.PENDING, PaymentRecordStatus.CANCELED].includes(payment.status))
        .map((payment) => [payment.id, payment] as const),
    );
    const itemAllocations = new Map<string, number>();
    let allocatedAmount = 0;
    for (const allocation of allocations) {
      const payment = effectivePayments.get(allocation.paymentRecordId);
      if (!payment) continue;
      const allocationAmount = this.toMoney(allocation.allocatedAmount) * (payment.paymentDirection === PaymentDirection.OUTBOUND ? -1 : 1);
      allocatedAmount += allocationAmount;
      if (!allocation.serviceOrderItemId) continue;
      itemAllocations.set(allocation.serviceOrderItemId, (itemAllocations.get(allocation.serviceOrderItemId) ?? 0) + allocationAmount);
    }
    const items = details.items.map((item) => {
      const totalValue = this.calculateItemTotal(item);
      const amountPaidByItem = itemAllocations.get(item.id) ?? 0;
      return {
        serviceOrderItemId: item.id,
        itemNo: item.itemNo,
        description: item.description,
        totalValue: this.formatMoney(totalValue),
        amountPaid: this.formatMoney(amountPaidByItem),
        outstandingBalance: this.formatMoney(Math.max(totalValue - amountPaidByItem, 0)),
      };
    });
    const paymentStatus = outstandingBalance <= 0
      ? ServiceOrderPaymentStatus.PAID
      : amountPaid > 0
        ? ServiceOrderPaymentStatus.PARTIAL
        : ServiceOrderPaymentStatus.PENDING;

    const recordedPayments = groupPayments
      .filter((payment) => ![PaymentRecordStatus.FAILED, PaymentRecordStatus.REVERSED, PaymentRecordStatus.PENDING, PaymentRecordStatus.CANCELED].includes(payment.status))
      .slice()
      .sort((left, right) => {
        const leftTime = new Date(left.receivedAt ?? left.createdAt).getTime();
        const rightTime = new Date(right.receivedAt ?? right.createdAt).getTime();
        return rightTime - leftTime;
      })
      .map((payment) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        paymentAmount: payment.paymentAmount,
        receivedAt: payment.receivedAt,
        status: payment.status,
      }));

    return {
      serviceOrderId,
      orderTotal: this.formatMoney(orderTotal),
      amountPaid: this.formatMoney(amountPaid),
      outstandingBalance: this.formatMoney(outstandingBalance),
      unallocatedPaymentAmount: this.formatMoney(Math.max(amountPaid - allocatedAmount, 0)),
      paymentStatus,
      paymentTermsDays: details.serviceOrder.paymentTermsDays,
      deliveryBlocked: tenant.blockDeliveryWithOutstandingBalance && outstandingBalance > 0,
      payments: recordedPayments,
      items,
    };
  }

  async createFinancialException(dto: CreateFinancialExceptionDto): Promise<FinancialExceptionEntity> {
    const serviceOrder = await this.serviceOrderService.getById(dto.serviceOrderId, dto.tenantId);
    if (dto.paymentRecordId) {
      const payment = await this.getPaymentById(dto.paymentRecordId, dto.tenantId);
      if (payment.serviceOrderId !== dto.serviceOrderId) {
        throw new DomainValidationError('Financial Exception payment must belong to the same Service Order.');
      }
    }
    const entity = this.financialExceptionRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      branchId: serviceOrder.branchId,
      serviceOrderId: dto.serviceOrderId,
      paymentRecordId: dto.paymentRecordId ?? null,
      exceptionType: dto.exceptionType,
      reason: dto.reason.trim(),
      amountImpact: dto.amountImpact === undefined || dto.amountImpact === null ? null : this.formatMoney(dto.amountImpact),
      openedAt: dto.openedAt ? new Date(dto.openedAt) : new Date(),
      resolvedAt: null,
      status: FinancialExceptionStatus.OPEN,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });
    const saved = await this.financialExceptionRepository.save(entity);
    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'financial_exception',
      entityId: saved.id,
      action: 'financial_exception.created',
      eventType: 'finance.write',
      metadata: { serviceOrderId: saved.serviceOrderId, exceptionType: saved.exceptionType },
    });
    return saved;
  }

  async getFinancialExceptionById(id: string, tenantId: string): Promise<FinancialExceptionEntity> {
    const entity = await this.financialExceptionRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Financial Exception '${id}' was not found.`);
    }
    return entity;
  }

  async getFinancialExceptionDetails(tenantId: string, id: string) {
    const financialException = await this.getFinancialExceptionById(id, tenantId);
    const [serviceOrder, payment, history] = await Promise.all([
      this.serviceOrderService.getById(financialException.serviceOrderId, tenantId),
      financialException.paymentRecordId ? this.getPaymentById(financialException.paymentRecordId, tenantId) : Promise.resolve(null),
      this.auditService.listByEntity(tenantId, 'financial_exception', financialException.id, 200),
    ]);
    return { financialException, serviceOrder, payment, history, timeline: [...history].reverse() };
  }

  async resolveFinancialException(id: string, tenantId: string, dto: ResolveFinancialExceptionDto): Promise<FinancialExceptionEntity> {
    const entity = await this.getFinancialExceptionById(id, tenantId);
    if (entity.status === FinancialExceptionStatus.RESOLVED) {
      throw new DomainValidationError('Financial Exception is already resolved.');
    }
    entity.status = FinancialExceptionStatus.RESOLVED;
    entity.resolvedAt = new Date();
    entity.updatedBy = dto.actorUserId;
    const saved = await this.financialExceptionRepository.save(entity);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'financial_exception',
      entityId: saved.id,
      action: 'financial_exception.resolved',
      eventType: 'finance.workflow',
      metadata: { resolutionNotes: dto.resolutionNotes?.trim() || null },
    });
    return saved;
  }

  async getExpectedCashflow(tenantId: string, filters: SearchExpectedCashflowDto & { accessibleBranchIds: string[] }) {
    const orders = await this.serviceOrderService.search(tenantId, {
      branchId: filters.branchId,
      accessibleBranchIds: filters.accessibleBranchIds,
    });
    const rows = [] as Array<Record<string, unknown>>;
    for (const order of orders) {
      const summary = await this.getFinancialSummary(tenantId, order.id);
      const expectedDate = this.addDays(order.promisedDeliveryDate, order.paymentTermsDays ?? 0);
      if (filters.fromDate && expectedDate < filters.fromDate) continue;
      if (filters.toDate && expectedDate > filters.toDate) continue;
      if (summary.outstandingBalance === '0.00') continue;
      rows.push({
        serviceOrderId: order.id,
        branchId: order.branchId,
        customerId: order.customerId,
        expectedReceiptDate: expectedDate,
        outstandingBalance: summary.outstandingBalance,
        paymentTermsDays: order.paymentTermsDays,
        promisedDeliveryDate: order.promisedDeliveryDate,
        paymentStatus: summary.paymentStatus,
      });
    }
    return rows.sort((left, right) => String(left.expectedReceiptDate).localeCompare(String(right.expectedReceiptDate)));
  }

  async getActualCashflow(tenantId: string, filters: SearchActualCashflowDto & { accessibleBranchIds: string[] }) {
    const payments = await this.paymentRecordRepository.search(tenantId, {
      branchId: filters.branchId,
      paymentMethod: filters.paymentMethod,
      paymentDirection: PaymentDirection.INBOUND,
      statuses: [PaymentRecordStatus.RECEIVED, PaymentRecordStatus.SETTLED],
      fromReceivedDate: filters.fromDate,
      toReceivedDate: filters.toDate,
      accessibleBranchIds: filters.accessibleBranchIds,
    });
    return payments
      .map((payment) => ({
        paymentId: payment.id,
        serviceOrderId: payment.serviceOrderId,
        branchId: payment.branchId,
        paymentMethod: payment.paymentMethod,
        paymentAmount: payment.paymentAmount,
        paymentDate: payment.receivedAt,
        settlementDate: payment.reconciledAt,
        status: payment.status,
      }));
  }

  private async persistAllocations(
    payment: PaymentRecordEntity,
    items: Array<{ id: string; quantity: string; unitPrice: string | null; discountValue: string | null }>,
    requestedAllocations: Array<{ serviceOrderItemId?: string | null; allocatedAmount: number }> | null,
    actorUserId: string,
    tenantId: string,
    manager?: EntityManager,
  ): Promise<PartialPaymentEntity[]> {
    const existing = await this.partialPaymentRepository.findByPaymentRecord(payment.id, manager);
    const existingAllocated = this.sumMoney(existing.map((allocation) => allocation.allocatedAmount));
    const remainingAmount = this.toMoney(payment.paymentAmount) - existingAllocated;
    if (remainingAmount < 0) {
      throw new DomainValidationError('Payment allocations exceed the payment amount.');
    }

    const itemTotals = new Map(items.map((item) => [item.id, this.calculateItemTotal(item)]));
    const payments = await this.paymentRecordRepository.findByServiceOrder(payment.serviceOrderId);
    const effectivePayments = new Map(
      payments
        .filter((candidate) => ![PaymentRecordStatus.FAILED, PaymentRecordStatus.REVERSED, PaymentRecordStatus.PENDING, PaymentRecordStatus.CANCELED].includes(candidate.status))
        .map((candidate) => [candidate.id, candidate] as const),
    );
    const serviceOrderAllocations = await this.partialPaymentRepository.findByServiceOrder(payment.serviceOrderId, manager);
    const itemAllocatedTotals = new Map<string, number>();
    for (const allocation of serviceOrderAllocations) {
      if (!allocation.serviceOrderItemId) continue;
      const relatedPayment = effectivePayments.get(allocation.paymentRecordId);
      if (!relatedPayment) continue;
      const allocationAmount = this.toMoney(allocation.allocatedAmount) * (relatedPayment.paymentDirection === PaymentDirection.OUTBOUND ? -1 : 1);
      itemAllocatedTotals.set(
        allocation.serviceOrderItemId,
        (itemAllocatedTotals.get(allocation.serviceOrderItemId) ?? 0) + allocationAmount,
      );
    }

    const normalizedAllocations = (requestedAllocations && requestedAllocations.length > 0)
      ? requestedAllocations.flatMap((allocation) => this.expandAllocation(allocation, items, itemTotals, itemAllocatedTotals))
      : this.autoAllocate(remainingAmount, items, itemTotals, itemAllocatedTotals);

    const allocationTotal = normalizedAllocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0);
    if (allocationTotal > remainingAmount + 0.0001) {
      throw new DomainValidationError('Payment allocations cannot exceed the remaining payment amount.');
    }

    const entities = normalizedAllocations.map((allocation) => {
      if (allocation.serviceOrderItemId && !itemTotals.has(allocation.serviceOrderItemId)) {
        throw new DomainValidationError('Payment allocation item must belong to the referenced Service Order.');
      }
      if (allocation.serviceOrderItemId) {
        const alreadyAllocated = itemAllocatedTotals.get(allocation.serviceOrderItemId) ?? 0;
        const itemOutstanding = (itemTotals.get(allocation.serviceOrderItemId) ?? 0) - alreadyAllocated;
        if (allocation.allocatedAmount > itemOutstanding + 0.0001) {
          throw new DomainValidationError('Payment allocation cannot exceed the outstanding balance of the Service Order item.');
        }
        itemAllocatedTotals.set(allocation.serviceOrderItemId, alreadyAllocated + allocation.allocatedAmount);
      }
      return this.partialPaymentRepository.create({
        id: randomUUID(),
        tenantId,
        branchId: payment.branchId,
        paymentRecordId: payment.id,
        serviceOrderId: payment.serviceOrderId,
        serviceOrderItemId: allocation.serviceOrderItemId ?? null,
        allocatedAmount: this.formatMoney(allocation.allocatedAmount),
        allocatedAt: new Date(),
        createdBy: actorUserId,
        updatedBy: actorUserId,
      });
    });

    if (entities.length === 0) return [];
    return manager ? this.partialPaymentRepository.saveManyInTransaction(entities, manager) : this.partialPaymentRepository.saveMany(entities);
  }

  private expandAllocation(
    allocation: { serviceOrderItemId?: string | null; allocatedAmount: number },
    items: Array<{ id: string; quantity: string; unitPrice: string | null; discountValue: string | null }>,
    itemTotals: Map<string, number>,
    itemAllocatedTotals: Map<string, number>,
  ) {
    if (allocation.allocatedAmount <= 0) {
      throw new DomainValidationError('Payment allocation amount must be greater than zero.');
    }
    if (allocation.serviceOrderItemId) return [allocation];
    return this.autoAllocate(allocation.allocatedAmount, items, itemTotals, itemAllocatedTotals);
  }

  private autoAllocate(
    amount: number,
    items: Array<{ id: string; quantity: string; unitPrice: string | null; discountValue: string | null }>,
    itemTotals: Map<string, number>,
    itemAllocatedTotals: Map<string, number>,
  ) {
    const remaining = { value: amount };
    const allocations: Array<{ serviceOrderItemId?: string; allocatedAmount: number }> = [];
    for (const item of items) {
      if (remaining.value <= 0) break;
      const outstanding = (itemTotals.get(item.id) ?? 0) - (itemAllocatedTotals.get(item.id) ?? 0);
      if (outstanding <= 0) continue;
      const allocatedAmount = Math.min(outstanding, remaining.value);
      allocations.push({ serviceOrderItemId: item.id, allocatedAmount: Number(allocatedAmount.toFixed(2)) });
      remaining.value = Number((remaining.value - allocatedAmount).toFixed(2));
    }
    if (remaining.value > 0) {
      allocations.push({ allocatedAmount: Number(remaining.value.toFixed(2)) });
    }
    return allocations;
  }

  private calculateNetPaid(payments: PaymentRecordEntity[]) {
    return payments.reduce((sum, payment) => {
      if ([PaymentRecordStatus.FAILED, PaymentRecordStatus.REVERSED, PaymentRecordStatus.PENDING, PaymentRecordStatus.CANCELED].includes(payment.status)) return sum;
      const amount = this.toMoney(payment.paymentAmount);
      return sum + (payment.paymentDirection === PaymentDirection.OUTBOUND ? -amount : amount);
    }, 0);
  }

  private calculateItemsTotal(items: Array<{ quantity: string; unitPrice: string | null; discountValue: string | null }>) {
    return this.formatMoney(items.reduce((sum, item) => sum + this.calculateItemTotal(item), 0));
  }

  private calculateItemTotal(item: { quantity: string; unitPrice: string | null; discountValue: string | null }) {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const discountValue = Number(item.discountValue ?? 0);
    return quantity * unitPrice - discountValue;
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private sumMoney(values: Array<string>) {
    return Number(values.reduce((sum, value) => sum + this.toMoney(value), 0).toFixed(2));
  }

  private toMoney(value: string) {
    return Number(value ?? 0);
  }

  private formatMoney(value: number) {
    return value.toFixed(2);
  }
}
