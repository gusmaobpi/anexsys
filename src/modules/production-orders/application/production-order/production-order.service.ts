import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { MeasurementService } from 'src/modules/crm/application/measurement/measurement.service';
import { OperationalResourceService } from 'src/modules/operational-resources/application/operational-resource/operational-resource.service';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import {
  DeliveryType,
  OperationalAssignmentRole,
  ProductionExecutionEventType,
  ProductionOrderStatus,
  ProductionOrderVersionReason,
} from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { CompleteProductionOrderDto } from '../../contracts/dto/complete-production-order.dto';
import { CreateProductionOrderVersionDto } from '../../contracts/dto/create-production-order-version.dto';
import { PauseProductionOrderDto } from '../../contracts/dto/pause-production-order.dto';
import { ScheduleProductionOrderDto } from '../../contracts/dto/schedule-production-order.dto';
import { SearchProductionOrdersDto } from '../../contracts/dto/search-production-orders.dto';
import { StartProductionOrderDto } from '../../contracts/dto/start-production-order.dto';
import { UpdateProductionOrderDto } from '../../contracts/dto/update-production-order.dto';
import { ProductionExecutionEventEntity } from '../../infrastructure/persistence/entities/production-execution-event.entity';
import { ProductionOrderOperationalAssignmentEntity } from '../../infrastructure/persistence/entities/production-order-operational-assignment.entity';
import { ProductionOrderEntity } from '../../infrastructure/persistence/entities/production-order.entity';
import { ProductionOrderItemLinkEntity } from '../../infrastructure/persistence/entities/production-order-item-link.entity';
import { ProductionOrderVersionEntity } from '../../infrastructure/persistence/entities/production-order-version.entity';
import { QrCodeEntity } from '../../infrastructure/persistence/entities/qr-code.entity';
import { ProductionExecutionEventRepository } from '../../infrastructure/persistence/repositories/production-execution-event.repository';
import { ProductionOrderItemLinkRepository } from '../../infrastructure/persistence/repositories/production-order-item-link.repository';
import { ProductionOrderOperationalAssignmentRepository } from '../../infrastructure/persistence/repositories/production-order-operational-assignment.repository';
import { ProductionOrderRepository } from '../../infrastructure/persistence/repositories/production-order.repository';
import { ProductionOrderVersionRepository } from '../../infrastructure/persistence/repositories/production-order-version.repository';
import { QrCodeRepository } from '../../infrastructure/persistence/repositories/qr-code.repository';
import { QrEventRepository } from '../../infrastructure/persistence/repositories/qr-event.repository';

@Injectable()
export class ProductionOrderService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(ProductionOrderRepository)
    private readonly productionOrderRepository: ProductionOrderRepository,
    @Inject(ProductionOrderItemLinkRepository)
    private readonly itemLinkRepository: ProductionOrderItemLinkRepository,
    @Inject(ProductionOrderVersionRepository)
    private readonly versionRepository: ProductionOrderVersionRepository,
    @Inject(ProductionOrderOperationalAssignmentRepository)
    private readonly assignmentRepository: ProductionOrderOperationalAssignmentRepository,
    @Inject(QrCodeRepository)
    private readonly qrCodeRepository: QrCodeRepository,
    @Inject(QrEventRepository)
    private readonly qrEventRepository: QrEventRepository,
    @Inject(ProductionExecutionEventRepository)
    private readonly executionEventRepository: ProductionExecutionEventRepository,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(MeasurementService)
    private readonly measurementService: MeasurementService,
    @Inject(OperationalResourceService)
    private readonly operationalResourceService: OperationalResourceService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async generateFromServiceOrder(input: {
    tenantId: string;
    serviceOrderId: string;
    actorUserId: string;
    accessibleBranchIds: string[];
  }) {
    const serviceOrderDetails = await this.serviceOrderService.getDetails(input.tenantId, input.serviceOrderId);
    this.serviceOrderService.assertBranchAccess(serviceOrderDetails.serviceOrder, input.accessibleBranchIds);
    if (serviceOrderDetails.serviceOrder.status === 'cancelled') {
      throw new DomainValidationError('Cancelled Service Orders cannot generate Production Orders.');
    }

    const existing = await this.productionOrderRepository.findByServiceOrder(input.serviceOrderId);
    if (existing) {
      throw new DomainValidationError('This Service Order already has a primary Production Order.');
    }
    if (serviceOrderDetails.items.length === 0) {
      throw new DomainValidationError('Production Orders require at least one Service Order item.');
    }

    const measurements = await this.measurementService.listByCustomer(input.tenantId, serviceOrderDetails.customer.id);
    const measurementsSnapshot = this.buildMeasurementsSnapshot(measurements.latestByLabel);
    const plannedQuantity = serviceOrderDetails.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const pieceDescription = serviceOrderDetails.items
      .map((item) => [item.itemType, item.description, item.complement].filter(Boolean).join(' · '))
      .join('; ');

    const order = this.productionOrderRepository.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      branchId: serviceOrderDetails.serviceOrder.branchId,
      serviceOrderId: input.serviceOrderId,
      workflowDefinitionId: null,
      currentStatusDefinitionId: null,
      productionNo: this.generateProductionNo(),
      productionType: 'base',
      deliveryType: serviceOrderDetails.serviceOrder.deliveryType,
      operationalPriority: serviceOrderDetails.serviceOrder.operationalPriority,
      customerDeliveryTargetDate: serviceOrderDetails.serviceOrder.promisedDeliveryDate,
      internalProductionDeadline: null,
      internalQualityDeadline: null,
      plannedQuantity: this.formatQuantity(plannedQuantity),
      producedQuantity: this.formatQuantity(0),
      scheduledStartAt: null,
      scheduledEndAt: null,
      instructions: pieceDescription,
      pieceDescription,
      measurementsSnapshot,
      observations: serviceOrderDetails.serviceOrder.customerNotes,
      status: ProductionOrderStatus.OPEN,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });

    const linkPayloads = serviceOrderDetails.items.map((item, index) =>
      this.itemLinkRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        productionOrderId: order.id,
        serviceOrderItemId: item.id,
        isPrimaryScope: index === 0,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      }),
    );

    const qrCode = this.buildQrCode(order, input.actorUserId, 1);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(ProductionOrderEntity, manager.create(ProductionOrderEntity, order));
      await manager.save(
        ProductionOrderItemLinkEntity,
        linkPayloads.map((link) => manager.create(ProductionOrderItemLinkEntity, link)),
      );
      await manager.save(QrCodeEntity, manager.create(QrCodeEntity, qrCode));
    });

    await this.auditService.record({
      tenantId: input.tenantId,
      branchId: order.branchId,
      actorUserId: input.actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.generated',
      eventType: 'production.write',
      metadata: { serviceOrderId: input.serviceOrderId, productionNo: order.productionNo },
    });

    await this.auditService.record({
      tenantId: input.tenantId,
      branchId: order.branchId,
      actorUserId: input.actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.qr.issued',
      eventType: 'production.traceability',
      metadata: { qrCodeId: qrCode.id, reissueNo: qrCode.reissueNo },
    });

    return this.getDetails(input.tenantId, order.id);
  }

  async search(tenantId: string, filters: SearchProductionOrdersDto & { accessibleBranchIds: string[] }) {
    await this.tenantService.getById(tenantId);
    if (filters.branchId) {
      const branch = await this.branchService.getById(filters.branchId);
      if (branch.tenantId !== tenantId) {
        throw new DomainValidationError('Branch must belong to the same tenant.');
      }
    }
    if (filters.serviceOrderId) {
      await this.serviceOrderService.getById(filters.serviceOrderId, tenantId);
    }
    if (filters.operationalResourceId) {
      await this.operationalResourceService.getById(filters.operationalResourceId, tenantId);
    }

    return this.productionOrderRepository.search(tenantId, filters);
  }

  async getByServiceOrder(tenantId: string, serviceOrderId: string, accessibleBranchIds: string[]) {
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, accessibleBranchIds);
    return this.productionOrderRepository.findByServiceOrder(serviceOrderId);
  }

  async getDetailsByServiceOrder(tenantId: string, serviceOrderId: string, accessibleBranchIds: string[]) {
    const order = await this.getByServiceOrder(tenantId, serviceOrderId, accessibleBranchIds);
    if (!order) {
      return null;
    }
    return this.getDetails(tenantId, order.id);
  }

  async getById(productionOrderId: string, tenantId: string): Promise<ProductionOrderEntity> {
    const order = await this.productionOrderRepository.findById(productionOrderId);
    if (!order || order.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Production Order '${productionOrderId}' was not found.`);
    }
    return order;
  }

  async getDetails(tenantId: string, productionOrderId: string) {
    const order = await this.getById(productionOrderId, tenantId);
    const serviceOrderDetails = await this.serviceOrderService.getDetails(tenantId, order.serviceOrderId);
    const [links, versions, assignments, history, activeQrCode, qrEvents, executionEvents] = await Promise.all([
      this.itemLinkRepository.findByProductionOrder(order.id),
      this.versionRepository.findByProductionOrder(order.id),
      this.assignmentRepository.findByProductionOrder(order.id),
      this.auditService.listByEntity(tenantId, 'production_order', order.id, 200),
      this.qrCodeRepository.findActiveByProductionOrder(order.id),
      this.qrEventRepository.findByProductionOrder(order.id),
      this.executionEventRepository.findByProductionOrder(order.id),
    ]);
    const linkedItemIds = new Set(links.map((link) => link.serviceOrderItemId));
    const linkedItems = serviceOrderDetails.items.filter((item) => linkedItemIds.has(item.id));

    return {
      productionOrder: order,
      serviceOrder: serviceOrderDetails.serviceOrder,
      customer: serviceOrderDetails.customer,
      items: linkedItems,
      itemLinks: links,
      versions,
      assignments,
      activeQrCode,
      qrEvents,
      executionEvents,
      operationalDiary: executionEvents.filter((event) => Boolean(event.diaryEntry)),
      history,
      timeline: [...history].reverse(),
    };
  }

  async update(productionOrderId: string, tenantId: string, dto: UpdateProductionOrderDto): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    this.assertMutable(order);

    if (dto.deliveryType !== undefined) {
      order.deliveryType = dto.deliveryType;
    }
    if (dto.operationalPriority !== undefined) {
      order.operationalPriority = dto.operationalPriority?.trim() || null;
    }
    if (dto.customerDeliveryTargetDate !== undefined) {
      order.customerDeliveryTargetDate = dto.customerDeliveryTargetDate;
    }
    if (dto.internalProductionDeadline !== undefined) {
      order.internalProductionDeadline = dto.internalProductionDeadline ?? null;
    }
    if (dto.internalQualityDeadline !== undefined) {
      order.internalQualityDeadline = dto.internalQualityDeadline ?? null;
    }
    if (dto.plannedQuantity !== undefined) {
      order.plannedQuantity = dto.plannedQuantity === null ? null : this.formatQuantity(dto.plannedQuantity);
    }
    if (dto.instructions !== undefined) {
      order.instructions = dto.instructions?.trim() || null;
    }
    if (dto.pieceDescription !== undefined) {
      order.pieceDescription = dto.pieceDescription?.trim() || '';
    }
    if (dto.observations !== undefined) {
      order.observations = dto.observations?.trim() || null;
    }
    order.updatedBy = dto.actorUserId;

    const saved = await this.productionOrderRepository.save(order);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'production_order',
      entityId: saved.id,
      action: 'production_order.updated',
      eventType: 'production.write',
      metadata: { status: saved.status, deliveryType: saved.deliveryType },
    });
    return saved;
  }

  async schedule(productionOrderId: string, tenantId: string, dto: ScheduleProductionOrderDto): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    this.assertMutable(order);
    const scheduledStartAt = new Date(dto.scheduledStartAt);
    const scheduledEndAt = dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null;
    if (scheduledEndAt && scheduledEndAt.getTime() < scheduledStartAt.getTime()) {
      throw new DomainValidationError('Schedule end time must be after the start time.');
    }

    await this.operationalResourceService.assertAssignableToBranch(tenantId, dto.primaryResourceId, order.branchId);
    const participantResourceIds = [...new Set((dto.participantResourceIds ?? []).filter((resourceId) => resourceId !== dto.primaryResourceId))];
    for (const resourceId of participantResourceIds) {
      await this.operationalResourceService.assertAssignableToBranch(tenantId, resourceId, order.branchId);
    }

    const assignedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(ProductionOrderOperationalAssignmentEntity)
        .set({ isCurrent: false, releasedAt: assignedAt, updatedBy: dto.actorUserId })
        .where('production_order_id = :productionOrderId', { productionOrderId })
        .andWhere('is_current = true')
        .execute();

      const assignments = [
        manager.create(ProductionOrderOperationalAssignmentEntity, {
          id: randomUUID(),
          tenantId,
          branchId: order.branchId,
          productionOrderId,
          operationalResourceId: dto.primaryResourceId,
          assignmentRole: OperationalAssignmentRole.PRIMARY,
          assignedAt,
          releasedAt: null,
          isCurrent: true,
          isPrimaryResponsible: true,
          assignmentNotes: dto.assignmentNotes?.trim() || null,
          createdBy: dto.actorUserId,
          updatedBy: dto.actorUserId,
        }),
        ...participantResourceIds.map((resourceId) =>
          manager.create(ProductionOrderOperationalAssignmentEntity, {
            id: randomUUID(),
            tenantId,
            branchId: order.branchId,
            productionOrderId,
            operationalResourceId: resourceId,
            assignmentRole: OperationalAssignmentRole.PARTICIPANT,
            assignedAt,
            releasedAt: null,
            isCurrent: true,
            isPrimaryResponsible: false,
            assignmentNotes: dto.assignmentNotes?.trim() || null,
            createdBy: dto.actorUserId,
            updatedBy: dto.actorUserId,
          }),
        ),
      ];
      await manager.save(ProductionOrderOperationalAssignmentEntity, assignments);

      order.scheduledStartAt = scheduledStartAt;
      order.scheduledEndAt = scheduledEndAt;
      order.status = ProductionOrderStatus.SCHEDULED;
      order.updatedBy = dto.actorUserId;
      await manager.save(ProductionOrderEntity, order);
    });

    await this.auditService.record({
      tenantId,
      branchId: order.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'production_order',
      entityId: productionOrderId,
      action: 'production_order.scheduled',
      eventType: 'production.workflow',
      metadata: {
        scheduledStartAt: order.scheduledStartAt,
        scheduledEndAt: order.scheduledEndAt,
        primaryResourceId: dto.primaryResourceId,
        participantResourceIds,
      },
    });

    return this.getById(productionOrderId, tenantId);
  }

  async start(productionOrderId: string, tenantId: string, dto: StartProductionOrderDto & { qrEventId?: string | null }): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new DomainValidationError('Completed Production Orders cannot be restarted.');
    }
    if (![ProductionOrderStatus.OPEN, ProductionOrderStatus.SCHEDULED, ProductionOrderStatus.PAUSED].includes(order.status)) {
      throw new DomainValidationError('Production Order cannot be started from the current status.');
    }

    const statusBefore = order.status;

    if (dto.operationalResourceId) {
      await this.operationalResourceService.assertAssignableToBranch(tenantId, dto.operationalResourceId, order.branchId);
      const currentPrimary = await this.assignmentRepository.findCurrentPrimaryByProductionOrder(productionOrderId);
      if (!currentPrimary || currentPrimary.operationalResourceId !== dto.operationalResourceId) {
        const startedAt = new Date();
        await this.assignmentRepository.releaseCurrentPrimaryAssignments(productionOrderId, dto.actorUserId, startedAt);
        await this.assignmentRepository.save(
          this.assignmentRepository.create({
            id: randomUUID(),
            tenantId,
            branchId: order.branchId,
            productionOrderId,
            operationalResourceId: dto.operationalResourceId,
            assignmentRole: OperationalAssignmentRole.PRIMARY,
            assignedAt: startedAt,
            releasedAt: null,
            isCurrent: true,
            isPrimaryResponsible: true,
            assignmentNotes: dto.diaryEntry?.trim() || null,
            createdBy: dto.actorUserId,
            updatedBy: dto.actorUserId,
          }),
        );
      }
    }

    const primary = await this.assignmentRepository.findCurrentPrimaryByProductionOrder(productionOrderId);
    if (!primary) {
      throw new DomainValidationError('Production Order must have a current primary Operational Resource before execution starts.');
    }

    order.status = ProductionOrderStatus.IN_PROGRESS;
    order.updatedBy = dto.actorUserId;
    const saved = await this.productionOrderRepository.save(order);
    await this.recordExecutionEvent({
      tenantId,
      branchId: saved.branchId,
      productionOrderId: saved.id,
      operationalResourceId: primary.operationalResourceId,
      qrEventId: dto.qrEventId ?? null,
      actorUserId: dto.actorUserId,
      eventType: ProductionExecutionEventType.EXECUTION_START,
      statusBefore,
      statusAfter: saved.status,
      diaryEntry: dto.diaryEntry?.trim() || null,
      eventPayload: { source: dto.qrEventId ? 'qr_scan' : 'manual' },
    });
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'production_order',
      entityId: saved.id,
      action: 'production_order.started',
      eventType: 'production.workflow',
      metadata: {
        operationalResourceId: primary.operationalResourceId,
        diaryEntry: dto.diaryEntry?.trim() || null,
      },
    });
    return saved;
  }

  async pause(productionOrderId: string, tenantId: string, dto: PauseProductionOrderDto & { qrEventId?: string | null }): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    if (order.status !== ProductionOrderStatus.IN_PROGRESS) {
      throw new DomainValidationError('Only in-progress Production Orders can be paused.');
    }
    const statusBefore = order.status;
    const primary = await this.assignmentRepository.findCurrentPrimaryByProductionOrder(productionOrderId);
    order.status = ProductionOrderStatus.PAUSED;
    order.updatedBy = dto.actorUserId;
    const saved = await this.productionOrderRepository.save(order);
    await this.recordExecutionEvent({
      tenantId,
      branchId: saved.branchId,
      productionOrderId: saved.id,
      operationalResourceId: primary?.operationalResourceId ?? null,
      qrEventId: dto.qrEventId ?? null,
      actorUserId: dto.actorUserId,
      eventType: ProductionExecutionEventType.STATUS_UPDATED,
      statusBefore,
      statusAfter: saved.status,
      diaryEntry: dto.diaryEntry?.trim() || null,
      eventPayload: { source: dto.qrEventId ? 'qr_scan' : 'manual' },
    });
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'production_order',
      entityId: saved.id,
      action: 'production_order.paused',
      eventType: 'production.workflow',
      metadata: { diaryEntry: dto.diaryEntry?.trim() || null },
    });
    return saved;
  }

  async complete(productionOrderId: string, tenantId: string, dto: CompleteProductionOrderDto & { qrEventId?: string | null }): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    if (![ProductionOrderStatus.IN_PROGRESS, ProductionOrderStatus.PAUSED, ProductionOrderStatus.SCHEDULED].includes(order.status)) {
      throw new DomainValidationError('Only scheduled, in-progress, or paused Production Orders can be completed.');
    }

    const statusBefore = order.status;
    const primary = await this.assignmentRepository.findCurrentPrimaryByProductionOrder(productionOrderId);
    const completedAt = new Date();
    order.status = ProductionOrderStatus.COMPLETED;
    order.producedQuantity = dto.producedQuantity === null || dto.producedQuantity === undefined
      ? order.plannedQuantity
      : this.formatQuantity(dto.producedQuantity);
    order.updatedBy = dto.actorUserId;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(ProductionOrderEntity, order);
      await manager
        .createQueryBuilder()
        .update(ProductionOrderOperationalAssignmentEntity)
        .set({ isCurrent: false, releasedAt: completedAt, updatedBy: dto.actorUserId })
        .where('production_order_id = :productionOrderId', { productionOrderId })
        .andWhere('is_current = true')
        .execute();
    });

    await this.recordExecutionEvent({
      tenantId,
      branchId: order.branchId,
      productionOrderId: order.id,
      operationalResourceId: primary?.operationalResourceId ?? null,
      qrEventId: dto.qrEventId ?? null,
      actorUserId: dto.actorUserId,
      eventType: ProductionExecutionEventType.STATUS_UPDATED,
      statusBefore,
      statusAfter: order.status,
      diaryEntry: dto.diaryEntry?.trim() || null,
      eventPayload: { source: dto.qrEventId ? 'qr_scan' : 'manual', producedQuantity: order.producedQuantity },
    });
    await this.auditService.record({
      tenantId,
      branchId: order.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.completed',
      eventType: 'production.workflow',
      metadata: { producedQuantity: order.producedQuantity, diaryEntry: dto.diaryEntry?.trim() || null },
    });
    return order;
  }

  async assumeResponsibility(
    productionOrderId: string,
    tenantId: string,
    input: { actorUserId: string; operationalResourceId: string; diaryEntry?: string | null; qrEventId?: string | null },
  ): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    if (order.status === ProductionOrderStatus.COMPLETED || order.status === ProductionOrderStatus.CANCELLED) {
      throw new DomainValidationError('Completed or cancelled Production Orders cannot change execution responsibility.');
    }

    await this.operationalResourceService.assertAssignableToBranch(tenantId, input.operationalResourceId, order.branchId);
    const assignedAt = new Date();
    await this.assignmentRepository.releaseCurrentPrimaryAssignments(productionOrderId, input.actorUserId, assignedAt);
    await this.assignmentRepository.save(
      this.assignmentRepository.create({
        id: randomUUID(),
        tenantId,
        branchId: order.branchId,
        productionOrderId,
        operationalResourceId: input.operationalResourceId,
        assignmentRole: OperationalAssignmentRole.PRIMARY,
        assignedAt,
        releasedAt: null,
        isCurrent: true,
        isPrimaryResponsible: true,
        assignmentNotes: input.diaryEntry?.trim() || null,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      }),
    );

    await this.recordExecutionEvent({
      tenantId,
      branchId: order.branchId,
      productionOrderId: order.id,
      operationalResourceId: input.operationalResourceId,
      qrEventId: input.qrEventId ?? null,
      actorUserId: input.actorUserId,
      eventType: ProductionExecutionEventType.RESPONSIBILITY_ASSUMED,
      statusBefore: order.status,
      statusAfter: order.status,
      diaryEntry: input.diaryEntry?.trim() || null,
      eventPayload: { source: input.qrEventId ? 'qr_scan' : 'manual' },
    });
    await this.auditService.record({
      tenantId,
      branchId: order.branchId,
      actorUserId: input.actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.responsibility.assumed',
      eventType: 'production.workflow',
      metadata: {
        operationalResourceId: input.operationalResourceId,
        diaryEntry: input.diaryEntry?.trim() || null,
      },
    });
    return this.getById(productionOrderId, tenantId);
  }

  async recordDiaryEntry(
    productionOrderId: string,
    tenantId: string,
    input: {
      actorUserId: string;
      operationalResourceId?: string | null;
      diaryEntry: string;
      qrEventId?: string | null;
      eventPayload?: Record<string, unknown> | null;
    },
  ): Promise<ProductionOrderEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    if (![ProductionOrderStatus.SCHEDULED, ProductionOrderStatus.IN_PROGRESS, ProductionOrderStatus.PAUSED].includes(order.status)) {
      throw new DomainValidationError('Operational Diary updates require a scheduled, in-progress, or paused Production Order.');
    }
    const diaryEntry = input.diaryEntry.trim();
    if (!diaryEntry) {
      throw new DomainValidationError('Operational Diary entry is required.');
    }

    let operationalResourceId = input.operationalResourceId ?? null;
    if (operationalResourceId) {
      await this.operationalResourceService.assertAssignableToBranch(tenantId, operationalResourceId, order.branchId);
    } else {
      operationalResourceId = (await this.assignmentRepository.findCurrentPrimaryByProductionOrder(productionOrderId))?.operationalResourceId ?? null;
    }

    await this.recordExecutionEvent({
      tenantId,
      branchId: order.branchId,
      productionOrderId: order.id,
      operationalResourceId,
      qrEventId: input.qrEventId ?? null,
      actorUserId: input.actorUserId,
      eventType: ProductionExecutionEventType.DIARY_UPDATED,
      statusBefore: order.status,
      statusAfter: order.status,
      diaryEntry,
      eventPayload: { ...(input.eventPayload ?? {}), source: input.qrEventId ? 'qr_scan' : 'manual' },
    });
    await this.auditService.record({
      tenantId,
      branchId: order.branchId,
      actorUserId: input.actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.diary.updated',
      eventType: 'production.traceability',
      metadata: { operationalResourceId, diaryEntry },
    });
    return order;
  }

  async createVersion(
    productionOrderId: string,
    tenantId: string,
    dto: CreateProductionOrderVersionDto,
  ): Promise<ProductionOrderVersionEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    const links = await this.itemLinkRepository.findByProductionOrder(productionOrderId);
    const linkedItemIds = new Set(links.map((link) => link.serviceOrderItemId));
    const affectedServiceOrderItemIds = dto.affectedServiceOrderItemIds?.length
      ? [...new Set(dto.affectedServiceOrderItemIds)]
      : null;
    if (
      [ProductionOrderVersionReason.REWORK, ProductionOrderVersionReason.WARRANTY_EXECUTION, ProductionOrderVersionReason.CORRECTIVE_PRODUCTION].includes(dto.versionReason)
      && (!affectedServiceOrderItemIds || affectedServiceOrderItemIds.length === 0)
    ) {
      throw new DomainValidationError('Corrective Production Order versions require the affected Service Order items.');
    }
    for (const serviceOrderItemId of affectedServiceOrderItemIds ?? []) {
      if (!linkedItemIds.has(serviceOrderItemId)) {
        throw new DomainValidationError('Corrective versions can only include Service Order items linked to the Production Order.');
      }
    }
    const nextVersionNo = Math.max(2, (await this.versionRepository.findLatestVersionNumber(productionOrderId)) + 1);
    const isDraft = dto.isDraft ?? false;
    const isActive = isDraft ? false : dto.activate ?? true;
    if (isActive) {
      await this.versionRepository.deactivateActiveVersions(productionOrderId, dto.actorUserId);
    }

    const version = this.versionRepository.create({
      id: randomUUID(),
      tenantId,
      branchId: order.branchId,
      productionOrderId,
      versionNo: nextVersionNo,
      versionReason: dto.versionReason,
      isActive,
      isDraft,
      productionType: this.mapVersionReasonToProductionType(dto.versionReason),
      deliveryType: dto.deliveryType ?? order.deliveryType,
      operationalPriority: dto.operationalPriority?.trim() || order.operationalPriority,
      changeSummary: dto.changeSummary.trim(),
      plannedQuantity:
        dto.plannedQuantity === undefined || dto.plannedQuantity === null
          ? order.plannedQuantity
          : this.formatQuantity(dto.plannedQuantity),
      scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : order.scheduledStartAt,
      scheduledEndAt: dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : order.scheduledEndAt,
      instructions: dto.instructions?.trim() || order.instructions,
      pieceDescription: dto.pieceDescription?.trim() || order.pieceDescription,
      measurementsSnapshot: order.measurementsSnapshot,
      observations: dto.observations?.trim() || order.observations,
      resourceChangeNotes: dto.resourceChangeNotes?.trim() || null,
      affectedServiceOrderItemIds,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });
    const saved = await this.versionRepository.save(version);
    await this.auditService.record({
      tenantId,
      branchId: order.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.version.created',
      eventType: 'production.write',
      metadata: {
        productionOrderVersionId: saved.id,
        versionNo: saved.versionNo,
        versionReason: saved.versionReason,
        isActive: saved.isActive,
        affectedServiceOrderItemIds: saved.affectedServiceOrderItemIds,
      },
    });
    return saved;
  }

  async listVersions(productionOrderId: string, tenantId: string): Promise<ProductionOrderVersionEntity[]> {
    await this.getById(productionOrderId, tenantId);
    return this.versionRepository.findByProductionOrder(productionOrderId);
  }

  async getPrintView(tenantId: string, productionOrderId: string) {
    const details = await this.getDetails(tenantId, productionOrderId);
    const activeVersion = details.versions.find((version) => version.isActive) ?? null;
    const effectiveDeliveryType = activeVersion?.deliveryType ?? details.productionOrder.deliveryType;
    const effectivePriority = activeVersion?.operationalPriority ?? details.productionOrder.operationalPriority;
    const delivery = this.buildDeliveryBadge(details.productionOrder.customerDeliveryTargetDate);
    const indicators = this.buildPrintIndicators(effectiveDeliveryType, activeVersion?.versionReason ?? null);
    const rejectionReasons =
      activeVersion?.versionReason === ProductionOrderVersionReason.REWORK
        ? await this.latestRejectionReasons(productionOrderId)
        : new Map<string, string>();
    const proofNotes = await this.serviceOrderService.latestProofNotesByItem(details.serviceOrder.id);

    return {
      productionOrderId: details.productionOrder.id,
      productionNo: details.productionOrder.productionNo,
      status: details.productionOrder.status,
      serviceOrder: {
        id: details.serviceOrder.id,
        orderNo: details.serviceOrder.orderNo,
        openedAt: details.serviceOrder.openedAt,
        promisedDeliveryDate: details.serviceOrder.promisedDeliveryDate,
        promisedDeliveryTime: details.serviceOrder.promisedDeliveryTime ?? null,
        returnKind: details.serviceOrder.returnKind ?? null,
        originFloorNames: details.serviceOrder.originFloorNames ?? null,
      },
      customer: {
        id: details.customer.id,
        legalName: details.customer.legalName,
        phone: details.customer.phone ?? null,
        email: details.customer.email ?? null,
        cpfCnpj: details.customer.cpfCnpj ?? null,
        street: details.customer.street ?? null,
        number: details.customer.number ?? null,
        city: details.customer.city ?? null,
        state: details.customer.state ?? null,
        postalCode: details.customer.postalCode ?? null,
      },
      delivery,
      indicators,
      operationalPriority: effectivePriority,
      pieceDescription: activeVersion?.pieceDescription ?? details.productionOrder.pieceDescription,
      instructions: activeVersion?.instructions ?? details.productionOrder.instructions,
      version: activeVersion
        ? {
            id: activeVersion.id,
            versionNo: activeVersion.versionNo,
            versionReason: activeVersion.versionReason,
          }
        : null,
      items: (activeVersion?.affectedServiceOrderItemIds?.length
        ? details.items.filter((item) => activeVersion.affectedServiceOrderItemIds?.includes(item.id))
        : details.items
      ).map((item) => ({
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        complement: item.complement ?? null,
        brand: item.brand ?? '',
        model: item.model ?? '',
        serialNo: item.serialNo ?? '',
        rejectionReason: rejectionReasons.get(item.id) ?? null,
        proofNote: proofNotes.get(item.id) ?? null,
      })),
      qrCode: details.activeQrCode
        ? {
            codeValue: details.activeQrCode.codeValue,
            reissueNo: details.activeQrCode.reissueNo,
          }
        : null,
    };
  }

  async getActiveQrCode(tenantId: string, productionOrderId: string): Promise<QrCodeEntity | null> {
    await this.getById(productionOrderId, tenantId);
    return this.qrCodeRepository.findActiveByProductionOrder(productionOrderId);
  }

  async getActiveQrCodeByValue(tenantId: string, codeValue: string): Promise<QrCodeEntity | null> {
    const qrCode = await this.qrCodeRepository.findByCodeValue(tenantId, codeValue);
    if (!qrCode || !qrCode.isActive) {
      return null;
    }
    return qrCode;
  }

  async reissueQrCode(
    productionOrderId: string,
    tenantId: string,
    actorUserId: string,
  ): Promise<QrCodeEntity> {
    const order = await this.getById(productionOrderId, tenantId);
    const currentActive = await this.qrCodeRepository.findActiveByProductionOrder(productionOrderId);
    const latest = currentActive ?? (await this.qrCodeRepository.findLatestByProductionOrder(productionOrderId));
    const nextReissueNo = (latest?.reissueNo ?? 0) + 1;
    const issuedAt = new Date();
    const qrCode = this.buildQrCode(order, actorUserId, nextReissueNo, issuedAt);

    await this.dataSource.transaction(async (manager) => {
      if (currentActive) {
        currentActive.isActive = false;
        currentActive.revokedAt = issuedAt;
        currentActive.updatedBy = actorUserId;
        await manager.save(QrCodeEntity, currentActive);
      }
      await manager.save(QrCodeEntity, manager.create(QrCodeEntity, qrCode));
    });

    await this.auditService.record({
      tenantId,
      branchId: order.branchId,
      actorUserId,
      entityType: 'production_order',
      entityId: order.id,
      action: 'production_order.qr.reissued',
      eventType: 'production.traceability',
      metadata: { qrCodeId: qrCode.id, reissueNo: qrCode.reissueNo },
    });

    return qrCode;
  }

  async listQrEvents(productionOrderId: string, tenantId: string) {
    await this.getById(productionOrderId, tenantId);
    return this.qrEventRepository.findByProductionOrder(productionOrderId);
  }

  async listExecutionEvents(productionOrderId: string, tenantId: string) {
    await this.getById(productionOrderId, tenantId);
    return this.executionEventRepository.findByProductionOrder(productionOrderId);
  }

  assertBranchAccess(order: ProductionOrderEntity, accessibleBranchIds: string[]): void {
    if (!accessibleBranchIds.includes(order.branchId)) {
      throw new DomainValidationError('Requested production order is outside the authenticated branch scope.');
    }
  }

  private assertMutable(order: ProductionOrderEntity): void {
    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new DomainValidationError('Completed Production Orders cannot be edited.');
    }
  }

  private async recordExecutionEvent(input: {
    tenantId: string;
    branchId: string;
    productionOrderId: string;
    operationalResourceId: string | null;
    qrEventId: string | null;
    actorUserId: string;
    eventType: ProductionExecutionEventType;
    statusBefore: ProductionOrderStatus | null;
    statusAfter: ProductionOrderStatus | null;
    diaryEntry: string | null;
    eventPayload?: Record<string, unknown> | null;
  }): Promise<ProductionExecutionEventEntity> {
    const activeVersion = (await this.versionRepository.findByProductionOrder(input.productionOrderId)).find((version) => version.isActive) ?? null;
    return this.executionEventRepository.save(
      this.executionEventRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        branchId: input.branchId,
        productionOrderId: input.productionOrderId,
        productionOrderVersionId: activeVersion?.id ?? null,
        operationalResourceId: input.operationalResourceId,
        qrEventId: input.qrEventId,
        eventType: input.eventType,
        eventAt: new Date(),
        statusBefore: input.statusBefore,
        statusAfter: input.statusAfter,
        diaryEntry: input.diaryEntry,
        eventPayload: input.eventPayload ?? null,
        recordedBy: input.actorUserId,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      }),
    );
  }

  private buildMeasurementsSnapshot(
    records: Array<{ measurementLabel: string; measurementData: Record<string, unknown>; versionNo: number; measuredAt: Date }>,
  ) {
    if (records.length === 0) {
      return null;
    }

    return Object.fromEntries(
      records.map((record) => [
        record.measurementLabel,
        {
          ...record.measurementData,
          versionNo: record.versionNo,
          measuredAt: record.measuredAt.toISOString(),
        },
      ]),
    );
  }

  private buildDeliveryBadge(date: string) {
    const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(date.slice(5, 7)) - 1];
    return {
      date,
      dayNumber: date.slice(8, 10),
      month,
    };
  }

  private async latestRejectionReasons(productionOrderId: string): Promise<Map<string, string>> {
    const reasons = new Map<string, string>();
    if (typeof this.dataSource.query !== 'function') {
      return reasons;
    }
    try {
      const rows = (await this.dataSource.query(
        `
          SELECT service_order_item_id AS "serviceOrderItemId", notes
          FROM quality_records
          WHERE production_order_id = $1
            AND service_order_item_id IS NOT NULL
            AND notes IS NOT NULL
            AND BTRIM(notes) <> ''
            AND release_decision IN ('rejected', 'rework_requested')
          ORDER BY inspection_at DESC, created_at DESC
        `,
        [productionOrderId],
      )) as Array<{ serviceOrderItemId?: string; notes?: string }>;
      for (const row of rows ?? []) {
        const itemId = row.serviceOrderItemId?.trim();
        const notes = row.notes?.trim();
        if (itemId && notes && !reasons.has(itemId)) {
          reasons.set(itemId, notes);
        }
      }
    } catch {
      return reasons;
    }
    return reasons;
  }

  private buildPrintIndicators(deliveryType: DeliveryType, versionReason: ProductionOrderVersionReason | null): string[] {
    const indicators: string[] = [];
    if (deliveryType === DeliveryType.EXPRESS) {
      indicators.push('[ EXPRESS ]');
    }
    if (deliveryType === DeliveryType.PRIORITY) {
      indicators.push('[ PRIORITY ]');
    }
    if (versionReason === ProductionOrderVersionReason.REWORK) {
      indicators.push('[ REWORK ]');
    }
    if (versionReason === ProductionOrderVersionReason.WARRANTY_EXECUTION) {
      indicators.push('[ WARRANTY ]');
    }
    if (versionReason === ProductionOrderVersionReason.CORRECTIVE_PRODUCTION) {
      indicators.push('[ CORRECTIVE ]');
    }
    return indicators;
  }

  private buildQrCode(
    order: ProductionOrderEntity,
    actorUserId: string,
    reissueNo: number,
    issuedAt = new Date(),
  ): QrCodeEntity {
    return this.qrCodeRepository.create({
      id: randomUUID(),
      tenantId: order.tenantId,
      branchId: order.branchId,
      productionOrderId: order.id,
      reissueNo,
      codeValue: this.generateQrCodeValue(order.productionNo, reissueNo),
      issuedAt,
      isActive: true,
      revokedAt: null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
  }

  private generateQrCodeValue(productionNo: string, reissueNo: number): string {
    return `${productionNo}::QR::${reissueNo}::${randomUUID().slice(0, 12).toUpperCase()}`;
  }

  private generateProductionNo(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `PO-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private formatQuantity(value: number): string {
    return value.toFixed(4);
  }

  private mapVersionReasonToProductionType(reason: ProductionOrderVersionReason): string {
    switch (reason) {
      case ProductionOrderVersionReason.REWORK:
        return 'rework';
      case ProductionOrderVersionReason.WARRANTY_EXECUTION:
        return 'warranty_execution';
      case ProductionOrderVersionReason.CORRECTIVE_PRODUCTION:
        return 'corrective_production';
      default:
        return 'base';
    }
  }
}
