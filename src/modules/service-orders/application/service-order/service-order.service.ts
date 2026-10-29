import { Inject, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { CompanyService } from 'src/modules/company/application/company/company.service';
import { CustomerService } from 'src/modules/crm/application/customer/customer.service';
import { MeasurementService } from 'src/modules/crm/application/measurement/measurement.service';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import {
  DeliveryType,
  ServiceOrderItemStatus,
  ServiceOrderReturnKind,
  ServiceOrderStatus,
  SurchargeMethod,
  UserStatus,
} from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { CreateServiceOrderDto, CreateServiceOrderItemInputDto } from '../../contracts/dto/create-service-order.dto';
import { CreateServiceOrderItemDto } from '../../contracts/dto/create-service-order-item.dto';
import { SearchServiceOrdersDto } from '../../contracts/dto/search-service-orders.dto';
import { UpdateServiceOrderDto } from '../../contracts/dto/update-service-order.dto';
import { UpdateServiceOrderItemDto } from '../../contracts/dto/update-service-order-item.dto';
import { enqueueWhatsappNotice } from 'src/modules/whatsapp/application/whatsapp.delivery';
import { WHATSAPP_OS_OPENED, WHATSAPP_READY } from 'src/modules/whatsapp/application/whatsapp.rules';
import { AtelierCatalogService } from '../atelier-catalog/atelier-catalog.service';
import { currentClockTime, normalizeClockTime } from '../delivery-date/clock-time';
import { DeliveryDateService } from '../delivery-date/delivery-date.service';
import {
  canReopenBagAfterFloor,
  floorActionAudit,
  floorActionResultStatus,
  isItemFinishAction,
  measuredExecutionMinutes,
  nextFloorAction,
} from './service-order-floor';
import {
  canActOnProof,
  canSendToProof,
  latestProofNoteByItem,
  normalizeProofNotes,
  proofActionAudit,
  proofActionResultStatus,
  type ProofAction,
} from './service-order-proof';
import {
  APPROVAL_ACCEPTED_TEXT,
  APPROVAL_RELEASE_TEXT,
  LINK_ACCEPTANCE_TEXT,
  PUBLIC_PRIVACY_NOTICE,
  buildApprovalMeasurementsSnapshot,
  buildApprovalServicesSnapshot,
  canRecordApproval,
  isCustomerSignatureMethod,
  normalizeApprovalPhoto,
  normalizeReleaseReason,
  type ApprovalMethod,
} from './service-order-approval';
import {
  canCompletePickup,
  canConfirmPickupFromLink,
  canStartPickup,
  isPickupWindowOpen,
  normalizePickupPhoto,
  pickupAcceptedText,
  pickupBlockedByOutstanding,
  pickupWindowExpiresAt,
  type PickupMethod,
} from './service-order-pickup';
import {
  osGroupPaymentFromMembers,
  osHasPendingProcessSibling,
  isCounterFinancialChild,
  osPayLockedOnParent,
} from './service-order-finance';
import { publicCustomerFirstName, publicOsStatusLabel } from './service-order-public';
import { buildClientReturnPreview, osReturnKindLabel, todayDateOnly } from './service-order-return';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import {
  DEFAULT_MAX_PIECES_PER_BAG,
  formatServiceOrderNo,
  isProcessRow,
  nextBagVersionSuffix,
  nextProcessSuffix,
  PROCESS_SUFFIX,
  processLetterForReturnKind,
  withVersionSuffix,
} from './service-order-version';
import { ServiceOrderEntity } from '../../infrastructure/persistence/entities/service-order.entity';
import { ServiceOrderItemEntity } from '../../infrastructure/persistence/entities/service-order-item.entity';
import { ServiceOrderItemRepository } from '../../infrastructure/persistence/repositories/service-order-item.repository';
import { ServiceOrderApprovalRepository } from '../../infrastructure/persistence/repositories/service-order-approval.repository';
import { ServiceOrderPickupRepository } from '../../infrastructure/persistence/repositories/service-order-pickup.repository';
import { ServiceOrderProofNoteRepository } from '../../infrastructure/persistence/repositories/service-order-proof-note.repository';
import {
  ServiceOrderRepository,
  ServiceOrderSearchFilters,
} from '../../infrastructure/persistence/repositories/service-order.repository';

export const MAX_SERVICE_ORDER_ITEMS = DEFAULT_MAX_PIECES_PER_BAG;

@Injectable()
export class ServiceOrderService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(ServiceOrderRepository)
    private readonly serviceOrderRepository: ServiceOrderRepository,
    @Inject(ServiceOrderItemRepository)
    private readonly serviceOrderItemRepository: ServiceOrderItemRepository,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(CustomerService)
    private readonly customerService: CustomerService,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(DeliveryDateService)
    private readonly deliveryDateService: DeliveryDateService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(AtelierCatalogService)
    private readonly atelierCatalogService: AtelierCatalogService,
    @Inject(ServiceOrderProofNoteRepository)
    private readonly proofNoteRepository: ServiceOrderProofNoteRepository,
    @Inject(ServiceOrderPickupRepository)
    private readonly pickupRepository: ServiceOrderPickupRepository,
    @Inject(MeasurementService)
    private readonly measurementService: MeasurementService,
    @Inject(ServiceOrderApprovalRepository)
    private readonly approvalRepository: ServiceOrderApprovalRepository,
    @Inject(CompanyService)
    private readonly companyService: CompanyService,
  ) {}

  async create(dto: CreateServiceOrderDto): Promise<{ serviceOrder: ServiceOrderEntity; items: ServiceOrderItemEntity[] }> {
    const tenant = await this.tenantService.getById(dto.tenantId);
    const maxPiecesPerBag = tenant.maxPiecesPerBag ?? DEFAULT_MAX_PIECES_PER_BAG;
    const branch = await this.branchService.getById(dto.branchId);
    if (branch.tenantId !== dto.tenantId) {
      throw new DomainValidationError('A filial precisa pertencer à mesma conta da ordem de serviço.');
    }

    const customer = await this.customerService.getById(dto.customerId, dto.tenantId);
    this.assertCustomerBranchCompatibility(customer.branchId, dto.branchId);

    const commercialResponsibleActorId = dto.commercialResponsibleActorId ?? dto.actorUserId;
    const technicalMeasurementResponsibleActorId = dto.technicalMeasurementResponsibleActorId ?? commercialResponsibleActorId;
    await this.assertResponsibleActor(dto.tenantId, commercialResponsibleActorId, 'Commercial Responsible');
    await this.assertResponsibleActor(
      dto.tenantId,
      technicalMeasurementResponsibleActorId,
      'Technical Measurement Responsible',
    );

    this.assertItemCount(dto.items.length, maxPiecesPerBag);

    const openedAt = dto.deliveryCommitmentSourceAt ? new Date(dto.deliveryCommitmentSourceAt) : new Date();
    const deliveryCommitmentSourceAt = dto.deliveryCommitmentSourceAt ? new Date(dto.deliveryCommitmentSourceAt) : openedAt;
    const suggestedDelivery = await this.deliveryDateService.suggestDelivery(
      dto.tenantId,
      dto.branchId,
      deliveryCommitmentSourceAt,
      { deliveryType: dto.deliveryType, itemCount: dto.items.length },
    );
    const promisedDeliveryDate = dto.promisedDeliveryDate ?? suggestedDelivery.promisedDeliveryDate;
    const promisedDeliveryTime =
      normalizeClockTime(dto.promisedDeliveryTime) ?? currentClockTime(openedAt);

    const normalizedItems: Array<Awaited<ReturnType<ServiceOrderService['resolveCatalogFields']>>> = [];
    for (const item of dto.items) {
      normalizedItems.push(await this.resolveCatalogFields(dto.tenantId, dto.actorUserId, this.normalizeItemInput(item), true));
    }
    const normalizedDiscountValue = dto.discountValue ?? 0;
    const normalizedSurchargeValue = dto.deliverySurchargeValue ?? 0;
    const orderTotals = this.calculateOrderTotal(normalizedItems, normalizedDiscountValue, dto.deliverySurchargeMethod ?? null, normalizedSurchargeValue);
    const orderId = randomUUID();
    const groupSeq = await this.serviceOrderRepository.nextGroupSeq(dto.tenantId);

    const serviceOrder = this.serviceOrderRepository.create({
      id: orderId,
      tenantId: dto.tenantId,
      branchId: dto.branchId,
      customerId: dto.customerId,
      workflowDefinitionId: null,
      currentStatusDefinitionId: null,
      orderNo: formatServiceOrderNo(groupSeq),
      groupId: orderId,
      groupSeq,
      versionSuffix: null,
      bagClosed: false,
      openedAt,
      deliveryCommitmentSourceAt,
      promisedDeliveryDate,
      promisedDeliveryTime,
      difficultyGrade: this.optionalDifficulty(dto.difficultyGrade),
      actualPickupDate: dto.actualPickupDate ?? null,
      originServiceOrderId: null,
      returnKind: null,
      actualDeliveryDate: dto.actualDeliveryDate ?? null,
      actualDeliveryTime: null,
      paymentTermsDays: dto.paymentTermsDays ?? 0,
      deliveryType: dto.deliveryType ?? DeliveryType.STANDARD,
      operationalPriority: dto.operationalPriority?.trim() || null,
      commercialResponsibleActorId,
      technicalMeasurementResponsibleActorId,
      deliverySurchargeMethod: dto.deliverySurchargeMethod ?? null,
      deliverySurchargeValue: dto.deliverySurchargeMethod ? this.formatMoney(normalizedSurchargeValue) : null,
      commercialNotes: dto.commercialNotes?.trim() || null,
      customerNotes: dto.customerNotes?.trim() || null,
      publicToken: randomUUID(),
      status: ServiceOrderStatus.OPEN,
      totalValue: orderTotals,
      discountValue: dto.discountValue !== undefined ? this.formatMoney(normalizedDiscountValue) : null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const persistedOrder = manager.create(ServiceOrderEntity, serviceOrder);
      await manager.save(ServiceOrderEntity, persistedOrder);

      const persistedItems: ServiceOrderItemEntity[] = [];
      for (const [index, item] of normalizedItems.entries()) {
        const serviceOrderItem = manager.create(ServiceOrderItemEntity, {
          id: randomUUID(),
          tenantId: dto.tenantId,
          branchId: dto.branchId,
          serviceOrderId: persistedOrder.id,
          itemNo: index + 1,
          itemType: item.itemType,
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          complement: item.complement,
          brand: item.brand,
          model: item.model,
          serialNo: item.serialNo,
          timeMinutes: item.timeMinutes,
          quantity: this.formatQuantity(item.quantity),
          unitPrice: item.unitPrice === null ? null : this.formatMoney(item.unitPrice),
          discountValue: this.formatMoney(item.discountValue),
          deliveryType: item.deliveryType,
          operationalPriority: item.operationalPriority,
          status: ServiceOrderItemStatus.OPEN,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          createdBy: dto.actorUserId,
          updatedBy: dto.actorUserId,
        });
        await manager.save(ServiceOrderItemEntity, serviceOrderItem);
        persistedItems.push(serviceOrderItem);
      }

      return { persistedOrder, persistedItems };
    });

    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: dto.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'service_order',
      entityId: saved.persistedOrder.id,
      action: 'service_order.created',
      eventType: 'service_order.write',
      metadata: {
        orderNo: saved.persistedOrder.orderNo,
        customerId: dto.customerId,
        itemCount: saved.persistedItems.length,
        deliveryType: saved.persistedOrder.deliveryType,
      },
    });

    await Promise.all(
      saved.persistedItems.map((item) =>
        this.auditService.record({
          tenantId: dto.tenantId,
          branchId: dto.branchId,
          actorUserId: dto.actorUserId,
          entityType: 'service_order',
          entityId: saved.persistedOrder.id,
          action: 'service_order.item.created',
          eventType: 'service_order.write',
          metadata: {
            serviceOrderId: saved.persistedOrder.id,
            itemId: item.id,
            itemNo: item.itemNo,
            description: item.description,
          },
        }),
      ),
    );

    return { serviceOrder: saved.persistedOrder, items: saved.persistedItems };
  }

  async search(tenantId: string, filters: ServiceOrderSearchFilters): Promise<ServiceOrderEntity[]> {
    await this.tenantService.getById(tenantId);
    if (filters.branchId) {
      const branch = await this.branchService.getById(filters.branchId);
      if (branch.tenantId !== tenantId) {
        throw new DomainValidationError('A filial precisa pertencer à mesma conta.');
      }
    }
    if (filters.customerId) {
      await this.customerService.getById(filters.customerId, tenantId);
    }

    const orders = await this.serviceOrderRepository.search(tenantId, filters);
    const ids = orders.map((order) => order.id);
    const [approvalPhotoIds, pickupPhotoIds] = await Promise.all([
      this.approvalRepository?.findIdsWithPhoto?.(ids) ?? [],
      this.pickupRepository?.findIdsWithPhoto?.(ids) ?? [],
    ]);
    const withPhoto = new Set([...approvalPhotoIds, ...pickupPhotoIds]);
    const groupIds = [...new Set(orders.map((order) => order.groupId ?? order.id))];
    const siblings =
      typeof this.serviceOrderRepository.findByGroupIds === 'function'
        ? await this.serviceOrderRepository.findByGroupIds(tenantId, groupIds)
        : typeof this.serviceOrderRepository.findByGroupId === 'function'
          ? (await Promise.all(groupIds.map((groupId) => this.serviceOrderRepository.findByGroupId(tenantId, groupId)))).flat()
          : orders;
    const membersByGroup = new Map<string, ServiceOrderEntity[]>();
    for (const member of siblings.length > 0 ? siblings : orders) {
      const groupId = member.groupId ?? member.id;
      const current = membersByGroup.get(groupId) ?? [];
      current.push(member);
      membersByGroup.set(groupId, current);
    }
    const memberIds = [...new Set((siblings.length > 0 ? siblings : orders).map((order) => order.id))];
    const [paidById, heldById, reworkWaitingIds] = await Promise.all([
      this.readPaidByOrderIds(memberIds),
      this.readHeldByOrderIds(memberIds),
      this.reworkWaitingOrderIds(
        tenantId,
        orders.filter((order) => order.status === ServiceOrderStatus.QUALITY && order.bagClosed).map((order) => order.id),
      ),
    ]);
    return orders.map((order) => {
      const members = membersByGroup.get(order.groupId ?? order.id) ?? [order];
      const finance = isCounterFinancialChild(order)
        ? { amountPaid: '0.00', outstandingBalance: '0.00', paymentStatus: 'paid' as const }
        : osGroupPaymentFromMembers(members, paidById, heldById);
      return Object.assign(order, {
        hasAttachments: withPhoto.has(order.id),
        payLockedOnParent: osPayLockedOnParent(order),
        reworkOnBelt: reworkWaitingIds.has(order.id),
        ...finance,
      });
    });
  }

  async listGroupMembers(tenantId: string, serviceOrderId: string): Promise<ServiceOrderEntity[]> {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    const groupId = serviceOrder.groupId ?? serviceOrder.id;
    const siblings = await this.serviceOrderRepository.findByGroupId?.(tenantId, groupId);
    return siblings && siblings.length > 0 ? siblings : [serviceOrder];
  }

  async getById(id: string, tenantId: string): Promise<ServiceOrderEntity> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder || serviceOrder.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Service Order '${id}' was not found.`);
    }

    return serviceOrder;
  }

  async getPrintView(tenantId: string, serviceOrderId: string) {
    const details = await this.getDetails(tenantId, serviceOrderId);
    const items = details.items
      .filter((item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted)
      .map((item) => {
        const quantity = Number(item.quantity);
        const unitPrice = item.unitPrice === null ? null : Number(item.unitPrice);
        const discountValue = Number(item.discountValue ?? 0);
        const subtotal = unitPrice === null ? null : Math.max(quantity * unitPrice - discountValue, 0);
        return {
          id: item.id,
          itemNo: item.itemNo,
          productName: item.itemType,
          serviceName: item.description,
          complement: item.complement,
          brand: item.brand,
          model: item.model,
          serialNo: item.serialNo,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountValue: item.discountValue,
          subtotal: subtotal === null ? null : this.formatMoney(subtotal),
        };
      });

    return {
      documentType: 'service_order' as const,
      serviceOrderId: details.serviceOrder.id,
      orderNo: details.serviceOrder.orderNo,
      status: details.serviceOrder.status,
      returnKind: details.serviceOrder.returnKind,
      openedAt: details.serviceOrder.openedAt,
      promisedDeliveryDate: details.serviceOrder.promisedDeliveryDate,
      promisedDeliveryTime: details.serviceOrder.promisedDeliveryTime,
      deliveryType: details.serviceOrder.deliveryType,
      customer: {
        id: details.customer.id,
        legalName: details.customer.legalName,
        phone: details.customer.phone,
        email: details.customer.email,
      },
      items,
      totalValue: details.serviceOrder.totalValue,
      customerNotes: details.serviceOrder.customerNotes,
      approvedAt: details.approval?.confirmedAt ?? null,
      approvalMethod: details.approval?.method ?? null,
    };
  }

  async getDetails(tenantId: string, serviceOrderId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    const [items, customer, commercialResponsible, technicalResponsible, auditTrail, proofNoteRows] = await Promise.all([
      this.serviceOrderItemRepository.findByServiceOrder(serviceOrderId),
      this.customerService.getById(serviceOrder.customerId, tenantId),
      this.identityService.getById(serviceOrder.commercialResponsibleActorId),
      this.identityService.getById(serviceOrder.technicalMeasurementResponsibleActorId),
      this.auditService.listByEntity(tenantId, 'service_order', serviceOrderId, 200),
      this.listProofNotes(serviceOrderId),
    ]);

    const groupId = serviceOrder.groupId ?? serviceOrder.id;
    const [groupVersions, origin, linkedReturns, tenant] = await Promise.all([
      this.serviceOrderRepository.findByGroupId(tenantId, groupId),
      serviceOrder.originServiceOrderId
        ? this.serviceOrderRepository.findById(serviceOrder.originServiceOrderId)
        : Promise.resolve(null),
      this.serviceOrderRepository.findByOriginServiceOrderId(tenantId, serviceOrder.id),
      this.tenantService.getById(tenantId),
    ]);
    const adjustmentPeriodDays = tenant.warrantyAdjustmentPeriodDays ?? 7;
    const executionPeriodDays = tenant.warrantyExecutionPeriodDays ?? 90;
    const floorFinishNames = await this.floorFinishNames(tenantId, serviceOrder.id, serviceOrder.groupId);
    const deliveryReleasedByName = serviceOrder.deliveryReleasedBy
      ? await this.actorDisplayName(serviceOrder.deliveryReleasedBy)
      : null;
    const clientReturnPreview =
      serviceOrder.status === ServiceOrderStatus.PICKED_UP && serviceOrder.actualPickupDate
        ? buildClientReturnPreview(serviceOrder.actualPickupDate, adjustmentPeriodDays, executionPeriodDays)
        : null;
    const payLockedOnParent = osPayLockedOnParent(serviceOrder);

    return {
      serviceOrder: Object.assign(serviceOrder, { payLockedOnParent }),
      items,
      customer,
      commercialResponsible,
      technicalMeasurementResponsible: technicalResponsible,
      productionTechnician: null,
      qualityReviewer: null,
      history: auditTrail,
      timeline: [...auditTrail].reverse(),
      groupVersions: groupVersions.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        versionSuffix: order.versionSuffix,
        returnKind: order.returnKind,
        status: order.status,
      })),
      payLockedOnParent,
      origin:
        origin && origin.tenantId === tenantId && !origin.isDeleted
          ? {
              id: origin.id,
              orderNo: origin.orderNo,
              status: origin.status,
              actualPickupDate: origin.actualPickupDate,
            }
          : null,
      linkedReturns: linkedReturns.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        returnKind: order.returnKind,
        status: order.status,
      })),
      clientReturnPreview,
      floorFinishNames,
      deliveryRelease: serviceOrder.deliveryReleasedAt
        ? {
            releasedAt: serviceOrder.deliveryReleasedAt,
            reason: serviceOrder.deliveryReleaseReason,
            releasedByName: deliveryReleasedByName,
          }
        : null,
      proofNotes: await this.buildProofNoteHistory(proofNoteRows, items),
      pickup: await this.buildPickupSummary(serviceOrder, customer.phone ?? null),
      approval: await this.buildApprovalSummary(serviceOrder),
      maxPiecesPerBag: tenant.maxPiecesPerBag ?? DEFAULT_MAX_PIECES_PER_BAG,
    };
  }

  async getPublicTrackingView(publicToken: string) {
    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
      const serviceOrder = await this.loadPublicServiceOrder(publicToken);
      const [items, customer, tenant] = await Promise.all([
        this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.id),
        this.customerService.getById(serviceOrder.customerId, serviceOrder.tenantId),
        this.tenantService.getById(serviceOrder.tenantId),
      ]);
      const pickup = await this.buildPickupSummary(serviceOrder, customer.phone ?? null);
      const signature = await this.findLatestApprovalSignature(serviceOrder.id);
      const agreed = Boolean(signature && isCustomerSignatureMethod(signature.method));
      const brand = await this.readPublicBrand(serviceOrder);
      return {
        orderNo: serviceOrder.orderNo,
        companyName: tenant.displayName || tenant.legalName,
        customerFirstName: publicCustomerFirstName(customer.legalName),
        customerName: customer.legalName,
        status: serviceOrder.status,
        statusLabel: publicOsStatusLabel(serviceOrder.status),
        openedAt: serviceOrder.openedAt,
        promisedDeliveryDate: serviceOrder.promisedDeliveryDate,
        promisedDeliveryTime: serviceOrder.promisedDeliveryTime ?? null,
        deliveryType: serviceOrder.deliveryType,
        items: this.mapPublicPrintItems(items),
        totalValue: serviceOrder.totalValue,
        customerNotes: serviceOrder.customerNotes,
        recebiReady: Boolean(pickup?.recebiReady),
        pickedUp: serviceOrder.status === ServiceOrderStatus.PICKED_UP,
        pickupMethod: pickup?.method ?? null,
        paymentLabel: await this.readPublicPaymentLabel(serviceOrder),
        agreed,
        agreedAt: agreed ? signature?.confirmedAt ?? null : null,
        termsText: LINK_ACCEPTANCE_TEXT,
        privacyNotice: PUBLIC_PRIVACY_NOTICE,
        logo: brand.logo,
        attendantName: brand.attendantName,
        attendantPortrait: brand.attendantPortrait,
      };
    });
  }

  async confirmPublicConcordo(
    publicToken: string,
    evidence?: { userAgent?: string | null; ip?: string | null },
  ) {
    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
      const serviceOrder = await this.loadPublicServiceOrder(publicToken);
      await this.completeApproval(serviceOrder.tenantId, serviceOrder.id, serviceOrder.commercialResponsibleActorId, {
        method: 'link',
        userAgent: evidence?.userAgent,
        ip: evidence?.ip,
      });
      return this.getPublicTrackingView(publicToken);
    });
  }

  async confirmPublicRecebi(
    publicToken: string,
    evidence?: { userAgent?: string | null; ip?: string | null },
  ) {
    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
      const serviceOrder = await this.loadPublicServiceOrder(publicToken);
      await this.confirmPickupFromLink(serviceOrder.tenantId, serviceOrder.id, evidence);
      return this.getPublicTrackingView(publicToken);
    });
  }

  private async readPublicBrand(serviceOrder: { branchId?: string | null; tenantId: string; commercialResponsibleActorId?: string | null }) {
    let logo: { mimeType: string; contentBase64: string } | null = null;
    let attendantName: string | null = null;
    let attendantPortrait: { mimeType: string; contentBase64: string } | null = null;
    if (serviceOrder.branchId && this.branchService?.getById && this.companyService?.getById) {
      try {
        const branch = await this.branchService.getById(serviceOrder.branchId);
        if (branch?.companyId) {
          const company = await this.companyService.getById(branch.companyId, serviceOrder.tenantId);
          if (company.logoBase64 && company.logoMimeType) {
            logo = { mimeType: company.logoMimeType, contentBase64: company.logoBase64 };
          }
        }
      } catch {
        logo = null;
      }
    }
    if (serviceOrder.commercialResponsibleActorId && this.identityService?.getById) {
      try {
        const attendant = await this.identityService.getById(serviceOrder.commercialResponsibleActorId);
        attendantName = attendant.displayName?.trim() || null;
        if (attendant.portraitBase64 && attendant.portraitMimeType) {
          attendantPortrait = { mimeType: attendant.portraitMimeType, contentBase64: attendant.portraitBase64 };
        }
      } catch {
        attendantName = null;
        attendantPortrait = null;
      }
    }
    return { logo, attendantName, attendantPortrait };
  }

  private async loadPublicServiceOrder(publicToken: string) {
    const token = publicToken?.trim() ?? '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      throw new EntityNotFoundError('Este link não foi encontrado.');
    }
    const serviceOrder = await this.serviceOrderRepository.findByPublicToken(token);
    if (!serviceOrder) {
      throw new EntityNotFoundError('Este link não foi encontrado.');
    }
    return serviceOrder;
  }

  private mapPublicPrintItems(items: ServiceOrderItemEntity[]) {
    return items
      .filter((item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted)
      .map((item) => {
        const parsedQuantity = Number(item.quantity);
        const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
        const unitPrice = item.unitPrice === null || item.unitPrice === undefined ? null : Number(item.unitPrice);
        const discountValue = Number(item.discountValue ?? 0);
        const subtotal = unitPrice === null || !Number.isFinite(unitPrice) ? null : Math.max(quantity * unitPrice - discountValue, 0);
        return {
          itemNo: item.itemNo,
          itemType: item.itemType,
          description: item.description,
          complement: item.complement ?? null,
          quantity: item.quantity ?? this.formatQuantity(quantity),
          unitPrice: item.unitPrice ?? null,
          discountValue: item.discountValue ?? null,
          subtotal: subtotal === null ? null : this.formatMoney(subtotal),
        };
      });
  }

  async latestProofNotesByItem(serviceOrderId: string): Promise<Map<string, string>> {
    return latestProofNoteByItem(await this.listProofNotes(serviceOrderId));
  }

  async getBagSettings(tenantId: string) {
    const tenant = await this.tenantService.getById(tenantId);
    return { maxPiecesPerBag: tenant.maxPiecesPerBag ?? DEFAULT_MAX_PIECES_PER_BAG };
  }

  async previewNextOrderNo(tenantId: string) {
    await this.tenantService.getById(tenantId);
    const groupSeq = await this.serviceOrderRepository.nextGroupSeq(tenantId);
    return { orderNo: formatServiceOrderNo(groupSeq) };
  }

  async spawnNextVersion(tenantId: string, sourceServiceOrderId: string, actorUserId: string) {
    const source = await this.getById(sourceServiceOrderId, tenantId);
    if (!source.bagClosed) {
      throw new DomainValidationError('Feche a sacola antes de abrir a próxima versão.');
    }
    const groupId = source.groupId ?? source.id;
    const siblings = await this.serviceOrderRepository.findByGroupId(tenantId, groupId);
    const members = siblings.length > 0 ? siblings : [source];
    const root = members.find((order) => !order.versionSuffix) ?? source;
    const groupSeq = source.groupSeq ?? root.groupSeq ?? (await this.serviceOrderRepository.nextGroupSeq(tenantId));
    const versionSuffix = nextBagVersionSuffix(members.map((order) => order.versionSuffix));
    const orderNo = withVersionSuffix(root.orderNo, versionSuffix);

    const nextId = randomUUID();
    const nextOrder = this.serviceOrderRepository.create({
      id: nextId,
      tenantId: source.tenantId,
      branchId: source.branchId,
      customerId: source.customerId,
      workflowDefinitionId: source.workflowDefinitionId,
      currentStatusDefinitionId: null,
      orderNo,
      groupId,
      groupSeq,
      versionSuffix,
      bagClosed: false,
      openedAt: new Date(),
      deliveryCommitmentSourceAt: source.deliveryCommitmentSourceAt,
      promisedDeliveryDate: source.promisedDeliveryDate,
      promisedDeliveryTime: source.promisedDeliveryTime,
      actualPickupDate: null,
      originServiceOrderId: source.originServiceOrderId ?? null,
      returnKind: source.returnKind ?? null,
      actualDeliveryDate: null,
      actualDeliveryTime: null,
      paymentTermsDays: source.paymentTermsDays,
      deliveryType: source.deliveryType,
      operationalPriority: source.operationalPriority,
      commercialResponsibleActorId: source.commercialResponsibleActorId,
      technicalMeasurementResponsibleActorId: source.technicalMeasurementResponsibleActorId,
      deliverySurchargeMethod: source.deliverySurchargeMethod,
      deliverySurchargeValue: source.deliverySurchargeValue,
      publicToken: randomUUID(),
      commercialNotes: source.commercialNotes,
      customerNotes: source.customerNotes,
      status: ServiceOrderStatus.OPEN,
      totalValue: null,
      discountValue: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });

    const saved = await this.serviceOrderRepository.save(nextOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.version.spawned',
      eventType: 'service_order.write',
      metadata: { sourceServiceOrderId, orderNo: saved.orderNo, versionSuffix },
    });

    return this.getDetails(tenantId, saved.id);
  }

  async closeBag(tenantId: string, serviceOrderId: string, actorUserId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Ordens de serviço canceladas não podem fechar sacola.');
    }
    if (serviceOrder.bagClosed) {
      throw new DomainValidationError('Esta sacola já está fechada. Use Abrir sacola se precisar corrigir.');
    }

    const items = (await this.serviceOrderItemRepository.findByServiceOrder(serviceOrderId)).filter(
      (item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted,
    );
    if (items.length === 0) {
      throw new DomainValidationError('Inclua pelo menos uma peça antes de fechar a sacola.');
    }

    serviceOrder.bagClosed = true;
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.bag.closed',
      eventType: 'service_order.write',
      metadata: { orderNo: saved.orderNo, itemCount: items.length },
    });
    await this.enqueueWhatsapp(tenantId, saved.id, WHATSAPP_OS_OPENED, actorUserId);

    return this.getDetails(tenantId, saved.id);
  }

  async reopenBag(tenantId: string, serviceOrderId: string, actorUserId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Ordens de serviço canceladas não podem reabrir sacola.');
    }
    if (!serviceOrder.bagClosed) {
      throw new DomainValidationError('Esta sacola já está aberta.');
    }
    if (!canReopenBagAfterFloor(serviceOrder.status)) {
      throw new DomainValidationError('Não é possível abrir a sacola depois que a produção começou.');
    }

    serviceOrder.bagClosed = false;
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.bag.reopened',
      eventType: 'service_order.write',
      metadata: { orderNo: saved.orderNo },
    });

    return this.getDetails(tenantId, saved.id);
  }

  async previewDelivery(
    tenantId: string,
    input: { branchId: string; deliveryType?: DeliveryType; itemCount?: number; sourceAt?: string },
  ) {
    await this.tenantService.getById(tenantId);
    const branch = await this.branchService.getById(input.branchId);
    if (branch.tenantId !== tenantId) {
      throw new DomainValidationError('A filial precisa pertencer à mesma conta.');
    }
    return this.deliveryDateService.suggestDelivery(
      tenantId,
      input.branchId,
      input.sourceAt ? new Date(input.sourceAt) : new Date(),
      { deliveryType: input.deliveryType, itemCount: input.itemCount },
    );
  }

  async update(serviceOrderId: string, tenantId: string, dto: UpdateServiceOrderDto): Promise<ServiceOrderEntity> {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);

    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Ordens de serviço canceladas não podem ser alteradas.');
    }
    this.assertHeaderWritableWhenBagClosed(serviceOrder, dto);

    if (dto.customerId) {
      const customer = await this.customerService.getById(dto.customerId, tenantId);
      this.assertCustomerBranchCompatibility(customer.branchId, serviceOrder.branchId);
      serviceOrder.customerId = dto.customerId;
    }

    if (dto.commercialResponsibleActorId) {
      await this.assertResponsibleActor(tenantId, dto.commercialResponsibleActorId, 'Commercial Responsible');
      serviceOrder.commercialResponsibleActorId = dto.commercialResponsibleActorId;
    }

    if (dto.technicalMeasurementResponsibleActorId) {
      await this.assertResponsibleActor(
        tenantId,
        dto.technicalMeasurementResponsibleActorId,
        'Technical Measurement Responsible',
      );
      serviceOrder.technicalMeasurementResponsibleActorId = dto.technicalMeasurementResponsibleActorId;
    }

    const shouldRecalculate =
      dto.promisedDeliveryDate === undefined &&
      (dto.deliveryCommitmentSourceAt !== undefined || dto.deliveryType !== undefined);
    if (dto.deliveryCommitmentSourceAt !== undefined) {
      serviceOrder.deliveryCommitmentSourceAt = new Date(dto.deliveryCommitmentSourceAt);
    }
    if (dto.actualPickupDate !== undefined) {
      serviceOrder.actualPickupDate = dto.actualPickupDate;
    }
    if (dto.actualDeliveryDate !== undefined) {
      serviceOrder.actualDeliveryDate = dto.actualDeliveryDate;
    }
    if (dto.actualDeliveryTime !== undefined) {
      serviceOrder.actualDeliveryTime = normalizeClockTime(dto.actualDeliveryTime);
    }
    if (dto.paymentTermsDays !== undefined) {
      serviceOrder.paymentTermsDays = dto.paymentTermsDays;
    }
    if (dto.deliveryType !== undefined) {
      serviceOrder.deliveryType = dto.deliveryType;
    }
    if (dto.operationalPriority !== undefined) {
      serviceOrder.operationalPriority = dto.operationalPriority?.trim() || null;
    }
    if (dto.deliverySurchargeMethod !== undefined) {
      serviceOrder.deliverySurchargeMethod = dto.deliverySurchargeMethod;
    }
    if (dto.deliverySurchargeValue !== undefined) {
      serviceOrder.deliverySurchargeValue = dto.deliverySurchargeValue === null ? null : this.formatMoney(dto.deliverySurchargeValue);
    }
    if (dto.discountValue !== undefined) {
      serviceOrder.discountValue = dto.discountValue === null ? null : this.formatMoney(dto.discountValue);
    }
    if (dto.commercialNotes !== undefined) {
      serviceOrder.commercialNotes = dto.commercialNotes?.trim() || null;
    }
    if (dto.customerNotes !== undefined) {
      serviceOrder.customerNotes = dto.customerNotes?.trim() || null;
    }

    if (dto.promisedDeliveryDate !== undefined) {
      serviceOrder.promisedDeliveryDate = dto.promisedDeliveryDate;
    }
    if (dto.promisedDeliveryTime !== undefined) {
      serviceOrder.promisedDeliveryTime = normalizeClockTime(dto.promisedDeliveryTime);
    }
    if (dto.difficultyGrade !== undefined) {
      serviceOrder.difficultyGrade = this.optionalDifficulty(dto.difficultyGrade);
    }
    if (shouldRecalculate) {
      const suggestedDelivery = await this.deliveryDateService.suggestDelivery(
        tenantId,
        serviceOrder.branchId,
        serviceOrder.deliveryCommitmentSourceAt,
        { deliveryType: serviceOrder.deliveryType },
      );
      serviceOrder.promisedDeliveryDate = suggestedDelivery.promisedDeliveryDate;
      serviceOrder.promisedDeliveryTime = normalizeClockTime(suggestedDelivery.promisedDeliveryTime);
    }

    const items = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrderId);
    serviceOrder.totalValue = this.calculateOrderTotal(
      items.map((item) => this.normalizePersistedItem(item)),
      Number(serviceOrder.discountValue ?? 0),
      serviceOrder.deliverySurchargeMethod,
      Number(serviceOrder.deliverySurchargeValue ?? 0),
    );
    serviceOrder.updatedBy = dto.actorUserId;

    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.updated',
      eventType: 'service_order.write',
      metadata: {
        deliveryType: saved.deliveryType,
        promisedDeliveryDate: saved.promisedDeliveryDate,
        actualPickupDate: saved.actualPickupDate,
        actualDeliveryDate: saved.actualDeliveryDate,
        paymentTermsDays: saved.paymentTermsDays,
      },
    });

    return saved;
  }

  async addItem(dto: CreateServiceOrderItemDto): Promise<ServiceOrderItemEntity> {
    const serviceOrder = await this.getById(dto.serviceOrderId, dto.tenantId);
    if (serviceOrder.branchId !== dto.branchId) {
      throw new DomainValidationError('A peça precisa estar na mesma filial da ordem de serviço.');
    }
    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Ordens de serviço canceladas não podem receber novas peças.');
    }
    this.assertBagOpen(serviceOrder);

    const openItems = (await this.serviceOrderItemRepository.findByServiceOrder(dto.serviceOrderId)).filter(
      (existing) => existing.status !== ServiceOrderItemStatus.CANCELLED && !existing.isDeleted,
    );
    const tenant = await this.tenantService.getById(dto.tenantId);
    this.assertItemCount(openItems.length + 1, tenant.maxPiecesPerBag ?? DEFAULT_MAX_PIECES_PER_BAG);

    const item = await this.resolveCatalogFields(dto.tenantId, dto.actorUserId, this.normalizeItemInput(dto), true);
    let savedItem: ServiceOrderItemEntity | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        savedItem = await this.dataSource.transaction(async (manager) => {
          await manager
            .createQueryBuilder(ServiceOrderEntity, 'serviceOrder')
            .setLock('pessimistic_write')
            .where('serviceOrder.id = :serviceOrderId', { serviceOrderId: dto.serviceOrderId })
            .getOneOrFail();

          const result = await manager
            .createQueryBuilder(ServiceOrderItemEntity, 'item')
            .select('COALESCE(MAX(item.item_no), 0)', 'maxItemNo')
            .where('item.service_order_id = :serviceOrderId', { serviceOrderId: dto.serviceOrderId })
            .getRawOne<{ maxItemNo: string }>();
          const nextItemNo = Number(result?.maxItemNo ?? 0) + 1;

          const serviceOrderItem = manager.create(ServiceOrderItemEntity, {
            id: randomUUID(),
            tenantId: dto.tenantId,
            branchId: dto.branchId,
            serviceOrderId: dto.serviceOrderId,
            itemNo: nextItemNo,
            itemType: item.itemType,
            productId: item.productId,
            serviceId: item.serviceId,
            description: item.description,
            complement: item.complement,
            brand: item.brand,
            model: item.model,
            serialNo: item.serialNo,
            timeMinutes: item.timeMinutes,
            quantity: this.formatQuantity(item.quantity),
            unitPrice: item.unitPrice === null ? null : this.formatMoney(item.unitPrice),
            discountValue: this.formatMoney(item.discountValue),
            deliveryType: item.deliveryType,
            operationalPriority: item.operationalPriority,
            status: ServiceOrderItemStatus.OPEN,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            createdBy: dto.actorUserId,
            updatedBy: dto.actorUserId,
          });
          return manager.save(ServiceOrderItemEntity, serviceOrderItem);
        });
        break;
      } catch (error: any) {
        if (attempt < 2 && error instanceof QueryFailedError && error.driverError?.constraint === 'uq_service_order_items_order_item_no') {
          continue;
        }
        throw error;
      }
    }
    if (!savedItem) {
      throw new DomainValidationError('Não foi possível numerar a peça desta ordem.');
    }

    await this.recalculateTotal(serviceOrder, dto.actorUserId);
    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: dto.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'service_order',
      entityId: dto.serviceOrderId,
      action: 'service_order.item.created',
      eventType: 'service_order.write',
      metadata: {
        serviceOrderId: dto.serviceOrderId,
        itemId: savedItem.id,
        itemNo: savedItem.itemNo,
      },
    });

    return savedItem;
  }

  async updateItem(
    serviceOrderId: string,
    itemId: string,
    tenantId: string,
    dto: UpdateServiceOrderItemDto,
  ): Promise<ServiceOrderItemEntity> {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    const item = await this.serviceOrderItemRepository.findById(itemId);
    if (!item || item.serviceOrderId !== serviceOrderId || item.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Service Order Item '${itemId}' was not found.`);
    }
    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Ordens de serviço canceladas não podem ser alteradas.');
    }
    this.assertBagOpen(serviceOrder);

    const catalog = await this.resolveCatalogFields(tenantId, dto.actorUserId, {
      itemType: dto.itemType?.trim() || item.itemType,
      description: dto.description?.trim() || item.description,
      quantity: 1,
      unitPrice: dto.unitPrice === undefined ? (item.unitPrice === null ? null : Number(item.unitPrice)) : dto.unitPrice,
      discountValue: dto.discountValue === undefined ? Number(item.discountValue ?? 0) : dto.discountValue ?? 0,
      deliveryType: dto.deliveryType === undefined ? item.deliveryType : dto.deliveryType,
      operationalPriority:
        dto.operationalPriority === undefined ? item.operationalPriority : dto.operationalPriority?.trim() || null,
      productId: dto.productId === undefined ? item.productId : dto.productId,
      serviceId: dto.serviceId === undefined ? item.serviceId : dto.serviceId,
      complement: dto.complement === undefined ? item.complement : dto.complement?.trim() || null,
      brand: (dto.brand === undefined ? item.brand : dto.brand).trim(),
      model: (dto.model === undefined ? item.model : dto.model).trim(),
      serialNo: (dto.serialNo === undefined ? item.serialNo : dto.serialNo).trim(),
      timeMinutes: dto.timeMinutes === undefined ? item.timeMinutes : dto.timeMinutes,
    });
    item.itemType = catalog.itemType;
    item.productId = catalog.productId;
    item.serviceId = catalog.serviceId;
    item.description = catalog.description;
    item.complement = catalog.complement;
    item.brand = catalog.brand;
    item.model = catalog.model;
    item.serialNo = catalog.serialNo;
    item.timeMinutes = catalog.timeMinutes;
    item.quantity = this.formatQuantity(catalog.quantity);
    item.unitPrice = catalog.unitPrice === null ? null : this.formatMoney(catalog.unitPrice);
    item.discountValue =
      dto.discountValue === undefined ? item.discountValue : dto.discountValue === null ? null : this.formatMoney(dto.discountValue);
    item.deliveryType = dto.deliveryType === undefined ? item.deliveryType : dto.deliveryType;
    item.operationalPriority = dto.operationalPriority === undefined ? item.operationalPriority : dto.operationalPriority?.trim() || null;
    item.status = dto.status ?? item.status;
    item.updatedBy = dto.actorUserId;

    const saved = await this.serviceOrderItemRepository.save(item);
    await this.recalculateTotal(serviceOrder, dto.actorUserId);
    await this.auditService.record({
      tenantId,
      branchId: serviceOrder.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'service_order',
      entityId: serviceOrderId,
      action: 'service_order.item.updated',
      eventType: 'service_order.write',
      metadata: {
        serviceOrderId,
        itemId,
        status: saved.status,
      },
    });

    return saved;
  }

  async approve(serviceOrderId: string, tenantId: string, actorUserId: string) {
    return this.completeApproval(tenantId, serviceOrderId, actorUserId, { method: 'counter' });
  }

  async completeApproval(
    tenantId: string,
    serviceOrderId: string,
    actorUserId: string,
    input: {
      method: ApprovalMethod;
      photo?: { mimeType?: string | null; contentBase64?: string | null; fileName?: string | null } | null;
      releaseReason?: string | null;
      userAgent?: string | null;
      ip?: string | null;
    },
  ) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (!canRecordApproval(serviceOrder.status)) {
      throw new DomainValidationError('Esta OS não aceita aprovação.');
    }
    if (!this.approvalRepository) {
      throw new DomainValidationError('O registro de aprovação ainda não está disponível.');
    }

    const latestSignature = await this.findLatestApprovalSignature(serviceOrder.id);
    if (latestSignature && isCustomerSignatureMethod(input.method)) {
      throw new DomainValidationError('Esta OS já foi assinada.');
    }
    if (latestSignature && input.method === 'release') {
      throw new DomainValidationError('Esta OS já foi assinada. Não é preciso liberar a produção.');
    }
    const latest = await this.findLatestApproval(serviceOrder.id);
    if (latest?.method === 'release' && input.method === 'release') {
      throw new DomainValidationError('A produção já foi liberada sem assinatura.');
    }

    const photo = normalizeApprovalPhoto(input.photo);
    if (input.method === 'paper' && !photo) {
      throw new DomainValidationError('Anexe a foto da OS assinada para registrar no papel.');
    }
    const releaseReason = input.method === 'release' ? normalizeReleaseReason(input.releaseReason) : null;
    const items = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrderId);
    const previousLock = latest?.measurementsSnapshot ?? latestSignature?.measurementsSnapshot ?? null;
    const previousLockedAt = latest?.measurementsLockedAt ?? latestSignature?.measurementsLockedAt ?? null;
    let measurementsSnapshot = previousLock;
    if (!measurementsSnapshot && this.measurementService?.listByCustomer) {
      const measurements = await this.measurementService.listByCustomer(tenantId, serviceOrder.customerId);
      measurementsSnapshot = buildApprovalMeasurementsSnapshot(measurements.latestByLabel);
    }
    const now = new Date();
    const savedApproval = await this.approvalRepository.save(
      this.approvalRepository.create({
        id: randomUUID(),
        tenantId: serviceOrder.tenantId,
        branchId: serviceOrder.branchId,
        serviceOrderId: serviceOrder.id,
        method: input.method,
        confirmedAt: now,
        acceptedText:
          input.method === 'release'
            ? APPROVAL_RELEASE_TEXT
            : input.method === 'link'
              ? LINK_ACCEPTANCE_TEXT
              : APPROVAL_ACCEPTED_TEXT,
        releaseReason,
        totalValueSnapshot: serviceOrder.totalValue,
        discountValueSnapshot: serviceOrder.discountValue,
        servicesSnapshot: buildApprovalServicesSnapshot(items),
        measurementsSnapshot,
        measurementsLockedAt: previousLockedAt ?? now,
        clientUserAgent: input.userAgent ?? null,
        clientIp: input.ip ?? null,
        photoFileName: photo?.fileName ?? null,
        photoMimeType: photo?.mimeType ?? null,
        photoBase64: photo?.contentBase64 ?? null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      }),
    );

    await this.auditService.record({
      tenantId,
      branchId: serviceOrder.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: serviceOrder.id,
      action:
        input.method === 'release' ? 'service_order.approval.released' : 'service_order.approval.recorded',
      eventType: 'service_order.workflow',
      metadata: {
        orderNo: serviceOrder.orderNo,
        method: savedApproval.method,
        status: serviceOrder.status,
        measurementsLocked: Boolean(savedApproval.measurementsLockedAt),
        photo: Boolean(photo),
      },
    });
    return this.getDetails(tenantId, serviceOrder.id);
  }

  async getApprovalPhoto(tenantId: string, serviceOrderId: string) {
    await this.getById(serviceOrderId, tenantId);
    const approval = await this.findLatestApproval(serviceOrderId);
    if (!approval?.photoBase64 || !approval.photoMimeType) {
      return null;
    }
    return {
      fileName: approval.photoFileName,
      mimeType: approval.photoMimeType,
      contentBase64: approval.photoBase64,
    };
  }

  async advanceFloor(tenantId: string, serviceOrderId: string, actorUserId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    const action = nextFloorAction(serviceOrder.status, serviceOrder.bagClosed);
    if (!action) {
      throw new DomainValidationError('Não há próximo passo de produção para esta OS.');
    }
    if (isItemFinishAction(action)) {
      throw new DomainValidationError('Termine cada item. A OP vai para Aguardando qualidade quando o último item terminar.');
    }
    if (action === 'pick_up_rework' && !(await this.isReworkWaitingOnBelt(tenantId, serviceOrder.id))) {
      throw new DomainValidationError('Esta OP ainda está no controle de qualidade.');
    }
    if (action === 'pick_up' || action === 'pick_up_rework') {
      const busy = await this.serviceOrderRepository.findActiveFloorBags(
        tenantId,
        serviceOrder.branchId,
        serviceOrder.id,
        actorUserId,
      );
      if (busy[0]) {
        throw new DomainValidationError(
          `Já existe uma sacola em produção (${busy[0].orderNo}). Termine ela antes de pegar outra.`,
        );
      }
      serviceOrder.floorHolderUserId = actorUserId;
    }
    if (action === 'finish_production' || action === 'finish_rework') {
      serviceOrder.floorHolderUserId = null;
    }

    serviceOrder.status = floorActionResultStatus(action);
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: floorActionAudit(action),
      eventType: 'service_order.workflow',
      metadata: { status: saved.status, floorAction: action },
    });
    await this.recordFloorDiary(saved, actorUserId, action);
    return this.getDetails(tenantId, saved.id);
  }

  async listFloorItems(tenantId: string, serviceOrderId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    this.assertFloorPassOpen(serviceOrder);
    const pass = await this.currentFloorPass(serviceOrder);
    const finished = await this.finishedFloorItemIds(serviceOrder, pass);
    return this.presentFloorItems(serviceOrder, pass.items, finished);
  }

  async finishFloorItem(tenantId: string, serviceOrderId: string, serviceOrderItemId: string, actorUserId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    this.assertFloorPassOpen(serviceOrder);
    if (serviceOrder.floorHolderUserId && serviceOrder.floorHolderUserId !== actorUserId) {
      throw new DomainValidationError('Esta OP já está com outro técnico.');
    }
    const pass = await this.currentFloorPass(serviceOrder);
    const item = pass.items.find((row) => row.id === serviceOrderItemId);
    if (!item) {
      throw new DomainValidationError('Este item não está nesta passada da OP.');
    }
    const finished = await this.finishedFloorItemIds(serviceOrder, pass);
    if (finished.has(item.id)) {
      const released = pass.items.every((row) => finished.has(row.id));
      if (released) {
        await this.closeFloorPass(serviceOrder, actorUserId, pass.finishAction);
        return {
          ...this.presentFloorItems(
            { ...serviceOrder, status: floorActionResultStatus(pass.finishAction) },
            pass.items,
            finished,
          ),
          released: true,
          minutes: 0,
        };
      }
      throw new DomainValidationError('Este item já foi terminado.');
    }
    const previous = await this.floorClockStart(serviceOrder, pass, finished);
    const finishedAt = new Date();
    const minutes = measuredExecutionMinutes(previous, finishedAt, Number(item.quantity));
    await this.recordFloorItemFinish(serviceOrder, actorUserId, item.id, pass.versionId, finishedAt);
    finished.add(item.id);
    if (item.productId && item.serviceId) {
      try {
        const price = await this.atelierCatalogService.findActiveProductService(tenantId, item.productId, item.serviceId);
        if (price) {
          await this.atelierCatalogService.updateProductService(price.id, {
            tenantId,
            estimatedMinutes: minutes,
            actorUserId,
          });
        }
      } catch {
        // O item já foi terminado. O cadastro do preço entra de novo na próxima execução.
      }
    }
    const released = pass.items.every((row) => finished.has(row.id));
    if (released) {
      await this.closeFloorPass(serviceOrder, actorUserId, pass.finishAction);
    }
    const view = this.presentFloorItems(
      released ? { ...serviceOrder, status: floorActionResultStatus(pass.finishAction) } : serviceOrder,
      pass.items,
      finished,
    );
    return { ...view, released, minutes };
  }

  private assertFloorPassOpen(serviceOrder: ServiceOrderEntity) {
    if (serviceOrder.status !== ServiceOrderStatus.IN_PRODUCTION && serviceOrder.status !== ServiceOrderStatus.IN_REWORK) {
      throw new DomainValidationError('Pegue a sacola antes de terminar os itens.');
    }
  }

  private presentFloorItems(
    serviceOrder: Pick<ServiceOrderEntity, 'id' | 'orderNo' | 'status'>,
    items: ServiceOrderItemEntity[],
    finished: Set<string>,
  ) {
    return {
      serviceOrderId: serviceOrder.id,
      orderNo: serviceOrder.orderNo,
      status: serviceOrder.status,
      items: items.map((item) => ({
        id: item.id,
        itemNo: item.itemNo,
        itemType: item.itemType,
        description: item.description,
        complement: item.complement,
        finished: finished.has(item.id),
      })),
    };
  }

  private async currentFloorPass(serviceOrder: ServiceOrderEntity): Promise<{
    versionId: string | null;
    pickAction: 'pick_up' | 'pick_up_rework';
    finishAction: 'finish_production' | 'finish_rework';
    items: ServiceOrderItemEntity[];
  }> {
    const items = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.id);
    if (items.length === 0) {
      throw new DomainValidationError('Esta OP não tem itens para terminar.');
    }
    if (serviceOrder.status !== ServiceOrderStatus.IN_REWORK) {
      return { versionId: null, pickAction: 'pick_up', finishAction: 'finish_production', items };
    }
    const target = await this.activeReworkTarget(serviceOrder.tenantId, serviceOrder.id);
    const selected = target.itemIds.length > 0 ? items.filter((item) => target.itemIds.includes(item.id)) : items;
    if (selected.length === 0) {
      throw new DomainValidationError('Esta OP não tem itens para terminar.');
    }
    return {
      versionId: target.versionId,
      pickAction: 'pick_up_rework',
      finishAction: 'finish_rework',
      items: selected,
    };
  }

  private async activeReworkTarget(tenantId: string, serviceOrderId: string): Promise<{ versionId: string | null; itemIds: string[] }> {
    if (typeof this.dataSource?.query !== 'function') {
      return { versionId: null, itemIds: [] };
    }
    const rows = (await this.dataSource.query(
      `SELECT v.id, v.affected_service_order_item_ids AS items
         FROM production_orders po
         JOIN production_order_versions v
           ON v.production_order_id = po.id
          AND v.is_active = true
          AND v.version_reason IN ('rework', 'warranty_execution', 'corrective_production')
        WHERE po.tenant_id = $1
          AND po.service_order_id = $2
          AND po.is_deleted = false
        ORDER BY v.version_no DESC
        LIMIT 1`,
      [tenantId, serviceOrderId],
    )) as Array<{ id?: string; items?: unknown }>;
    return { versionId: rows[0]?.id ?? null, itemIds: this.readItemIdList(rows[0]?.items) };
  }

  private readItemIdList(value: unknown): string[] {
    const parsed = typeof value === 'string' ? this.parseItemIdList(value) : value;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  }

  private parseItemIdList(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  private async floorClockStart(
    serviceOrder: ServiceOrderEntity,
    pass: { versionId: string | null; pickAction: string },
    finished: Set<string>,
  ): Promise<Date> {
    const picks = await this.floorDiaryMoments(serviceOrder, pass.pickAction, pass.versionId, null);
    const finishes = await this.floorDiaryMoments(serviceOrder, 'finish_item', pass.versionId, finished);
    const latestFinish = finishes.at(-1) ?? null;
    return latestFinish ?? picks.at(-1) ?? serviceOrder.updatedAt ?? new Date();
  }

  private async finishedFloorItemIds(
    serviceOrder: ServiceOrderEntity,
    pass: { versionId: string | null; pickAction: string },
  ): Promise<Set<string>> {
    const picks = await this.floorDiaryMoments(serviceOrder, pass.pickAction, pass.versionId, null);
    const anchor = picks.at(-1) ?? null;
    const rows = await this.floorDiaryRows(serviceOrder, 'finish_item', pass.versionId);
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row.itemId) continue;
      if (anchor && new Date(row.happenedAt).getTime() < anchor.getTime()) continue;
      ids.add(row.itemId);
    }
    return ids;
  }

  private async floorDiaryMoments(
    serviceOrder: ServiceOrderEntity,
    action: string,
    versionId: string | null,
    onlyItems: Set<string> | null,
  ): Promise<Date[]> {
    const rows = await this.floorDiaryRows(serviceOrder, action, versionId);
    return rows
      .filter((row) => !onlyItems || (row.itemId !== null && onlyItems.has(row.itemId)))
      .map((row) => new Date(row.happenedAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());
  }

  private async floorDiaryRows(
    serviceOrder: ServiceOrderEntity,
    action: string,
    versionId: string | null,
  ): Promise<Array<{ itemId: string | null; happenedAt: Date | string }>> {
    if (typeof this.dataSource?.query !== 'function') {
      return [];
    }
    return (await this.dataSource.query(
      `SELECT service_order_item_id AS "itemId", happened_at AS "happenedAt"
         FROM floor_diary_entries
        WHERE tenant_id = $1
          AND service_order_id = $2
          AND action = $3
          AND ($4::uuid IS NULL OR production_order_version_id = $4 OR production_order_version_id IS NULL)
        ORDER BY happened_at ASC`,
      [serviceOrder.tenantId, serviceOrder.id, action, versionId],
    )) as Array<{ itemId: string | null; happenedAt: Date | string }>;
  }

  private async recordFloorItemFinish(
    order: ServiceOrderEntity,
    actorUserId: string,
    serviceOrderItemId: string,
    versionId: string | null,
    happenedAt: Date,
  ) {
    if (typeof this.dataSource.query !== 'function') {
      return;
    }
    await this.dataSource.query(
      `INSERT INTO floor_diary_entries (
         id, tenant_id, branch_id, user_id, service_order_id, order_no, action, happened_at, production_order_version_id, service_order_item_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'finish_item', $7, $8, $9)`,
      [randomUUID(), order.tenantId, order.branchId, actorUserId, order.id, order.orderNo, happenedAt.toISOString(), versionId, serviceOrderItemId],
    );
  }

  private async closeFloorPass(
    serviceOrder: ServiceOrderEntity,
    actorUserId: string,
    action: 'finish_production' | 'finish_rework',
  ) {
    serviceOrder.floorHolderUserId = null;
    serviceOrder.status = floorActionResultStatus(action);
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId: saved.tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: floorActionAudit(action),
      eventType: 'service_order.workflow',
      metadata: { status: saved.status, floorAction: action },
    });
    await this.recordFloorDiary(saved, actorUserId, action);
    return saved;
  }

  async isReworkWaitingOnBelt(tenantId: string, serviceOrderId: string): Promise<boolean> {
    const waiting = await this.reworkWaitingOrderIds(tenantId, [serviceOrderId]);
    return waiting.has(serviceOrderId);
  }

  async passFinishNames(
    tenantId: string,
    serviceOrderId: string,
    pass: 'production' | 'rework',
    versionId: string | null,
  ): Promise<string | null> {
    if (typeof this.dataSource?.query !== 'function') {
      return null;
    }
    try {
      const rows = (await this.dataSource.query(
        `SELECT DISTINCT u.display_name AS name
           FROM floor_diary_entries d
           JOIN user_identities u ON u.id = d.user_id
          WHERE d.tenant_id = $1
            AND d.service_order_id = $2
            AND d.action = $3
            AND (
              $4::uuid IS NULL
              OR d.production_order_version_id = $4
              OR d.production_order_version_id IS NULL
            )
          ORDER BY u.display_name`,
        [tenantId, serviceOrderId, pass === 'rework' ? 'finish_rework' : 'finish_production', versionId],
      )) as Array<{ name?: string | null }>;
      const names = [...new Set(rows.map((row) => (row.name ?? '').trim()).filter(Boolean))];
      return names.length > 0 ? names.join(', ') : null;
    } catch {
      return null;
    }
  }

  private async reworkWaitingOrderIds(tenantId: string, orderIds: string[]): Promise<Set<string>> {
    const waiting = new Set<string>();
    if (orderIds.length === 0 || typeof this.dataSource?.query !== 'function') {
      return waiting;
    }
    try {
      const rows = (await this.dataSource.query(
        `WITH active AS (
           SELECT po.service_order_id, v.affected_service_order_item_ids AS items
             FROM production_orders po
             JOIN production_order_versions v
               ON v.production_order_id = po.id
              AND v.is_active = true
              AND v.version_reason IN ('rework', 'warranty_execution', 'corrective_production')
            WHERE po.tenant_id = $1
              AND po.is_deleted = false
              AND po.service_order_id = ANY($2::uuid[])
         ),
         targets AS (
           SELECT a.service_order_id, item_id::uuid AS item_id
             FROM active a
             CROSS JOIN LATERAL jsonb_array_elements_text(
               CASE
                 WHEN a.items IS NULL OR jsonb_typeof(a.items) <> 'array' OR jsonb_array_length(a.items) = 0 THEN (
                   SELECT COALESCE(jsonb_agg(i.id::text), '[]'::jsonb)
                     FROM service_order_items i
                    WHERE i.service_order_id = a.service_order_id
                      AND i.is_deleted = false
                 )
                 ELSE a.items
               END
             ) AS item_id
         )
         SELECT a.service_order_id AS id
           FROM active a
          WHERE EXISTS (SELECT 1 FROM targets t WHERE t.service_order_id = a.service_order_id)
            AND NOT EXISTS (
              SELECT 1
                FROM targets t
               WHERE t.service_order_id = a.service_order_id
                 AND COALESCE((
                   SELECT qr.release_decision
                     FROM quality_records qr
                    WHERE qr.service_order_item_id = t.item_id
                    ORDER BY qr.inspection_at DESC NULLS LAST, qr.created_at DESC
                    LIMIT 1
                 ), '') NOT IN ('rejected', 'rework_requested')
            )`,
        [tenantId, orderIds],
      )) as Array<{ id?: string }>;
      for (const row of rows) {
        if (row.id) {
          waiting.add(row.id);
        }
      }
    } catch {
      return waiting;
    }
    return waiting;
  }

  private async activeReworkVersionId(tenantId: string, serviceOrderId: string): Promise<string | null> {
    if (typeof this.dataSource?.query !== 'function') {
      return null;
    }
    try {
      const rows = (await this.dataSource.query(
        `SELECT v.id
           FROM production_orders po
           JOIN production_order_versions v
             ON v.production_order_id = po.id
            AND v.is_active = true
            AND v.version_reason IN ('rework', 'warranty_execution', 'corrective_production')
          WHERE po.tenant_id = $1
            AND po.service_order_id = $2
            AND po.is_deleted = false
          ORDER BY v.version_no DESC
          LIMIT 1`,
        [tenantId, serviceOrderId],
      )) as Array<{ id?: string }>;
      return rows[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  private async recordFloorDiary(order: ServiceOrderEntity, actorUserId: string, action: string) {
    if (!['pick_up', 'finish_production', 'pick_up_rework', 'finish_rework'].includes(action)) {
      return;
    }
    if (typeof this.dataSource.query !== 'function') {
      return;
    }
    try {
      const versionId = action === 'pick_up_rework' || action === 'finish_rework'
        ? await this.activeReworkVersionId(order.tenantId, order.id)
        : null;
      await this.dataSource.query(
        `INSERT INTO floor_diary_entries (
           id, tenant_id, branch_id, user_id, service_order_id, order_no, action, happened_at, production_order_version_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)`,
        [randomUUID(), order.tenantId, order.branchId, actorUserId, order.id, order.orderNo, action, versionId],
      );
    } catch {
      // O passo da OS já foi gravado. O diário não pode desfazer a sacola.
    }
  }

  async applyQualityStatus(
    serviceOrderId: string,
    tenantId: string,
    status: ServiceOrderStatus.QUALITY | ServiceOrderStatus.READY_FOR_PICKUP,
    actorUserId: string,
  ): Promise<ServiceOrderEntity> {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Ordens de serviço canceladas não entram no controle de qualidade.');
    }
    if (serviceOrder.status === status) {
      return serviceOrder;
    }
    serviceOrder.status = status;
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    if (status === ServiceOrderStatus.READY_FOR_PICKUP) {
      await this.releaseCounterHeldItems(saved, actorUserId);
    }
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: status === ServiceOrderStatus.READY_FOR_PICKUP ? 'service_order.ready_for_pickup' : 'service_order.quality.started',
      eventType: 'service_order.workflow',
      metadata: { status: saved.status },
    });
    if (status === ServiceOrderStatus.READY_FOR_PICKUP) {
      await this.enqueueWhatsapp(tenantId, saved.id, WHATSAPP_READY, actorUserId);
    }
    return saved;
  }

  private async enqueueWhatsapp(
    tenantId: string,
    serviceOrderId: string,
    kind: typeof WHATSAPP_OS_OPENED | typeof WHATSAPP_READY,
    actorUserId: string,
  ) {
    try {
      await enqueueWhatsappNotice(this.dataSource, tenantId, serviceOrderId, kind, actorUserId);
    } catch {
      // A sacola e o status já foram gravados. O aviso entra de novo pelo reenvio.
    }
  }

  private async releaseCounterHeldItems(serviceOrder: ServiceOrderEntity, actorUserId: string) {
    if (!isCounterFinancialChild(serviceOrder) || !serviceOrder.originServiceOrderId) {
      return;
    }
    const childItems = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.id);
    const originIds = new Set(
      childItems.map((item) => item.originServiceOrderItemId).filter((itemId): itemId is string => Boolean(itemId)),
    );
    if (originIds.size === 0) {
      return;
    }
    const originItems = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.originServiceOrderId);
    for (const item of originItems) {
      if (!originIds.has(item.id) || !item.heldForRework) {
        continue;
      }
      item.heldForRework = false;
      item.updatedBy = actorUserId;
      await this.serviceOrderItemRepository.save(item);
    }
  }

  async sendToProof(tenantId: string, serviceOrderId: string, actorUserId: string) {
    return this.applyProofAction(tenantId, serviceOrderId, actorUserId, 'send_to_proof');
  }

  async completeProof(
    tenantId: string,
    serviceOrderId: string,
    actorUserId: string,
    notes?: Array<{ itemId?: string | null; note?: string | null }>,
  ) {
    return this.applyProofAction(tenantId, serviceOrderId, actorUserId, 'complete_proof', notes);
  }

  private async applyProofAction(
    tenantId: string,
    serviceOrderId: string,
    actorUserId: string,
    action: ProofAction,
    notes?: Array<{ itemId?: string | null; note?: string | null }>,
  ) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (action === 'send_to_proof') {
      if (!canSendToProof(serviceOrder.status, serviceOrder.bagClosed)) {
        throw new DomainValidationError('Só é possível enviar para prova uma OS em produção com a sacola fechada.');
      }
    } else if (!canActOnProof(serviceOrder.status)) {
      throw new DomainValidationError('Só é possível concluir a prova com a OS em Aguardando prova.');
    }

    const savedNotes = action === 'complete_proof' ? await this.recordProofNotes(serviceOrder, actorUserId, notes) : [];

    if (action === 'complete_proof') {
      const busy = await this.serviceOrderRepository.findActiveFloorBags(
        tenantId,
        serviceOrder.branchId,
        serviceOrder.id,
        actorUserId,
      );
      if (busy[0]) {
        throw new DomainValidationError(
          `Já existe uma sacola em produção (${busy[0].orderNo}). Termine ela antes de continuar esta.`,
        );
      }
    }

    const previousStatus = serviceOrder.status;
    serviceOrder.status = proofActionResultStatus(action);
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: proofActionAudit(action),
      eventType: 'service_order.workflow',
      metadata: {
        status: saved.status,
        previousStatus,
        proofAction: action,
        orderNo: saved.orderNo,
        versionSuffix: saved.versionSuffix,
        proofNoteCount: savedNotes.length,
      },
    });
    const details = await this.getDetails(tenantId, saved.id);
    return {
      ...details,
      reprintProof: savedNotes.length > 0,
    };
  }

  private async recordProofNotes(
    serviceOrder: ServiceOrderEntity,
    actorUserId: string,
    notes?: Array<{ itemId?: string | null; note?: string | null }>,
  ) {
    const normalized = normalizeProofNotes(notes);
    if (normalized.length === 0 || !this.proofNoteRepository) {
      return [];
    }
    const items = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.id);
    const allowedIds = new Set(items.map((item) => item.id));
    for (const row of normalized) {
      if (!allowedIds.has(row.itemId)) {
        throw new DomainValidationError('A anotação de prova precisa pertencer a uma peça desta OS.');
      }
    }
    const batchId = randomUUID();
    const saved = [];
    for (const row of normalized) {
      const entity = this.proofNoteRepository.create({
        id: randomUUID(),
        tenantId: serviceOrder.tenantId,
        branchId: serviceOrder.branchId,
        serviceOrderId: serviceOrder.id,
        serviceOrderItemId: row.itemId,
        batchId,
        note: row.note,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      });
      saved.push(await this.proofNoteRepository.save(entity));
    }
    return saved;
  }

  private async listProofNotes(serviceOrderId: string) {
    if (!this.proofNoteRepository?.findByServiceOrder) {
      return [];
    }
    return this.proofNoteRepository.findByServiceOrder(serviceOrderId);
  }

  private async buildProofNoteHistory(
    rows: Array<{
      batchId: string;
      createdAt: Date;
      createdBy: string;
      serviceOrderItemId: string;
      note: string;
    }>,
    items: Array<{ id: string; itemNo: number; itemType: string; description: string }>,
  ) {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const actorIds = [...new Set(rows.map((row) => row.createdBy))];
    const actors = new Map<string, string>();
    await Promise.all(
      actorIds.map(async (actorId) => {
        try {
          const actor = await this.identityService.getById(actorId);
          actors.set(actorId, actor.displayName ?? actor.email ?? actorId);
        } catch {
          actors.set(actorId, actorId);
        }
      }),
    );
    const batches = new Map<
      string,
      {
        batchId: string;
        createdAt: Date;
        createdBy: string;
        createdByName: string;
        items: Array<{ itemId: string; itemNo: number; itemType: string; description: string; note: string }>;
      }
    >();
    for (const row of rows) {
      const item = itemById.get(row.serviceOrderItemId);
      if (!item) {
        continue;
      }
      const batch = batches.get(row.batchId) ?? {
        batchId: row.batchId,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        createdByName: actors.get(row.createdBy) ?? row.createdBy,
        items: [],
      };
      batch.items.push({
        itemId: item.id,
        itemNo: item.itemNo,
        itemType: item.itemType,
        description: item.description,
        note: row.note,
      });
      batches.set(row.batchId, batch);
    }
    return [...batches.values()]
      .map((batch) => ({
        ...batch,
        items: batch.items.sort((left, right) => left.itemNo - right.itemNo),
      }))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  async markPickedUp(tenantId: string, serviceOrderId: string, actorUserId: string) {
    return this.completePickup(tenantId, serviceOrderId, actorUserId, { method: 'attendant' });
  }

  async startPickup(tenantId: string, serviceOrderId: string, actorUserId: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (!canStartPickup(serviceOrder.status)) {
      throw new DomainValidationError('Só é possível iniciar a retirada com a OS pronta para retirada.');
    }
    const customer = await this.customerService.getById(serviceOrder.customerId, tenantId);
    await this.openPickupWindow(serviceOrder, actorUserId, customer.phone ?? null);
    return this.getDetails(tenantId, serviceOrder.id);
  }

  async completePickup(
    tenantId: string,
    serviceOrderId: string,
    actorUserId: string,
    input: {
      method: PickupMethod;
      recipientName?: string | null;
      photo?: { mimeType?: string | null; contentBase64?: string | null; fileName?: string | null } | null;
      userAgent?: string | null;
      ip?: string | null;
    },
  ) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (serviceOrder.status === ServiceOrderStatus.PICKED_UP) {
      throw new DomainValidationError('Esta OS já foi retirada.');
    }
    if (!canCompletePickup(serviceOrder.status)) {
      throw new DomainValidationError('Só é possível entregar OS pronta para retirada.');
    }
    await this.assertPickupPaymentAllowed(tenantId, serviceOrder);

    const photo = normalizePickupPhoto(input.photo);
    if (input.method === 'paper' && !photo) {
      throw new DomainValidationError('Anexe a foto da OP assinada para entregar no papel.');
    }
    const latest = await this.findLatestPickup(serviceOrder.id);
    if (input.method === 'link' && !canConfirmPickupFromLink(serviceOrder.status, latest?.windowOpenedAt, latest?.windowExpiresAt)) {
      throw new DomainValidationError('O Recebi só funciona depois que o atendente inicia a retirada no balcão.');
    }

    const customer = await this.customerService.getById(serviceOrder.customerId, tenantId);
    await this.recordPickupEvidence(serviceOrder, actorUserId, {
      method: input.method,
      recipientName: input.recipientName?.trim() || null,
      photo,
      customerPhone: customer.phone ?? null,
      acceptedText: input.method === 'link' ? pickupAcceptedText(serviceOrder.orderNo) : null,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });

    const items = (await this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.id)).filter(
      (item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted,
    );
    const groupMembers = await this.listGroupMembers(tenantId, serviceOrder.id);
    const pendingProcess = osHasPendingProcessSibling(serviceOrder.id, groupMembers);
    const heldCount = items.filter((item) => item.heldForRework).length;
    const partialPickup = !isProcessRow(serviceOrder) && (pendingProcess || heldCount > 0);

    if (!partialPickup) {
      serviceOrder.status = ServiceOrderStatus.PICKED_UP;
      serviceOrder.actualPickupDate = serviceOrder.actualPickupDate ?? todayDateOnly();
    }
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    if (isProcessRow(saved)) {
      await this.tryCloseOriginAfterProcessPickup(tenantId, saved, actorUserId);
    }
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: partialPickup ? 'service_order.delivered_partial' : 'service_order.delivered',
      eventType: 'service_order.workflow',
      metadata: {
        status: saved.status,
        actualPickupDate: saved.actualPickupDate,
        pickupMethod: input.method,
        pickupPhoto: Boolean(photo),
        partialPickup,
      },
    });
    return this.getDetails(tenantId, saved.id);
  }

  async confirmPickupFromLink(
    tenantId: string,
    serviceOrderId: string,
    evidence?: { userAgent?: string | null; ip?: string | null },
  ) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    return this.completePickup(tenantId, serviceOrderId, serviceOrder.commercialResponsibleActorId, {
      method: 'link',
      userAgent: evidence?.userAgent,
      ip: evidence?.ip,
    });
  }

  async getPickupPhoto(tenantId: string, serviceOrderId: string) {
    await this.getById(serviceOrderId, tenantId);
    const pickup = await this.findLatestPickup(serviceOrderId);
    if (!pickup?.photoBase64 || !pickup.photoMimeType) {
      return null;
    }
    return {
      fileName: pickup.photoFileName,
      mimeType: pickup.photoMimeType,
      contentBase64: pickup.photoBase64,
    };
  }

  private async readPublicPaymentLabel(serviceOrder: ServiceOrderEntity): Promise<string> {
    if (typeof this.dataSource?.query !== 'function') {
      return Number(serviceOrder.totalValue ?? 0) > 0 ? 'Saldo em aberto' : 'Pago';
    }
    const outstanding = await this.readOutstandingBalance(serviceOrder);
    return outstanding > 0 ? 'Saldo em aberto' : 'Pago';
  }

  private async readHeldByOrderIds(orderIds: string[]): Promise<Map<string, number>> {
    const heldById = new Map<string, number>();
    if (orderIds.length === 0 || typeof this.dataSource?.query !== 'function') {
      return heldById;
    }
    const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
    const rows = (await this.dataSource.query(
      `SELECT service_order_id AS id,
              COALESCE(SUM(GREATEST(quantity * COALESCE(unit_price, 0) - COALESCE(discount_value, 0), 0)), 0) AS held
       FROM service_order_items
       WHERE held_for_rework = true
         AND is_deleted = false
         AND service_order_id IN (${placeholders})
       GROUP BY service_order_id`,
      orderIds,
    )) as Array<{ id?: string; held?: string | number }>;
    for (const row of rows) {
      if (row.id) {
        heldById.set(row.id, Number(row.held ?? 0));
      }
    }
    return heldById;
  }

  private async readPaidByOrderIds(orderIds: string[]): Promise<Map<string, number>> {
    const paidById = new Map<string, number>();
    if (orderIds.length === 0 || typeof this.dataSource?.query !== 'function') {
      return paidById;
    }
    const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
    const rows = (await this.dataSource.query(
      `SELECT service_order_id AS id, COALESCE(SUM(CASE
          WHEN status IN ('failed', 'reversed', 'pending', 'canceled') THEN 0
          WHEN payment_direction = 'outbound' THEN -payment_amount
          ELSE payment_amount
        END), 0) AS paid
       FROM payment_records
       WHERE service_order_id IN (${placeholders})
       GROUP BY service_order_id`,
      orderIds,
    )) as Array<{ id?: string; paid?: string | number }>;
    for (const row of rows) {
      if (row.id) {
        paidById.set(row.id, Number(row.paid ?? 0));
      }
    }
    return paidById;
  }

  private async floorFinishNames(
    tenantId: string,
    serviceOrderId: string,
    groupId: string | null,
  ): Promise<string[]> {
    if (typeof this.dataSource?.query !== 'function') {
      return [];
    }
    try {
      const rows = (await this.dataSource.query(
        `SELECT DISTINCT u.display_name AS name
           FROM floor_diary_entries d
           JOIN user_identities u ON u.id = d.user_id
          WHERE d.tenant_id = $1
            AND d.action = 'finish_production'
            AND d.service_order_id IN (
              SELECT so.id
                FROM service_orders so
               WHERE so.tenant_id = $1
                 AND so.is_deleted = false
                 AND (
                   so.id = $2
                   OR so.group_id = $2
                   OR so.id = $3
                   OR ($3::uuid IS NOT NULL AND so.group_id = $3)
                 )
            )
          ORDER BY u.display_name`,
        [tenantId, serviceOrderId, groupId],
      )) as Array<{ name?: string | null }>;
      return [...new Set(rows.map((row) => (row.name ?? '').trim()).filter(Boolean))];
    } catch {
      return [];
    }
  }

  private async actorDisplayName(userId: string): Promise<string | null> {
    try {
      const user = await this.identityService.getById(userId);
      return user.displayName ?? null;
    } catch {
      return null;
    }
  }

  private async assertPickupPaymentAllowed(tenantId: string, serviceOrder: ServiceOrderEntity) {
    if (serviceOrder.deliveryReleasedAt) {
      return;
    }
    const tenant = await this.tenantService.getById(tenantId);
    if (!tenant.blockDeliveryWithOutstandingBalance) {
      return;
    }
    const outstandingBalance = await this.readOutstandingBalance(serviceOrder);
    if (pickupBlockedByOutstanding({ blockDeliveryWithOutstandingBalance: true, outstandingBalance })) {
      throw new DomainValidationError('Falta pagamento. O saldo em aberto bloqueia a entrega.');
    }
  }

  private async readOutstandingBalance(serviceOrder: ServiceOrderEntity) {
    if (typeof this.dataSource?.query !== 'function') {
      return 0;
    }
    const rows = (await this.dataSource.query(
      `SELECT
         COALESCE((
           SELECT SUM(COALESCE(member.total_value, 0))
           FROM service_orders AS member
           WHERE member.is_deleted = false
             AND (member.id = origin.id OR member.group_id = COALESCE(origin.group_id, origin.id))
         ), 0) AS total,
         COALESCE((
           SELECT SUM(GREATEST(item.quantity * COALESCE(item.unit_price, 0) - COALESCE(item.discount_value, 0), 0))
           FROM service_order_items AS item
           INNER JOIN service_orders AS member ON member.id = item.service_order_id
           WHERE item.held_for_rework = true
             AND item.is_deleted = false
             AND member.is_deleted = false
             AND (member.id = origin.id OR member.group_id = COALESCE(origin.group_id, origin.id))
         ), 0) AS held,
         COALESCE((
           SELECT SUM(CASE
             WHEN payment.status IN ('failed', 'reversed', 'pending', 'canceled') THEN 0
             WHEN payment.payment_direction = 'outbound' THEN -payment.payment_amount
             ELSE payment.payment_amount
           END)
           FROM payment_records AS payment
           WHERE payment.billing_scope_id = COALESCE(origin.group_id, origin.id)
         ), 0) AS paid
       FROM service_orders AS origin
       WHERE origin.id = $1`,
      [serviceOrder.id],
    )) as Array<{ total?: string | number; held?: string | number; paid?: string | number }>;
    const total = Number(rows[0]?.total ?? serviceOrder.totalValue ?? 0);
    const held = Number(rows[0]?.held ?? 0);
    const paid = Number(rows[0]?.paid ?? 0);
    return Math.max(Number((total - held - paid).toFixed(2)), 0);
  }

  private async findLatestPickup(serviceOrderId: string) {
    if (!this.pickupRepository?.findLatestByServiceOrder) {
      return null;
    }
    return this.pickupRepository.findLatestByServiceOrder(serviceOrderId);
  }

  private async openPickupWindow(
    serviceOrder: ServiceOrderEntity,
    actorUserId: string,
    customerPhone: string | null,
  ) {
    if (!this.pickupRepository) {
      return null;
    }
    const now = new Date();
    const latest = await this.findLatestPickup(serviceOrder.id);
    const current = latest && !latest.confirmedAt ? latest : this.pickupRepository.create({
      id: randomUUID(),
      tenantId: serviceOrder.tenantId,
      branchId: serviceOrder.branchId,
      serviceOrderId: serviceOrder.id,
      createdBy: actorUserId,
    });
    current.windowOpenedAt = now;
    current.windowExpiresAt = pickupWindowExpiresAt(now);
    current.customerPhone = customerPhone;
    current.updatedBy = actorUserId;
    const saved = await this.pickupRepository.save(current);
    await this.auditService.record({
      tenantId: serviceOrder.tenantId,
      branchId: serviceOrder.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: serviceOrder.id,
      action: 'service_order.pickup.window_opened',
      eventType: 'service_order.workflow',
      metadata: {
        orderNo: serviceOrder.orderNo,
        windowExpiresAt: saved.windowExpiresAt,
      },
    });
    return saved;
  }

  private async recordPickupEvidence(
    serviceOrder: ServiceOrderEntity,
    actorUserId: string,
    input: {
      method: PickupMethod;
      recipientName: string | null;
      photo: { mimeType: string; contentBase64: string; fileName: string } | null;
      customerPhone: string | null;
      acceptedText: string | null;
      userAgent: string | null;
      ip: string | null;
    },
  ) {
    if (!this.pickupRepository) {
      return null;
    }
    const latest = await this.findLatestPickup(serviceOrder.id);
    const current = latest && !latest.confirmedAt ? latest : this.pickupRepository.create({
      id: randomUUID(),
      tenantId: serviceOrder.tenantId,
      branchId: serviceOrder.branchId,
      serviceOrderId: serviceOrder.id,
      createdBy: actorUserId,
    });
    current.method = input.method;
    current.confirmedAt = new Date();
    current.customerPhone = input.customerPhone;
    current.recipientName = input.recipientName;
    current.acceptedText = input.acceptedText;
    current.clientUserAgent = input.userAgent;
    current.clientIp = input.ip;
    current.photoFileName = input.photo?.fileName ?? null;
    current.photoMimeType = input.photo?.mimeType ?? null;
    current.photoBase64 = input.photo?.contentBase64 ?? null;
    current.updatedBy = actorUserId;
    return this.pickupRepository.save(current);
  }

  private async buildPickupSummary(serviceOrder: ServiceOrderEntity, customerPhone: string | null) {
    const pickup = await this.findLatestPickup(serviceOrder.id);
    return {
      windowOpen: isPickupWindowOpen(pickup?.windowOpenedAt, pickup?.windowExpiresAt),
      windowOpenedAt: pickup?.windowOpenedAt ?? null,
      windowExpiresAt: pickup?.windowExpiresAt ?? null,
      method: pickup?.method ?? null,
      confirmedAt: pickup?.confirmedAt ?? null,
      customerPhone: pickup?.customerPhone ?? customerPhone,
      recipientName: pickup?.recipientName ?? null,
      acceptedText: pickup?.acceptedText ?? null,
      photoAvailable: Boolean(pickup?.photoBase64),
      recebiReady: canConfirmPickupFromLink(serviceOrder.status, pickup?.windowOpenedAt, pickup?.windowExpiresAt),
      partial: serviceOrder.status === ServiceOrderStatus.READY_FOR_PICKUP && Boolean(pickup?.confirmedAt),
    };
  }

  private async findLatestApproval(serviceOrderId: string) {
    if (!this.approvalRepository?.findLatestByServiceOrder) {
      return null;
    }
    return this.approvalRepository.findLatestByServiceOrder(serviceOrderId);
  }

  private async findLatestApprovalSignature(serviceOrderId: string) {
    if (!this.approvalRepository?.findLatestSignatureByServiceOrder) {
      return null;
    }
    return this.approvalRepository.findLatestSignatureByServiceOrder(serviceOrderId);
  }

  private async buildApprovalSummary(serviceOrder: ServiceOrderEntity) {
    const latest = await this.findLatestApproval(serviceOrder.id);
    const signature = await this.findLatestApprovalSignature(serviceOrder.id);
    const current = signature ?? latest;
    return {
      method: current?.method ?? null,
      confirmedAt: current?.confirmedAt ?? null,
      acceptedText: current?.acceptedText ?? null,
      releaseReason: latest?.method === 'release' ? latest.releaseReason : current?.releaseReason ?? null,
      totalValue: current?.totalValueSnapshot ?? null,
      photoAvailable: Boolean(current?.photoBase64),
      measurementsLocked: Boolean(current?.measurementsLockedAt || latest?.measurementsLockedAt),
      signed: Boolean(signature),
      releasedWithoutSignature: Boolean(latest && latest.method === 'release' && !signature),
    };
  }

  async releaseDelivery(tenantId: string, serviceOrderId: string, actorUserId: string, reason: string) {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (serviceOrder.status !== ServiceOrderStatus.READY_FOR_PICKUP) {
      throw new DomainValidationError('Só a OS pronta para retirada pode ser liberada.');
    }
    const note = reason.trim();
    if (!note || note.length > 200) {
      throw new DomainValidationError('Informe o motivo da liberação, com até 200 caracteres.');
    }
    const tenant = await this.tenantService.getById(tenantId);
    if (!tenant.blockDeliveryWithOutstandingBalance) {
      throw new DomainValidationError('A Conta não bloqueia entrega com saldo.');
    }
    const outstandingBalance = await this.readOutstandingBalance(serviceOrder);
    if (outstandingBalance <= 0) {
      throw new DomainValidationError('Não há saldo bloqueando a entrega.');
    }
    if (serviceOrder.deliveryReleasedAt) {
      throw new DomainValidationError('A entrega desta OS já foi liberada.');
    }
    serviceOrder.deliveryReleasedAt = new Date();
    serviceOrder.deliveryReleasedBy = actorUserId;
    serviceOrder.deliveryReleaseReason = note;
    serviceOrder.updatedBy = actorUserId;
    await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: serviceOrder.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: serviceOrder.id,
      action: 'service_order.delivery.released',
      eventType: 'service_order.write',
      metadata: { reason: note, outstandingBalance },
    });
    return this.getDetails(tenantId, serviceOrderId);
  }

  async createClientReturn(
    tenantId: string,
    originServiceOrderId: string,
    actorUserId: string,
    itemIds: string[],
    options?: { waiveCharge?: boolean; reason?: string },
  ) {
    const origin = await this.getById(originServiceOrderId, tenantId);
    if (origin.status !== ServiceOrderStatus.PICKED_UP) {
      throw new DomainValidationError('Só é possível abrir retorno depois da retirada.');
    }
    if (!origin.actualPickupDate) {
      throw new DomainValidationError('A OS original não tem data de retirada.');
    }

    const selectedIds = [...new Set(itemIds.filter(Boolean))];
    if (selectedIds.length === 0) {
      throw new DomainValidationError('Selecione pelo menos uma peça para o retorno.');
    }

    const originItems = (await this.serviceOrderItemRepository.findByServiceOrder(origin.id)).filter(
      (item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted,
    );
    const originItemById = new Map(originItems.map((item) => [item.id, item]));
    const selectedItems = selectedIds.map((itemId) => {
      const item = originItemById.get(itemId);
      if (!item) {
        throw new DomainValidationError('Uma das peças não pertence à OS original.');
      }
      return item;
    });

    const tenant = await this.tenantService.getById(tenantId);
    const maxPiecesPerBag = tenant.maxPiecesPerBag ?? DEFAULT_MAX_PIECES_PER_BAG;
    this.assertItemCount(selectedItems.length, maxPiecesPerBag);

    const preview = buildClientReturnPreview(
      origin.actualPickupDate,
      tenant.warrantyAdjustmentPeriodDays ?? 7,
      tenant.warrantyExecutionPeriodDays ?? 90,
    );
    let charged = preview.kind === ServiceOrderReturnKind.CHARGED;
    let chargeWaivedReason: string | null = null;
    if (options?.waiveCharge) {
      if (!charged) {
        throw new DomainValidationError('Dentro do prazo a OS já nasce sem valor.');
      }
      const note = (options.reason ?? '').trim();
      if (!note || note.length > 200) {
        throw new DomainValidationError('Informe o motivo para abrir sem valor, com até 200 caracteres.');
      }
      charged = false;
      chargeWaivedReason = note;
    }
    const processLetter = processLetterForReturnKind(preview.kind);
    const returnLabel = osReturnKindLabel(preview.kind) ?? 'Retorno';
    const returnNote = chargeWaivedReason
      ? `Retorno da OS ${origin.orderNo} (${returnLabel}). Aberta sem valor: ${chargeWaivedReason}`
      : `Retorno da OS ${origin.orderNo} (${returnLabel}).`;
    const originFloorNames = (await this.floorFinishNames(tenantId, origin.id, origin.groupId)).join(', ');

    const saved = await this.persistLinkedProcessOrder({
      tenantId,
      origin,
      actorUserId,
      selectedItems,
      returnKind: preview.kind,
      processLetter,
      sameFamily: Boolean(processLetter),
      charged,
      holdOriginItems: false,
      commercialNote: returnNote,
      originFloorNames,
      chargeWaivedReason,
    });

    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.client_return.created',
      eventType: 'service_order.write',
      metadata: {
        originServiceOrderId: origin.id,
        originOrderNo: origin.orderNo,
        returnKind: preview.kind,
        daysSincePickup: preview.daysSincePickup,
        itemCount: selectedItems.length,
        versionSuffix: saved.versionSuffix,
        originFloorNames: originFloorNames || null,
        chargeWaived: Boolean(chargeWaivedReason),
        chargeWaivedReason,
      },
    });

    return this.getDetails(tenantId, saved.id);
  }

  async createCounterRework(
    tenantId: string,
    originServiceOrderId: string,
    actorUserId: string,
    itemIds: string[],
    reason: string,
  ) {
    const origin = await this.getById(originServiceOrderId, tenantId);
    if (origin.status !== ServiceOrderStatus.READY_FOR_PICKUP) {
      throw new DomainValidationError('A refação no balcão só vale com a OS pronta para retirada.');
    }

    const selectedIds = [...new Set(itemIds.filter(Boolean))];
    if (selectedIds.length === 0) {
      throw new DomainValidationError('Selecione pelo menos uma peça recusada no balcão.');
    }
    const clientReason = reason.trim();
    if (!clientReason) {
      throw new DomainValidationError('Informe o motivo do cliente para a refação no balcão.');
    }

    const originItems = (await this.serviceOrderItemRepository.findByServiceOrder(origin.id)).filter(
      (item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted,
    );
    const originItemById = new Map(originItems.map((item) => [item.id, item]));
    const selectedItems = selectedIds.map((itemId) => {
      const item = originItemById.get(itemId);
      if (!item) {
        throw new DomainValidationError('Uma das peças não pertence à OS original.');
      }
      if (item.heldForRework) {
        throw new DomainValidationError('Esta peça já foi para a refação no balcão.');
      }
      return item;
    });

    const tenant = await this.tenantService.getById(tenantId);
    const maxPiecesPerBag = tenant.maxPiecesPerBag ?? DEFAULT_MAX_PIECES_PER_BAG;
    this.assertItemCount(selectedItems.length, maxPiecesPerBag);

    const returnNote = `Refação no balcão da OS ${origin.orderNo}. Motivo do cliente: ${clientReason}`;
    const saved = await this.persistLinkedProcessOrder({
      tenantId,
      origin,
      actorUserId,
      selectedItems,
      returnKind: ServiceOrderReturnKind.COUNTER,
      processLetter: PROCESS_SUFFIX.COUNTER,
      sameFamily: true,
      charged: false,
      holdOriginItems: true,
      commercialNote: returnNote,
    });

    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.counter_rework.created',
      eventType: 'service_order.write',
      metadata: {
        originServiceOrderId: origin.id,
        originOrderNo: origin.orderNo,
        returnKind: ServiceOrderReturnKind.COUNTER,
        itemCount: selectedItems.length,
        versionSuffix: saved.versionSuffix,
        reason: clientReason,
      },
    });

    return this.getDetails(tenantId, saved.id);
  }

  private async persistLinkedProcessOrder(input: {
    tenantId: string;
    origin: ServiceOrderEntity;
    actorUserId: string;
    selectedItems: ServiceOrderItemEntity[];
    returnKind: ServiceOrderReturnKind;
    processLetter: string | null;
    sameFamily: boolean;
    charged: boolean;
    holdOriginItems: boolean;
    commercialNote: string;
    originFloorNames?: string | null;
    chargeWaivedReason?: string | null;
  }) {
    const openedAt = new Date();
    const suggestedDelivery = await this.deliveryDateService.suggestDelivery(
      input.tenantId,
      input.origin.branchId,
      openedAt,
      { deliveryType: input.origin.deliveryType, itemCount: input.selectedItems.length },
    );
    const groupId = input.sameFamily ? (input.origin.groupId ?? input.origin.id) : randomUUID();
    const siblings = input.sameFamily
      ? await this.serviceOrderRepository.findByGroupId(input.tenantId, groupId)
      : [];
    const members = siblings.length > 0 ? siblings : [input.origin];
    const root = members.find((order) => !order.versionSuffix) ?? input.origin;
    const versionSuffix =
      input.sameFamily && input.processLetter
        ? nextProcessSuffix(
            input.processLetter as typeof PROCESS_SUFFIX.COUNTER,
            members.map((order) => order.versionSuffix),
          )
        : null;
    const groupSeq = input.sameFamily
      ? (input.origin.groupSeq ?? root.groupSeq ?? (await this.serviceOrderRepository.nextGroupSeq(input.tenantId)))
      : await this.serviceOrderRepository.nextGroupSeq(input.tenantId);
    const orderNo = input.sameFamily && versionSuffix
      ? withVersionSuffix(root.orderNo, versionSuffix)
      : formatServiceOrderNo(groupSeq);
    const orderId = input.sameFamily ? randomUUID() : groupId;
    const commercialNotes = [input.commercialNote, input.origin.commercialNotes?.trim()].filter(Boolean).join('\n') || null;
    const copiedItems = input.selectedItems.map((item) => ({
      itemType: item.itemType,
      description: item.description,
      quantity: 1,
      unitPrice: input.charged ? (item.unitPrice === null ? null : Number(item.unitPrice)) : null,
      discountValue: input.charged ? Number(item.discountValue ?? 0) : 0,
    }));
    const orderTotals = input.charged
      ? this.calculateOrderTotal(
          copiedItems,
          Number(input.origin.discountValue ?? 0),
          input.origin.deliverySurchargeMethod,
          Number(input.origin.deliverySurchargeValue ?? 0),
        )
      : null;

    return this.dataSource.transaction(async (manager) => {
      const persistedOrder = manager.create(ServiceOrderEntity, {
        id: orderId,
        tenantId: input.origin.tenantId,
        branchId: input.origin.branchId,
        customerId: input.origin.customerId,
        workflowDefinitionId: input.origin.workflowDefinitionId,
        currentStatusDefinitionId: null,
        orderNo,
        groupId,
        groupSeq,
        versionSuffix,
        bagClosed: false,
        openedAt,
        deliveryCommitmentSourceAt: openedAt,
        promisedDeliveryDate: suggestedDelivery.promisedDeliveryDate,
        promisedDeliveryTime: normalizeClockTime(suggestedDelivery.promisedDeliveryTime) ?? currentClockTime(openedAt),
        actualPickupDate: null,
        originServiceOrderId: input.origin.id,
        returnKind: input.returnKind,
        actualDeliveryDate: null,
        actualDeliveryTime: null,
        paymentTermsDays: input.charged ? input.origin.paymentTermsDays : 0,
        deliveryType: input.origin.deliveryType,
        operationalPriority: input.origin.operationalPriority,
        commercialResponsibleActorId: input.origin.commercialResponsibleActorId,
        technicalMeasurementResponsibleActorId: input.origin.technicalMeasurementResponsibleActorId,
        deliverySurchargeMethod: input.charged ? input.origin.deliverySurchargeMethod : null,
        deliverySurchargeValue: input.charged ? input.origin.deliverySurchargeValue : null,
        commercialNotes,
        customerNotes: input.origin.customerNotes,
        publicToken: randomUUID(),
        status: ServiceOrderStatus.OPEN,
        originFloorNames: input.originFloorNames ?? null,
        chargeWaivedAt: input.chargeWaivedReason ? openedAt : null,
        chargeWaivedBy: input.chargeWaivedReason ? input.actorUserId : null,
        chargeWaivedReason: input.chargeWaivedReason ?? null,
        totalValue: orderTotals,
        discountValue: input.charged && input.origin.discountValue != null ? input.origin.discountValue : null,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      });
      await manager.save(ServiceOrderEntity, persistedOrder);

      for (const [index, item] of input.selectedItems.entries()) {
        const serviceOrderItem = manager.create(ServiceOrderItemEntity, {
          id: randomUUID(),
          tenantId: input.origin.tenantId,
          branchId: input.origin.branchId,
          serviceOrderId: persistedOrder.id,
          itemNo: index + 1,
          itemType: item.itemType,
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          complement: item.complement,
          brand: item.brand,
          model: item.model,
          serialNo: item.serialNo,
          timeMinutes: item.timeMinutes,
          quantity: this.formatQuantity(1),
          unitPrice: input.charged ? item.unitPrice : null,
          discountValue: this.formatMoney(input.charged ? Number(item.discountValue ?? 0) : 0),
          deliveryType: item.deliveryType,
          operationalPriority: item.operationalPriority,
          status: ServiceOrderItemStatus.OPEN,
          heldForRework: false,
          originServiceOrderItemId: item.id,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        });
        await manager.save(ServiceOrderItemEntity, serviceOrderItem);
        if (input.holdOriginItems) {
          item.heldForRework = true;
          item.updatedBy = input.actorUserId;
          await manager.save(ServiceOrderItemEntity, item);
        }
      }

      return persistedOrder;
    });
  }

  private async tryCloseOriginAfterProcessPickup(
    tenantId: string,
    processOrder: ServiceOrderEntity,
    actorUserId: string,
  ) {
    if (!processOrder.originServiceOrderId) {
      return;
    }
    const origin = await this.serviceOrderRepository.findById(processOrder.originServiceOrderId);
    if (!origin || origin.tenantId !== tenantId || origin.status !== ServiceOrderStatus.READY_FOR_PICKUP) {
      return;
    }
    const members = await this.listGroupMembers(tenantId, origin.id);
    if (osHasPendingProcessSibling(origin.id, members)) {
      return;
    }
    const originItems = (await this.serviceOrderItemRepository.findByServiceOrder(origin.id)).filter(
      (item) => item.status !== ServiceOrderItemStatus.CANCELLED && !item.isDeleted,
    );
    const latestPickup = await this.findLatestPickup(origin.id);
    const allHeld = originItems.length > 0 && originItems.every((item) => item.heldForRework);
    if (!latestPickup && !allHeld) {
      return;
    }
    origin.status = ServiceOrderStatus.PICKED_UP;
    origin.actualPickupDate = origin.actualPickupDate ?? todayDateOnly();
    origin.updatedBy = actorUserId;
    await this.serviceOrderRepository.save(origin);
  }

  async cancel(serviceOrderId: string, tenantId: string, actorUserId: string): Promise<ServiceOrderEntity> {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    if (serviceOrder.status === ServiceOrderStatus.CANCELLED) {
      throw new DomainValidationError('Esta ordem de serviço já está cancelada.');
    }
    serviceOrder.status = ServiceOrderStatus.CANCELLED;
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.cancelled',
      eventType: 'service_order.workflow',
      metadata: { status: saved.status },
    });
    return saved;
  }

  async recalculateDeliveryDate(serviceOrderId: string, tenantId: string, actorUserId: string): Promise<ServiceOrderEntity> {
    const serviceOrder = await this.getById(serviceOrderId, tenantId);
    const suggestedDelivery = await this.deliveryDateService.suggestDelivery(
      tenantId,
      serviceOrder.branchId,
      serviceOrder.deliveryCommitmentSourceAt,
      { deliveryType: serviceOrder.deliveryType },
    );
    serviceOrder.promisedDeliveryDate = suggestedDelivery.promisedDeliveryDate;
    serviceOrder.promisedDeliveryTime = normalizeClockTime(suggestedDelivery.promisedDeliveryTime);
    serviceOrder.updatedBy = actorUserId;
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.auditService.record({
      tenantId,
      branchId: saved.branchId,
      actorUserId,
      entityType: 'service_order',
      entityId: saved.id,
      action: 'service_order.delivery_date.recalculated',
      eventType: 'service_order.workflow',
      metadata: { promisedDeliveryDate: saved.promisedDeliveryDate },
    });
    return saved;
  }

  async getTimeline(serviceOrderId: string, tenantId: string) {
    await this.getById(serviceOrderId, tenantId);
    const auditTrail = await this.auditService.listByEntity(tenantId, 'service_order', serviceOrderId, 200);
    return [...auditTrail].reverse();
  }

  assertBranchAccess(serviceOrder: ServiceOrderEntity, accessibleBranchIds: string[]): void {
    if (!accessibleBranchIds.includes(serviceOrder.branchId)) {
      throw new ForbiddenException('Requested service order is outside the authenticated branch scope.');
    }
  }

  private async recalculateTotal(serviceOrder: ServiceOrderEntity, actorUserId: string): Promise<void> {
    const items = await this.serviceOrderItemRepository.findByServiceOrder(serviceOrder.id);
    serviceOrder.totalValue = this.calculateOrderTotal(
      items.map((item) => this.normalizePersistedItem(item)),
      Number(serviceOrder.discountValue ?? 0),
      serviceOrder.deliverySurchargeMethod,
      Number(serviceOrder.deliverySurchargeValue ?? 0),
    );
    serviceOrder.updatedBy = actorUserId;
    await this.serviceOrderRepository.save(serviceOrder);
  }

  private normalizeItemInput(
    item: Pick<
      CreateServiceOrderItemInputDto,
      'itemType' | 'description' | 'quantity' | 'unitPrice' | 'discountValue' | 'timeMinutes' | 'deliveryType' | 'operationalPriority' | 'productId' | 'serviceId' | 'complement' | 'brand' | 'model' | 'serialNo'
    >,
  ) {
    return {
      itemType: item.itemType.trim(),
      description: item.description.trim(),
      quantity: 1,
      unitPrice: item.unitPrice ?? null,
      discountValue: item.discountValue ?? 0,
      timeMinutes: item.timeMinutes ?? null,
      deliveryType: item.deliveryType ?? null,
      operationalPriority: item.operationalPriority?.trim() || null,
      productId: item.productId ?? null,
      serviceId: item.serviceId ?? null,
      complement: item.complement?.trim() || null,
      brand: (item.brand ?? '').trim(),
      model: (item.model ?? '').trim(),
      serialNo: (item.serialNo ?? '').trim(),
    };
  }

  private async resolveCatalogFields(
    tenantId: string,
    actorUserId: string,
    item: ReturnType<ServiceOrderService['normalizeItemInput']>,
    fillEstimatedMinutesFromCatalog = false,
  ) {
    let itemType = item.itemType;
    let description = item.description;
    let unitPrice = item.unitPrice;
    let timeMinutes = item.timeMinutes;
    const productId = item.productId;
    const serviceId = item.serviceId;

    if (productId) {
      const product = await this.atelierCatalogService.resolveActiveProduct(tenantId, productId, actorUserId);
      itemType = product.displayName;
    }
    if (serviceId) {
      const service = await this.atelierCatalogService.resolveActiveService(tenantId, serviceId, actorUserId);
      description = service.displayName;
    }
    if (productId && serviceId) {
      const priced = await this.atelierCatalogService.findActiveProductService(tenantId, productId, serviceId);
      if (priced && unitPrice === null) {
        unitPrice = Number(priced.suggestedPrice);
      }
      if (priced && fillEstimatedMinutesFromCatalog && timeMinutes === null) {
        timeMinutes = priced.estimatedMinutes;
      }
      if (!priced && unitPrice === null) {
        throw new DomainValidationError('Cadastre o preço deste produto e serviço.');
      }
    }

    if (!itemType) {
      throw new DomainValidationError('Cada peça precisa de um produto.');
    }
    if (!description) {
      throw new DomainValidationError('Cada peça precisa de um serviço.');
    }
    if (!item.brand) {
      throw new DomainValidationError('Cada peça precisa da marca.');
    }

    return {
      ...item,
      itemType,
      description,
      unitPrice,
      timeMinutes,
      productId,
      serviceId,
    };
  }

  private assertBagOpen(serviceOrder: ServiceOrderEntity): void {
    if (serviceOrder.bagClosed) {
      throw new DomainValidationError(
        'Esta sacola já está fechada. Use Abrir sacola se precisar corrigir.',
      );
    }
  }

  private assertHeaderWritableWhenBagClosed(
    serviceOrder: ServiceOrderEntity,
    dto: UpdateServiceOrderDto,
  ): void {
    if (!serviceOrder.bagClosed) {
      return;
    }

    const allowedWhenClosed = new Set([
      'actualPickupDate',
      'actualDeliveryDate',
      'actualDeliveryTime',
      'actorUserId',
    ]);
    const blocked = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .filter((key) => !allowedWhenClosed.has(key));
    if (blocked.length > 0) {
      throw new DomainValidationError(
        'Esta sacola já está fechada. Use Abrir sacola se precisar corrigir.',
      );
    }
  }

  private assertItemCount(itemCount: number, maxPiecesPerBag = DEFAULT_MAX_PIECES_PER_BAG) {
    if (itemCount > maxPiecesPerBag) {
      throw new DomainValidationError(
        `Esta versão da OS aceita no máximo ${maxPiecesPerBag} peças. Feche a sacola para abrir a próxima versão.`,
      );
    }
  }

  private normalizePersistedItem(item: ServiceOrderItemEntity) {
    return {
      itemType: item.itemType,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      discountValue: Number(item.discountValue ?? 0),
      deliveryType: item.deliveryType,
      operationalPriority: item.operationalPriority,
    };
  }

  private calculateOrderTotal(
    items: Array<{ quantity: number; unitPrice: number | null; discountValue: number }>,
    orderDiscountValue: number,
    surchargeMethod: SurchargeMethod | null,
    surchargeValue: number,
  ): string | null {
    const baseLines = items.map((item) => {
      if (item.unitPrice === null) {
        return null;
      }
      return item.quantity * item.unitPrice - item.discountValue;
    });

    if (baseLines.every((value) => value === null) && orderDiscountValue === 0 && surchargeValue === 0) {
      return null;
    }

    const subtotal = baseLines.reduce<number>((acc, value) => acc + (value ?? 0), 0);
    let total = subtotal - orderDiscountValue;
    if (surchargeMethod === SurchargeMethod.FIXED) {
      total += surchargeValue;
    } else if (surchargeMethod === SurchargeMethod.PERCENTAGE) {
      total += subtotal * (surchargeValue / 100);
    }

    return this.formatMoney(Math.max(total, 0));
  }

  private optionalDifficulty(value: number | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Number.isInteger(value) || value < 1 || value > 4) {
      throw new DomainValidationError('O grau de dificuldade fica entre 1 e 4.');
    }
    return value;
  }

  private formatMoney(value: number): string {
    return value.toFixed(2);
  }

  private formatQuantity(value: number): string {
    return value.toFixed(4);
  }

  private generateOrderNo(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `SO-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async assertResponsibleActor(tenantId: string, actorId: string, label: string): Promise<void> {
    const actor = await this.identityService.getById(actorId);
    if (actor.tenantId !== tenantId) {
      throw new DomainValidationError(`${label} must belong to the same tenant.`);
    }
    if (actor.status !== UserStatus.ACTIVE) {
      throw new DomainValidationError(`${label} must be an active user.`);
    }
  }

  private assertCustomerBranchCompatibility(customerBranchId: string | null, branchId: string): void {
    if (customerBranchId && customerBranchId !== branchId) {
      throw new DomainValidationError('O cliente desta filial precisa ser o da mesma filial da ordem de serviço.');
    }
  }
}
