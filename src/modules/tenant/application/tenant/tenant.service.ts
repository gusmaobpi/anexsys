import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { CreateTenantDto } from 'src/modules/tenant/contracts/dto/create-tenant.dto';
import { UpdateTenantDto } from 'src/modules/tenant/contracts/dto/update-tenant.dto';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import { TenantStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { TenantEntity } from '../../infrastructure/persistence/entities/tenant.entity';
import { TenantRepository } from '../../infrastructure/persistence/repositories/tenant.repository';

@Injectable()
export class TenantService {
  constructor(
    @Inject(TenantRepository)
    private readonly tenantRepository: TenantRepository,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  async create(dto: CreateTenantDto): Promise<TenantEntity> {
    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
      const normalizedCode = dto.code.trim().toUpperCase();
      const existing = await this.tenantRepository.findByCode(normalizedCode);
      if (existing) {
        throw new DomainValidationError(`Tenant code '${dto.code}' already exists.`);
      }

      const tenant = this.tenantRepository.create({
        id: randomUUID(),
        code: normalizedCode,
        legalName: dto.legalName.trim(),
        displayName: dto.displayName.trim(),
        status: TenantStatus.ACTIVE,
        warrantyAdjustmentPeriodDays: dto.warrantyAdjustmentPeriodDays ?? 7,
        warrantyExecutionPeriodDays: dto.warrantyExecutionPeriodDays ?? 7,
        blockDeliveryWithOutstandingBalance: dto.blockDeliveryWithOutstandingBalance ?? false,
        machineWaitMinutes: 3,
        maxPiecesPerBag: 5,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdBy: dto.actorUserId,
        updatedBy: dto.actorUserId,
      });

      const saved = await this.tenantRepository.save(tenant);
      await this.auditService.record({
        tenantId: saved.id,
        actorUserId: dto.actorUserId,
        entityType: 'tenant',
        entityId: saved.id,
        action: 'tenant.created',
        eventType: 'governance.write',
        metadata: { code: saved.code },
        newValues: this.buildAuditSnapshot(saved),
      });

      return saved;
    });
  }

  async list(): Promise<TenantEntity[]> {
    return this.tenantRepository.findAll();
  }

  async getById(id: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      throw new EntityNotFoundError(`Tenant '${id}' was not found.`);
    }

    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantEntity> {
    const tenant = await this.getById(id);
    const previousValues = this.buildAuditSnapshot(tenant);

    if (dto.code && dto.code.trim().toUpperCase() !== tenant.code) {
      const normalizedCode = dto.code.trim().toUpperCase();
      const existing = await this.tenantRepository.findByCode(normalizedCode);
      if (existing && existing.id !== id) {
        throw new DomainValidationError(`Tenant code '${dto.code}' already exists.`);
      }
      tenant.code = normalizedCode;
    }

    tenant.legalName = dto.legalName?.trim() ?? tenant.legalName;
    tenant.displayName = dto.displayName?.trim() ?? tenant.displayName;
    if (dto.warrantyAdjustmentPeriodDays !== undefined) {
      tenant.warrantyAdjustmentPeriodDays = dto.warrantyAdjustmentPeriodDays;
    }
    if (dto.warrantyExecutionPeriodDays !== undefined) {
      tenant.warrantyExecutionPeriodDays = dto.warrantyExecutionPeriodDays;
    }
    if (dto.blockDeliveryWithOutstandingBalance !== undefined) {
      tenant.blockDeliveryWithOutstandingBalance = dto.blockDeliveryWithOutstandingBalance;
    }
    tenant.updatedBy = dto.actorUserId;

    const saved = await this.tenantRepository.save(tenant);
    await this.auditService.record({
      tenantId: saved.id,
      actorUserId: dto.actorUserId,
      entityType: 'tenant',
      entityId: saved.id,
      action: 'tenant.updated',
      eventType: 'governance.write',
      metadata: {
        warrantyAdjustmentPeriodDays: saved.warrantyAdjustmentPeriodDays,
        warrantyExecutionPeriodDays: saved.warrantyExecutionPeriodDays,
        blockDeliveryWithOutstandingBalance: saved.blockDeliveryWithOutstandingBalance,
      },
      previousValues,
      newValues: this.buildAuditSnapshot(saved),
    });

    return saved;
  }

  async activate(id: string, actorUserId: string): Promise<TenantEntity> {
    return this.setStatus(id, TenantStatus.ACTIVE, actorUserId, 'tenant.activated');
  }

  async deactivate(id: string, actorUserId: string): Promise<TenantEntity> {
    return this.setStatus(id, TenantStatus.INACTIVE, actorUserId, 'tenant.deactivated');
  }

  private async setStatus(
    id: string,
    status: TenantStatus,
    actorUserId: string,
    action: string,
  ): Promise<TenantEntity> {
    const tenant = await this.getById(id);
    if (status === TenantStatus.INACTIVE) {
      await this.dependencyValidationService.assertTenantCanDeactivate(id);
    }
    const previousValues = this.buildAuditSnapshot(tenant);
    tenant.status = status;
    tenant.updatedBy = actorUserId;

    const saved = await this.tenantRepository.save(tenant);
    await this.auditService.record({
      tenantId: saved.id,
      actorUserId,
      entityType: 'tenant',
      entityId: saved.id,
      action,
      eventType: 'governance.write',
      metadata: { status },
      previousValues,
      newValues: this.buildAuditSnapshot(saved),
    });

    return saved;
  }

  private buildAuditSnapshot(tenant: TenantEntity) {
    return {
      code: tenant.code,
      legalName: tenant.legalName,
      displayName: tenant.displayName,
      status: tenant.status,
      warrantyAdjustmentPeriodDays: tenant.warrantyAdjustmentPeriodDays,
      warrantyExecutionPeriodDays: tenant.warrantyExecutionPeriodDays,
      blockDeliveryWithOutstandingBalance: tenant.blockDeliveryWithOutstandingBalance,
      machineWaitMinutes: tenant.machineWaitMinutes,
      maxPiecesPerBag: tenant.maxPiecesPerBag,
    };
  }
}
