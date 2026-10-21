import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { ProductionOrderService } from 'src/modules/production-orders/application/production-order/production-order.service';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import {
  CustomerRejectionStatus,
  QualityInspectionResult,
  QualityInspectionType,
  QualityReleaseDecision,
  ServiceOrderStatus,
} from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { ReworkService } from 'src/modules/rework/application/rework/rework.service';
import { WarrantyService } from 'src/modules/warranty/application/warranty/warranty.service';
import { CreateCustomerRejectionDto } from '../../contracts/dto/create-customer-rejection.dto';
import { CreateQualityRecordDto } from '../../contracts/dto/create-quality-record.dto';
import { QualityDecisionDto } from '../../contracts/dto/quality-decision.dto';
import { RequestReworkFromQualityDto } from '../../contracts/dto/request-rework-from-quality.dto';
import { RequestWarrantyExecutionFromQualityDto } from '../../contracts/dto/request-warranty-execution-from-quality.dto';
import { SearchCustomerRejectionsDto } from '../../contracts/dto/search-customer-rejections.dto';
import { SearchQualityRecordsDto } from '../../contracts/dto/search-quality-records.dto';
import { UpdateCustomerRejectionDto } from '../../contracts/dto/update-customer-rejection.dto';
import { UpdateQualityDefectDto } from '../../contracts/dto/update-quality-record.dto';
import { UpdateQualityRecordDto } from '../../contracts/dto/update-quality-record.dto';
import { CustomerRejectionEntity } from '../../infrastructure/persistence/entities/customer-rejection.entity';
import { QualityRecordEntity } from '../../infrastructure/persistence/entities/quality-record.entity';
import { CustomerRejectionRepository } from '../../infrastructure/persistence/repositories/customer-rejection.repository';
import { QualityRecordRepository } from '../../infrastructure/persistence/repositories/quality-record.repository';
import {
  activeCorrectiveVersion,
  belongsToQualityQueue,
  currentReviewItemIds,
  currentRoundFinished,
  isReworkWaitingReturn,
  latestQualityRecordByItem,
  reviewPhase,
  reviewPieceState,
  type QualityReviewPhase,
} from './quality-review';

@Injectable()
export class QualityService {
  constructor(
    @Inject(QualityRecordRepository)
    private readonly qualityRecordRepository: QualityRecordRepository,
    @Inject(CustomerRejectionRepository)
    private readonly customerRejectionRepository: CustomerRejectionRepository,
    @Inject(ProductionOrderService)
    private readonly productionOrderService: ProductionOrderService,
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(ReworkService)
    private readonly reworkService: ReworkService,
    @Inject(WarrantyService)
    private readonly warrantyService: WarrantyService,
  ) {}

  async searchRecords(tenantId: string, filters: SearchQualityRecordsDto & { accessibleBranchIds: string[] }) {
    await this.tenantService.getById(tenantId);
    if (filters.branchId) {
      const branch = await this.branchService.getById(filters.branchId);
      if (branch.tenantId !== tenantId) throw new DomainValidationError('Branch must belong to the same tenant.');
    }
    if (filters.productionOrderId) await this.productionOrderService.getById(filters.productionOrderId, tenantId);
    return this.qualityRecordRepository.search(tenantId, filters);
  }

  async getRecordById(id: string, tenantId: string): Promise<QualityRecordEntity> {
    const entity = await this.qualityRecordRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) throw new EntityNotFoundError(`Quality Record '${id}' was not found.`);
    return entity;
  }

  async getRecordDetails(tenantId: string, id: string) {
    const record = await this.getRecordById(id, tenantId);
    const productionOrder = await this.productionOrderService.getById(record.productionOrderId, tenantId);
    const history = await this.auditService.listByEntity(tenantId, 'quality_record', record.id, 200);
    return {
      qualityRecord: record,
      qualityStatus: record.releaseDecision,
      productionOrder,
      history,
      timeline: [...history].reverse(),
    };
  }

  async createRecord(dto: CreateQualityRecordDto): Promise<QualityRecordEntity> {
    const details = await this.productionOrderService.getDetails(dto.tenantId, dto.productionOrderId);
    if (dto.serviceOrderItemId && !details.items.some((item) => item.id === dto.serviceOrderItemId)) {
      throw new DomainValidationError('Quality item scope must belong to the linked Production Order.');
    }
    const entity = this.qualityRecordRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      branchId: details.productionOrder.branchId,
      productionOrderId: dto.productionOrderId,
      serviceOrderItemId: dto.serviceOrderItemId ?? null,
      workflowDefinitionId: null,
      currentStatusDefinitionId: null,
      qualityResponsibleActorId: dto.actorUserId,
      inspectionType: dto.inspectionType,
      inspectionResult: QualityInspectionResult.PENDING,
      inspectionAt: dto.inspectionAt ? new Date(dto.inspectionAt) : new Date(),
      releaseDecision: QualityReleaseDecision.PENDING,
      defects: this.mapDefects(dto.defects),
      notes: dto.notes?.trim() || null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });
    const saved = await this.qualityRecordRepository.save(entity);
    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'quality_record',
      entityId: saved.id,
      action: 'quality_record.created',
      eventType: 'quality.write',
      metadata: { productionOrderId: saved.productionOrderId, serviceOrderItemId: saved.serviceOrderItemId },
    });
    return saved;
  }

  async updateRecord(id: string, tenantId: string, dto: UpdateQualityRecordDto): Promise<QualityRecordEntity> {
    const entity = await this.getRecordById(id, tenantId);
    if (entity.releaseDecision === QualityReleaseDecision.APPROVED) {
      throw new DomainValidationError('Approved quality records cannot be edited.');
    }
    if (dto.serviceOrderItemId !== undefined) {
      const details = await this.productionOrderService.getDetails(tenantId, entity.productionOrderId);
      if (dto.serviceOrderItemId && !details.items.some((item) => item.id === dto.serviceOrderItemId)) {
        throw new DomainValidationError('Quality item scope must belong to the linked Production Order.');
      }
      entity.serviceOrderItemId = dto.serviceOrderItemId ?? null;
    }
    if (dto.inspectionType !== undefined) entity.inspectionType = dto.inspectionType;
    if (dto.inspectionResult !== undefined) entity.inspectionResult = dto.inspectionResult;
    if (dto.inspectionAt !== undefined) entity.inspectionAt = dto.inspectionAt ? new Date(dto.inspectionAt) : entity.inspectionAt;
    if (dto.defects !== undefined) entity.defects = this.mapDefects(dto.defects);
    if (dto.notes !== undefined) entity.notes = dto.notes?.trim() || null;
    entity.updatedBy = dto.actorUserId;
    const saved = await this.qualityRecordRepository.save(entity);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'quality_record',
      entityId: saved.id,
      action: 'quality_record.updated',
      eventType: 'quality.write',
      metadata: { releaseDecision: saved.releaseDecision, inspectionResult: saved.inspectionResult },
    });
    return saved;
  }

  private mapDefects(
    defects:
      | Array<{
          description: string;
          category: string;
          severity: string;
        }>
      | UpdateQualityDefectDto[]
      | undefined
      | null,
  ): Array<Record<string, unknown>> | null {
    if (!defects?.length) return null;
    return defects.map((defect) => ({
      description: defect.description,
      category: defect.category,
      severity: defect.severity,
    }));
  }

  async approve(id: string, tenantId: string, dto: QualityDecisionDto): Promise<QualityRecordEntity> {
    const entity = await this.getRecordById(id, tenantId);
    entity.inspectionResult = QualityInspectionResult.PASSED;
    entity.releaseDecision = QualityReleaseDecision.APPROVED;
    entity.qualityResponsibleActorId = dto.actorUserId;
    entity.notes = dto.notes?.trim() || entity.notes;
    entity.updatedBy = dto.actorUserId;
    const saved = await this.qualityRecordRepository.save(entity);
    await this.auditService.record({ tenantId, branchId: saved.branchId, actorUserId: dto.actorUserId, entityType: 'quality_record', entityId: saved.id, action: 'quality_record.approved', eventType: 'quality.workflow', metadata: {} });
    return saved;
  }

  async reject(id: string, tenantId: string, dto: QualityDecisionDto): Promise<QualityRecordEntity> {
    const entity = await this.getRecordById(id, tenantId);
    entity.inspectionResult = QualityInspectionResult.FAILED;
    entity.releaseDecision = QualityReleaseDecision.REJECTED;
    entity.qualityResponsibleActorId = dto.actorUserId;
    entity.notes = dto.notes?.trim() || entity.notes;
    entity.updatedBy = dto.actorUserId;
    const saved = await this.qualityRecordRepository.save(entity);
    await this.auditService.record({ tenantId, branchId: saved.branchId, actorUserId: dto.actorUserId, entityType: 'quality_record', entityId: saved.id, action: 'quality_record.rejected', eventType: 'quality.workflow', metadata: {} });
    return saved;
  }

  async requestRework(id: string, tenantId: string, dto: RequestReworkFromQualityDto) {
    const entity = await this.getRecordById(id, tenantId);
    entity.inspectionResult = QualityInspectionResult.FAILED;
    entity.releaseDecision = QualityReleaseDecision.REWORK_REQUESTED;
    entity.qualityResponsibleActorId = dto.actorUserId;
    entity.updatedBy = dto.actorUserId;
    const saved = await this.qualityRecordRepository.save(entity);
    const reworkCase = await this.reworkService.create({
      tenantId,
      actorUserId: dto.actorUserId,
      productionOrderId: saved.productionOrderId,
      affectedServiceOrderItemIds: dto.affectedServiceOrderItemIds,
      reworkReason: dto.reworkReason,
      correctiveOperationalResourceId: dto.correctiveOperationalResourceId ?? null,
      assignmentNotes: dto.assignmentNotes ?? null,
      qualityRecordId: saved.id,
    });
    await this.auditService.record({ tenantId, branchId: saved.branchId, actorUserId: dto.actorUserId, entityType: 'quality_record', entityId: saved.id, action: 'quality_record.rework.requested', eventType: 'quality.workflow', metadata: { reworkCaseId: reworkCase.id } });
    return { qualityRecord: saved, reworkCase };
  }

  async requestWarrantyExecution(id: string, tenantId: string, dto: RequestWarrantyExecutionFromQualityDto) {
    const entity = await this.getRecordById(id, tenantId);
    const productionOrder = await this.productionOrderService.getById(entity.productionOrderId, tenantId);
    entity.inspectionResult = QualityInspectionResult.FAILED;
    entity.releaseDecision = QualityReleaseDecision.WARRANTY_EXECUTION_REQUESTED;
    entity.qualityResponsibleActorId = dto.actorUserId;
    entity.updatedBy = dto.actorUserId;
    const saved = await this.qualityRecordRepository.save(entity);
    const warrantyExecution = await this.warrantyService.createExecution({
      tenantId,
      actorUserId: dto.actorUserId,
      serviceOrderId: productionOrder.serviceOrderId,
      productionOrderId: productionOrder.id,
      affectedServiceOrderItemIds: dto.affectedServiceOrderItemIds,
      executionReason: dto.executionReason,
      correctiveOperationalResourceId: dto.correctiveOperationalResourceId ?? null,
      qualityRecordId: saved.id,
    });
    await this.auditService.record({ tenantId, branchId: saved.branchId, actorUserId: dto.actorUserId, entityType: 'quality_record', entityId: saved.id, action: 'quality_record.warranty_execution.requested', eventType: 'quality.workflow', metadata: { warrantyExecutionId: warrantyExecution.id } });
    return { qualityRecord: saved, warrantyExecution };
  }

  async searchReviews(tenantId: string, filters: { q?: string; accessibleBranchIds: string[] }) {
    const orders = await this.serviceOrderService.search(tenantId, {
      q: filters.q,
      status: ServiceOrderStatus.AWAITING_QUALITY,
      accessibleBranchIds: filters.accessibleBranchIds,
    });
    const reviews = [];
    for (const serviceOrder of orders) {
      if (!belongsToQualityQueue(serviceOrder.status, serviceOrder.bagClosed)) {
        continue;
      }
      const details = await this.productionOrderService.getDetailsByServiceOrder(
        tenantId,
        serviceOrder.id,
        filters.accessibleBranchIds,
      );
      if (!details) {
        continue;
      }
      reviews.push({
        id: details.serviceOrder.id,
        serviceOrderId: details.serviceOrder.id,
        orderNo: details.serviceOrder.orderNo,
        status: details.serviceOrder.status,
        bagClosed: details.serviceOrder.bagClosed,
        promisedDeliveryDate: details.serviceOrder.promisedDeliveryDate,
        customerName: details.customer.legalName,
        productionOrderId: details.productionOrder.id,
        productionNo: details.productionOrder.productionNo,
        versionNo: activeCorrectiveVersion(details.versions)?.versionNo ?? 1,
      });
    }
    return reviews;
  }

  async getReview(tenantId: string, serviceOrderId: string, accessibleBranchIds: string[]) {
    const built = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    return built.review;
  }

  async decideItem(
    tenantId: string,
    serviceOrderId: string,
    serviceOrderItemId: string,
    actorUserId: string,
    accessibleBranchIds: string[],
    decision: 'approved' | 'rejected',
    reason?: string | null,
  ) {
    let built = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    if (built.review.phase === 'rework_issued') {
      throw new DomainValidationError('A sacola está na esteira. A revisão do retorno abre depois do Terminei.');
    }
    if (this.returnStillClosed(built)) {
      await this.openReturnRound(built, tenantId, actorUserId);
      built = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    }
    const item = built.review.items.find((row) => row.id === serviceOrderItemId);
    if (!item) {
      throw new DomainValidationError('Esta peça não pertence à Ordem de Produção da OS.');
    }
    if (!item.canDecide) {
      throw new DomainValidationError('Esta peça não está disponível para revisão nesta versão.');
    }
    if (decision === 'rejected' && !reason?.trim()) {
      throw new DomainValidationError('Informe o motivo da reprovação.');
    }

    const inspectionType = built.activeVersion
      ? QualityInspectionType.POST_REWORK
      : QualityInspectionType.FINAL;
    let recordId = item.qualityRecordId;
    const latest = built.latestByItem.get(serviceOrderItemId);
    if (!recordId || latest?.releaseDecision !== QualityReleaseDecision.PENDING) {
      const created = await this.createRecord({
        tenantId,
        actorUserId,
        productionOrderId: built.review.productionOrder.id,
        serviceOrderItemId,
        inspectionType,
      });
      recordId = created.id;
    }
    if (decision === 'approved') {
      await this.approve(recordId, tenantId, { actorUserId });
    } else {
      await this.reject(recordId, tenantId, { actorUserId, notes: reason?.trim() });
    }
    await this.serviceOrderService.applyQualityStatus(
      serviceOrderId,
      tenantId,
      ServiceOrderStatus.QUALITY,
      actorUserId,
    );

    const afterDecision = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    if (currentRoundFinished(afterDecision.review.items.filter((row) => row.inCurrentRound))) {
      return this.completeRound(tenantId, serviceOrderId, actorUserId, accessibleBranchIds);
    }
    return { review: afterDecision.review, printView: null as null, issuedRework: false };
  }

  async startReturn(tenantId: string, serviceOrderId: string, actorUserId: string, accessibleBranchIds: string[]) {
    const built = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    if (!this.returnStillClosed(built)) {
      if (built.review.phase === 'rework_issued') {
        throw new DomainValidationError('A sacola ainda está na esteira. A revisão do retorno abre depois do Terminei.');
      }
      throw new DomainValidationError('Só é possível revisar o retorno quando há peças em refação.');
    }
    await this.openReturnRound(built, tenantId, actorUserId);
    return this.getReview(tenantId, serviceOrderId, accessibleBranchIds);
  }

  private returnStillClosed(built: Awaited<ReturnType<QualityService['buildReview']>>) {
    if (built.review.serviceOrder.status !== ServiceOrderStatus.AWAITING_QUALITY) {
      return false;
    }
    const currentIds = built.review.items.filter((row) => row.inCurrentRound).map((row) => row.id);
    return isReworkWaitingReturn(built.activeVersion, built.latestByItem, currentIds);
  }

  private async openReturnRound(
    built: Awaited<ReturnType<QualityService['buildReview']>>,
    tenantId: string,
    actorUserId: string,
  ) {
    const currentIds = built.review.items.filter((row) => row.inCurrentRound).map((row) => row.id);
    for (const serviceOrderItemId of currentIds) {
      const latest = built.latestByItem.get(serviceOrderItemId);
      if (latest?.releaseDecision === QualityReleaseDecision.PENDING) {
        continue;
      }
      await this.createRecord({
        tenantId,
        actorUserId,
        productionOrderId: built.review.productionOrder.id,
        serviceOrderItemId,
        inspectionType: QualityInspectionType.POST_REWORK,
      });
    }
    await this.serviceOrderService.applyQualityStatus(
      built.review.serviceOrder.id,
      tenantId,
      ServiceOrderStatus.QUALITY,
      actorUserId,
    );
  }

  private async completeRound(
    tenantId: string,
    serviceOrderId: string,
    actorUserId: string,
    accessibleBranchIds: string[],
  ) {
    const built = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    const currentItems = built.review.items.filter((row) => row.inCurrentRound);
    const rejected = currentItems.filter((row) => row.decision === 'rejected');
    if (rejected.length === 0) {
      await this.serviceOrderService.applyQualityStatus(
        serviceOrderId,
        tenantId,
        ServiceOrderStatus.READY_FOR_PICKUP,
        actorUserId,
      );
      const ready = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
      return { review: ready.review, printView: null as null, issuedRework: false };
    }

    const reasons = rejected
      .map((row) => row.reason?.trim())
      .filter((value): value is string => Boolean(value))
      .join('; ');
    const qualityRecordId = rejected[0]?.qualityRecordId ?? undefined;
    await this.reworkService.create({
      tenantId,
      actorUserId,
      productionOrderId: built.review.productionOrder.id,
      affectedServiceOrderItemIds: rejected.map((row) => row.id),
      reworkReason: reasons || 'Reprovado na qualidade',
      qualityRecordId,
    });
    const afterRework = await this.buildReview(tenantId, serviceOrderId, accessibleBranchIds);
    const printView = await this.productionOrderService.getPrintView(tenantId, built.review.productionOrder.id);
    const reasonById = new Map(rejected.map((row) => [row.id, row.reason?.trim() || '']));
    return {
      review: afterRework.review,
      printView: {
        ...printView,
        items: printView.items.map((item: { id?: string; rejectionReason?: string | null }) => ({
          ...item,
          rejectionReason: item.rejectionReason || (item.id ? reasonById.get(item.id) : null) || null,
        })),
      },
      issuedRework: true,
    };
  }

  private async buildReview(tenantId: string, serviceOrderId: string, accessibleBranchIds: string[]) {
    const details = await this.productionOrderService.getDetailsByServiceOrder(
      tenantId,
      serviceOrderId,
      accessibleBranchIds,
    );
    if (!details) {
      throw new EntityNotFoundError('Esta OS ainda não tem Ordem de Produção.');
    }
    if (!details.serviceOrder.bagClosed) {
      throw new DomainValidationError('Feche a sacola antes de revisar a qualidade.');
    }

    const records = await this.qualityRecordRepository.findByProductionOrder(details.productionOrder.id);
    const latestByItem = latestQualityRecordByItem(records);
    const activeVersion = activeCorrectiveVersion(details.versions);
    const allItemIds = details.items.map((item) => item.id);
    const currentIds = new Set(currentReviewItemIds(allItemIds, activeVersion));
    const reworkWaitingReturn = isReworkWaitingReturn(activeVersion, latestByItem, [...currentIds]);

    const items = details.items.map((item) => {
      const latest = latestByItem.get(item.id);
      const inCurrentRound = currentIds.has(item.id);
      const state = reviewPieceState(latest, inCurrentRound, reworkWaitingReturn, details.serviceOrder.status);
      return {
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        complement: item.complement ?? null,
        brand: item.brand ?? '',
        model: item.model ?? '',
        serialNo: item.serialNo ?? '',
        inCurrentRound,
        decision: state.decision,
        canDecide: state.canDecide,
        reason: latest?.notes ?? null,
        qualityRecordId: latest?.id ?? null,
      };
    });

    const allItemsApproved = items.length > 0 && items.every((item) => item.decision === 'approved');
    const phase: QualityReviewPhase = reviewPhase(details.serviceOrder.status, allItemsApproved, reworkWaitingReturn);

    return {
      latestByItem,
      activeVersion,
      review: {
        serviceOrder: {
          id: details.serviceOrder.id,
          orderNo: details.serviceOrder.orderNo,
          status: details.serviceOrder.status,
          openedAt: details.serviceOrder.openedAt,
          promisedDeliveryDate: details.serviceOrder.promisedDeliveryDate,
          bagClosed: details.serviceOrder.bagClosed,
        },
        customer: {
          legalName: details.customer.legalName,
          phone: details.customer.phone ?? null,
        },
        productionOrder: {
          id: details.productionOrder.id,
          productionNo: details.productionOrder.productionNo,
        },
        phase,
        versionNo: activeVersion?.versionNo ?? 1,
        items,
      },
    };
  }

  async listByProductionOrder(tenantId: string, productionOrderId: string) {
    await this.productionOrderService.getById(productionOrderId, tenantId);
    return this.qualityRecordRepository.findByProductionOrder(productionOrderId);
  }

  async searchRejections(tenantId: string, filters: SearchCustomerRejectionsDto & { accessibleBranchIds: string[] }) {
    await this.tenantService.getById(tenantId);
    if (filters.branchId) {
      const branch = await this.branchService.getById(filters.branchId);
      if (branch.tenantId !== tenantId) throw new DomainValidationError('Branch must belong to the same tenant.');
    }
    if (filters.serviceOrderId) await this.serviceOrderService.getById(filters.serviceOrderId, tenantId);
    return this.customerRejectionRepository.search(tenantId, filters);
  }

  async getRejectionById(id: string, tenantId: string): Promise<CustomerRejectionEntity> {
    const entity = await this.customerRejectionRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) throw new EntityNotFoundError(`Customer Rejection '${id}' was not found.`);
    return entity;
  }

  async getRejectionDetails(tenantId: string, id: string) {
    const rejection = await this.getRejectionById(id, tenantId);
    const serviceOrder = await this.serviceOrderService.getById(rejection.serviceOrderId, tenantId);
    const history = await this.auditService.listByEntity(tenantId, 'customer_rejection', rejection.id, 200);
    return { customerRejection: rejection, serviceOrder, history, timeline: [...history].reverse() };
  }

  async createRejection(dto: CreateCustomerRejectionDto): Promise<CustomerRejectionEntity> {
    const serviceOrderDetails = await this.serviceOrderService.getDetails(dto.tenantId, dto.serviceOrderId);
    if (!serviceOrderDetails.items.some((item) => item.id === dto.serviceOrderItemId)) {
      throw new DomainValidationError('Customer rejection item must belong to the referenced Service Order.');
    }
    const entity = this.customerRejectionRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      branchId: serviceOrderDetails.serviceOrder.branchId,
      serviceOrderId: dto.serviceOrderId,
      serviceOrderItemId: dto.serviceOrderItemId,
      qualityRecordId: dto.qualityRecordId ?? null,
      reportedQuantity: dto.reportedQuantity === undefined || dto.reportedQuantity === null ? null : dto.reportedQuantity.toFixed(4),
      rejectionReason: dto.rejectionReason.trim(),
      severity: dto.severity ?? null,
      resolutionType: dto.resolutionType ?? null,
      notes: dto.notes?.trim() || null,
      reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
      status: CustomerRejectionStatus.OPEN,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });
    const saved = await this.customerRejectionRepository.save(entity);
    await this.auditService.record({ tenantId: dto.tenantId, branchId: saved.branchId, actorUserId: dto.actorUserId, entityType: 'customer_rejection', entityId: saved.id, action: 'customer_rejection.created', eventType: 'quality.write', metadata: { serviceOrderId: saved.serviceOrderId, serviceOrderItemId: saved.serviceOrderItemId, resolutionType: saved.resolutionType } });
    return saved;
  }

  async updateRejection(id: string, tenantId: string, dto: UpdateCustomerRejectionDto): Promise<CustomerRejectionEntity> {
    const entity = await this.getRejectionById(id, tenantId);
    if (dto.reportedQuantity !== undefined) entity.reportedQuantity = dto.reportedQuantity === null ? null : dto.reportedQuantity.toFixed(4);
    if (dto.rejectionReason !== undefined) entity.rejectionReason = dto.rejectionReason.trim();
    if (dto.severity !== undefined) entity.severity = dto.severity;
    if (dto.resolutionType !== undefined) entity.resolutionType = dto.resolutionType;
    if (dto.notes !== undefined) entity.notes = dto.notes?.trim() || null;
    if (dto.status !== undefined) entity.status = dto.status;
    entity.updatedBy = dto.actorUserId;
    const saved = await this.customerRejectionRepository.save(entity);
    await this.auditService.record({ tenantId, branchId: saved.branchId, actorUserId: dto.actorUserId, entityType: 'customer_rejection', entityId: saved.id, action: 'customer_rejection.updated', eventType: 'quality.write', metadata: { status: saved.status, resolutionType: saved.resolutionType } });
    return saved;
  }
}
