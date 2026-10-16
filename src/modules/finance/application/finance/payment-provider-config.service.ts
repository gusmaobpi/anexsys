import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { CompanyService } from 'src/modules/company/application/company/company.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import {
  PaymentProviderConfigEntity,
  PaymentProviderEnvironment,
} from '../../infrastructure/persistence/entities/payment-provider-config.entity';
import { PaymentProviderConfigRepository } from '../../infrastructure/persistence/repositories/payment-provider-config.repository';

export type PaymentProviderConfigView = {
  id: string;
  companyId: string;
  companyName: string;
  provider: PaymentProviderName;
  environment: PaymentProviderEnvironment;
  credentials: Record<string, string>;
  status: 'active' | 'inactive';
  createdAt: Date;
};

@Injectable()
export class PaymentProviderConfigService {
  constructor(
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(CompanyService)
    private readonly companyService: CompanyService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(PaymentProviderConfigRepository)
    private readonly configRepository: PaymentProviderConfigRepository,
  ) {}

  async listConfigs(tenantId: string, companyId: string): Promise<PaymentProviderConfigView[]> {
    await this.tenantService.getById(tenantId);
    const company = await this.companyService.getById(companyId, tenantId);
    const rows = await this.configRepository.findListedByCompany(tenantId, company.id);
    return rows.map((row) => this.toView(row, this.companyDisplayName(company)));
  }

  async getActiveConfig(
    tenantId: string,
    companyId: string,
    provider: PaymentProviderName,
  ): Promise<PaymentProviderConfigEntity | null> {
    const [active] = await this.configRepository.findActiveByCompanyAndProvider(tenantId, companyId, provider);
    return active ?? null;
  }

  async createConfig(input: {
    tenantId: string;
    companyId: string;
    provider: PaymentProviderName;
    environment: PaymentProviderEnvironment;
    credentials?: Record<string, string>;
    actorUserId: string;
  }): Promise<PaymentProviderConfigView> {
    await this.tenantService.getById(input.tenantId);
    const company = await this.companyService.getById(input.companyId, input.tenantId);
    const credentials = this.normalizeCredentials(input.credentials);
    await this.inactivateActiveConfigs(input.tenantId, company.id, input.provider, input.actorUserId);

    const saved = await this.configRepository.save(
      this.configRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        companyId: company.id,
        provider: input.provider,
        environment: input.environment,
        credentials,
        status: 'active',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      }),
    );
    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'payment_provider_config',
      entityId: saved.id,
      action: 'finance.provider_config.created',
      eventType: 'finance.write',
      metadata: { companyId: company.id, provider: saved.provider, environment: saved.environment },
    });
    return this.toView(saved, this.companyDisplayName(company));
  }

  async updateConfig(
    id: string,
    input: {
      tenantId: string;
      environment?: PaymentProviderEnvironment;
      credentials?: Record<string, string>;
      status?: 'active' | 'inactive';
      actorUserId: string;
    },
  ): Promise<PaymentProviderConfigView> {
    const entity = await this.getConfig(input.tenantId, id);
    const company = await this.companyService.getById(entity.companyId, input.tenantId);
    if (input.environment !== undefined) {
      entity.environment = input.environment;
    }
    if (input.credentials !== undefined) {
      entity.credentials = this.normalizeCredentials(input.credentials);
    }
    if (input.status !== undefined && input.status !== entity.status) {
      if (input.status === 'active') {
        await this.inactivateActiveConfigs(input.tenantId, entity.companyId, entity.provider, input.actorUserId, entity.id);
      }
      entity.status = input.status;
    }
    entity.updatedBy = input.actorUserId;
    const saved = await this.configRepository.save(entity);
    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'payment_provider_config',
      entityId: saved.id,
      action: 'finance.provider_config.updated',
      eventType: 'finance.write',
      metadata: { companyId: entity.companyId, provider: entity.provider, environment: entity.environment },
    });
    return this.toView(saved, this.companyDisplayName(company));
  }

  private async getConfig(tenantId: string, id: string): Promise<PaymentProviderConfigEntity> {
    const entity = await this.configRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Payment provider config '${id}' was not found.`);
    }
    return entity;
  }

  private async inactivateActiveConfigs(
    tenantId: string,
    companyId: string,
    provider: PaymentProviderName,
    actorUserId: string,
    exceptId?: string,
  ): Promise<void> {
    const activeRows = await this.configRepository.findActiveByCompanyAndProvider(tenantId, companyId, provider);
    for (const row of activeRows) {
      if (row.id === exceptId) {
        continue;
      }
      row.status = 'inactive';
      row.updatedBy = actorUserId;
      await this.configRepository.save(row);
    }
  }

  private normalizeCredentials(credentials: Record<string, string> | undefined): Record<string, string> {
    if (credentials === undefined || credentials === null) {
      return {};
    }
    if (typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw new DomainValidationError('As credenciais devem ser um objeto de chave e valor.');
    }
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        continue;
      }
      normalized[trimmedKey] = String(value ?? '');
    }
    return normalized;
  }

  private toView(row: PaymentProviderConfigEntity, companyName: string): PaymentProviderConfigView {
    return {
      id: row.id,
      companyId: row.companyId,
      companyName,
      provider: row.provider,
      environment: row.environment,
      credentials: row.credentials ?? {},
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  private companyDisplayName(company: { legalName: string; tradeName: string | null }): string {
    return company.tradeName?.trim() || company.legalName;
  }
}
