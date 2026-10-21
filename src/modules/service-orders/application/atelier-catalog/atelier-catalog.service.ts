import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { CompanyService } from 'src/modules/company/application/company/company.service';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { MeasurementCatalogStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { AtelierServiceEntity } from '../../infrastructure/persistence/entities/atelier-service.entity';
import { CompanyMinuteRateEntity } from '../../infrastructure/persistence/entities/company-minute-rate.entity';
import { GarmentProductEntity } from '../../infrastructure/persistence/entities/garment-product.entity';
import { GarmentProductServiceEntity } from '../../infrastructure/persistence/entities/garment-product-service.entity';
import { AtelierServiceRepository } from '../../infrastructure/persistence/repositories/atelier-service.repository';
import { CompanyMinuteRateRepository } from '../../infrastructure/persistence/repositories/company-minute-rate.repository';
import { GarmentProductRepository } from '../../infrastructure/persistence/repositories/garment-product.repository';
import { GarmentProductServiceRepository } from '../../infrastructure/persistence/repositories/garment-product-service.repository';

export type ProductServicePriceView = {
  id: string;
  productId: string;
  serviceId: string;
  productName: string;
  serviceName: string;
  suggestedPrice: string;
  estimatedMinutes: number;
  status: MeasurementCatalogStatus;
};

export type MinuteRateView = {
  id: string;
  companyId: string;
  companyName: string;
  valuePerMinute: string;
  status: MeasurementCatalogStatus;
  createdAt: Date;
};

export const DEFAULT_GARMENT_PRODUCTS = [
  'Calça',
  'Saia',
  'Vestido de festa',
  'Vestido',
  'Terno',
  'Paletó',
  'Camisa',
  'Jaqueta',
] as const;

export const DEFAULT_ATELIER_SERVICES = [
  'Bainha',
  'Ajuste lateral',
  'Ajuste de cintura',
  'Barra',
  'Troca de zíper',
] as const;

@Injectable()
export class AtelierCatalogService {
  constructor(
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(GarmentProductRepository)
    private readonly productRepository: GarmentProductRepository,
    @Inject(AtelierServiceRepository)
    private readonly serviceRepository: AtelierServiceRepository,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
    @Inject(GarmentProductServiceRepository)
    private readonly productServiceRepository: GarmentProductServiceRepository,
    @Inject(CompanyMinuteRateRepository)
    private readonly minuteRateRepository: CompanyMinuteRateRepository,
    @Inject(CompanyService)
    private readonly companyService: CompanyService,
  ) {}

  async listProducts(tenantId: string, actorUserId: string) {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    return this.productRepository.findListedByTenant(tenantId);
  }

  async listActiveProducts(tenantId: string, actorUserId: string) {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    return this.productRepository.findActiveByTenant(tenantId);
  }

  async listServices(tenantId: string, actorUserId: string) {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    return this.serviceRepository.findListedByTenant(tenantId);
  }

  async listActiveServices(tenantId: string, actorUserId: string) {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    return this.serviceRepository.findActiveByTenant(tenantId);
  }

  async getProduct(tenantId: string, id: string) {
    const entity = await this.productRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError('O produto não foi encontrado.');
    }
    return entity;
  }

  async getService(tenantId: string, id: string) {
    const entity = await this.serviceRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError('O serviço não foi encontrado.');
    }
    return entity;
  }

  async createProduct(input: { tenantId: string; displayName: string; actorUserId: string; sortOrder?: number }) {
    await this.tenantService.getById(input.tenantId);
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new DomainValidationError('O nome do produto é obrigatório.');
    }

    const code = this.normalizeCode(displayName);
    const existing = await this.productRepository.findByTenantAndCode(input.tenantId, code);
    if (existing) {
      throw new DomainValidationError(`Já existe o produto '${displayName}'.`);
    }

    const saved = await this.productRepository.save(
      this.productRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        code,
        displayName,
        sortOrder: input.sortOrder ?? 0,
        status: MeasurementCatalogStatus.ACTIVE,
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
      entityType: 'garment_product',
      entityId: saved.id,
      action: 'atelier.product.created',
      eventType: 'service_order.write',
      metadata: { code: saved.code },
    });
    return saved;
  }

  async updateProduct(
    id: string,
    input: {
      tenantId: string;
      displayName?: string;
      sortOrder?: number;
      status?: MeasurementCatalogStatus;
      actorUserId: string;
    },
  ) {
    const entity = await this.getProduct(input.tenantId, id);
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (!displayName) {
        throw new DomainValidationError('O nome do produto é obrigatório.');
      }
      const code = this.normalizeCode(displayName);
      const existing = await this.productRepository.findByTenantAndCode(input.tenantId, code);
      if (existing && existing.id !== entity.id) {
        throw new DomainValidationError(`Já existe o produto '${displayName}'.`);
      }
      entity.displayName = displayName;
      entity.code = code;
    }
    if (input.sortOrder !== undefined) {
      entity.sortOrder = input.sortOrder;
    }
    if (input.status !== undefined) {
      entity.status = input.status;
    }
    entity.updatedBy = input.actorUserId;
    const saved = await this.productRepository.save(entity);
    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'garment_product',
      entityId: saved.id,
      action: 'atelier.product.updated',
      eventType: 'service_order.write',
      metadata: { code: saved.code },
    });
    return saved;
  }

  async removeProduct(id: string, tenantId: string, actorUserId: string): Promise<void> {
    const entity = await this.getProduct(tenantId, id);
    await this.dependencyValidationService.assertGarmentProductCanDelete(tenantId, id);
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.deletedBy = actorUserId;
    entity.updatedBy = actorUserId;
    await this.productRepository.save(entity);
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'garment_product',
      entityId: entity.id,
      action: 'atelier.product.deleted',
      eventType: 'service_order.write',
      metadata: { code: entity.code },
    });
  }

  async createService(input: {
    tenantId: string;
    displayName: string;
    actorUserId: string;
    sortOrder?: number;
    difficultyGrade?: number | null;
  }) {
    await this.tenantService.getById(input.tenantId);
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new DomainValidationError('O nome do serviço é obrigatório.');
    }

    const code = this.normalizeCode(displayName);
    const existing = await this.serviceRepository.findByTenantAndCode(input.tenantId, code);
    if (existing) {
      throw new DomainValidationError(`Já existe o serviço '${displayName}'.`);
    }

    const saved = await this.serviceRepository.save(
      this.serviceRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        code,
        displayName,
        defaultPrice: null,
        sortOrder: input.sortOrder ?? 0,
        difficultyGrade: this.optionalDifficulty(input.difficultyGrade),
        status: MeasurementCatalogStatus.ACTIVE,
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
      entityType: 'atelier_service',
      entityId: saved.id,
      action: 'atelier.service.created',
      eventType: 'service_order.write',
      metadata: { code: saved.code },
    });
    return saved;
  }

  async updateService(
    id: string,
    input: {
      tenantId: string;
      displayName?: string;
      sortOrder?: number;
      status?: MeasurementCatalogStatus;
      difficultyGrade?: number | null;
      actorUserId: string;
    },
  ) {
    const entity = await this.getService(input.tenantId, id);
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (!displayName) {
        throw new DomainValidationError('O nome do serviço é obrigatório.');
      }
      const code = this.normalizeCode(displayName);
      const existing = await this.serviceRepository.findByTenantAndCode(input.tenantId, code);
      if (existing && existing.id !== entity.id) {
        throw new DomainValidationError(`Já existe o serviço '${displayName}'.`);
      }
      entity.displayName = displayName;
      entity.code = code;
    }
    if (input.sortOrder !== undefined) {
      entity.sortOrder = input.sortOrder;
    }
    if (input.status !== undefined) {
      entity.status = input.status;
    }
    if (input.difficultyGrade !== undefined) {
      entity.difficultyGrade = this.optionalDifficulty(input.difficultyGrade);
    }
    entity.updatedBy = input.actorUserId;
    const saved = await this.serviceRepository.save(entity);
    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'atelier_service',
      entityId: saved.id,
      action: 'atelier.service.updated',
      eventType: 'service_order.write',
      metadata: { code: saved.code },
    });
    return saved;
  }

  async removeService(id: string, tenantId: string, actorUserId: string): Promise<void> {
    const entity = await this.getService(tenantId, id);
    await this.dependencyValidationService.assertAtelierServiceCanDelete(tenantId, id);
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.deletedBy = actorUserId;
    entity.updatedBy = actorUserId;
    await this.serviceRepository.save(entity);
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'atelier_service',
      entityId: entity.id,
      action: 'atelier.service.deleted',
      eventType: 'service_order.write',
      metadata: { code: entity.code },
    });
  }

  async resolveActiveProduct(tenantId: string, productId: string, actorUserId: string): Promise<GarmentProductEntity> {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    const [product] = await this.productRepository.findByIds(tenantId, [productId]);
    if (!product) {
      throw new DomainValidationError('O produto está inativo ou não pertence a esta Conta.');
    }
    return product;
  }

  async resolveActiveService(tenantId: string, serviceId: string, actorUserId: string): Promise<AtelierServiceEntity> {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    const [service] = await this.serviceRepository.findByIds(tenantId, [serviceId]);
    if (!service) {
      throw new DomainValidationError('O serviço está inativo ou não pertence a esta Conta.');
    }
    return service;
  }

  async listProductServices(tenantId: string, actorUserId: string, productId?: string): Promise<ProductServicePriceView[]> {
    await this.ensureTenantDefaults(tenantId, actorUserId);
    const rows = productId
      ? await this.productServiceRepository.findActiveByProduct(tenantId, productId)
      : await this.productServiceRepository.findListedByTenant(tenantId);
    return this.toPriceViews(tenantId, rows);
  }

  async findActiveProductService(
    tenantId: string,
    productId: string,
    serviceId: string,
  ): Promise<GarmentProductServiceEntity | null> {
    return this.productServiceRepository.findActiveByProductAndService(tenantId, productId, serviceId);
  }

  async createProductService(input: {
    tenantId: string;
    productId: string;
    serviceId?: string;
    serviceName?: string;
    suggestedPrice: number;
    estimatedMinutes: number;
    actorUserId: string;
  }): Promise<ProductServicePriceView> {
    await this.tenantService.getById(input.tenantId);
    const product = await this.resolveActiveProduct(input.tenantId, input.productId, input.actorUserId);
    const service = await this.resolveOrCreateService(input);
    const suggestedPrice = this.requireSuggestedPrice(input.suggestedPrice);
    const estimatedMinutes = this.requireEstimatedMinutes(input.estimatedMinutes);

    const existing = await this.productServiceRepository.findByProductAndService(
      input.tenantId,
      product.id,
      service.id,
    );
    if (existing) {
      throw new DomainValidationError('Já existe preço para este produto e serviço.');
    }

    const saved = await this.productServiceRepository.save(
      this.productServiceRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        productId: product.id,
        serviceId: service.id,
        suggestedPrice,
        estimatedMinutes,
        status: MeasurementCatalogStatus.ACTIVE,
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
      entityType: 'garment_product_service',
      entityId: saved.id,
      action: 'atelier.product_service.created',
      eventType: 'service_order.write',
      metadata: { productId: product.id, serviceId: service.id },
    });
    return {
      id: saved.id,
      productId: product.id,
      serviceId: service.id,
      productName: product.displayName,
      serviceName: service.displayName,
      suggestedPrice: saved.suggestedPrice,
      estimatedMinutes: saved.estimatedMinutes,
      status: saved.status,
    };
  }

  async updateProductService(
    id: string,
    input: {
      tenantId: string;
      suggestedPrice?: number;
      estimatedMinutes?: number;
      status?: MeasurementCatalogStatus;
      actorUserId: string;
    },
  ): Promise<ProductServicePriceView> {
    const entity = await this.getProductService(input.tenantId, id);
    if (input.suggestedPrice !== undefined) {
      entity.suggestedPrice = this.requireSuggestedPrice(input.suggestedPrice);
    }
    if (input.estimatedMinutes !== undefined) {
      entity.estimatedMinutes = this.requireEstimatedMinutes(input.estimatedMinutes);
    }
    if (input.status !== undefined) {
      entity.status = input.status;
    }
    entity.updatedBy = input.actorUserId;
    const saved = await this.productServiceRepository.save(entity);
    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'garment_product_service',
      entityId: saved.id,
      action: 'atelier.product_service.updated',
      eventType: 'service_order.write',
      metadata: { productId: saved.productId, serviceId: saved.serviceId },
    });
    const [view] = await this.toPriceViews(input.tenantId, [saved]);
    return view;
  }

  async removeProductService(id: string, tenantId: string, actorUserId: string): Promise<void> {
    const entity = await this.getProductService(tenantId, id);
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.deletedBy = actorUserId;
    entity.updatedBy = actorUserId;
    await this.productServiceRepository.save(entity);
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'garment_product_service',
      entityId: entity.id,
      action: 'atelier.product_service.deleted',
      eventType: 'service_order.write',
      metadata: { productId: entity.productId, serviceId: entity.serviceId },
    });
  }

  private async getProductService(tenantId: string, id: string): Promise<GarmentProductServiceEntity> {
    const entity = await this.productServiceRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError('O preço deste produto e serviço não foi encontrado.');
    }
    return entity;
  }

  private async resolveOrCreateService(input: {
    tenantId: string;
    serviceId?: string;
    serviceName?: string;
    actorUserId: string;
  }): Promise<AtelierServiceEntity> {
    if (input.serviceId) {
      return this.resolveActiveService(input.tenantId, input.serviceId, input.actorUserId);
    }
    const displayName = input.serviceName?.trim() ?? '';
    if (!displayName) {
      throw new DomainValidationError('O serviço é obrigatório.');
    }
    const existing = await this.serviceRepository.findByTenantAndCode(input.tenantId, this.normalizeCode(displayName));
    if (existing) {
      if (existing.status !== MeasurementCatalogStatus.ACTIVE) {
        throw new DomainValidationError('O serviço está inativo ou não pertence a esta Conta.');
      }
      return existing;
    }
    return this.createService({
      tenantId: input.tenantId,
      displayName,
      actorUserId: input.actorUserId,
    });
  }

  async listMinuteRates(tenantId: string, companyId: string): Promise<MinuteRateView[]> {
    await this.tenantService.getById(tenantId);
    const company = await this.companyService.getById(companyId, tenantId);
    const rows = await this.minuteRateRepository.findListedByCompany(tenantId, company.id);
    return rows.map((row) => this.toMinuteRateView(row, this.companyDisplayName(company)));
  }

  async getActiveMinuteRate(tenantId: string, companyId: string): Promise<CompanyMinuteRateEntity | null> {
    const [active] = await this.minuteRateRepository.findActiveByCompany(tenantId, companyId);
    return active ?? null;
  }

  async createMinuteRate(input: {
    tenantId: string;
    companyId: string;
    valuePerMinute: number;
    actorUserId: string;
  }): Promise<MinuteRateView> {
    await this.tenantService.getById(input.tenantId);
    const company = await this.companyService.getById(input.companyId, input.tenantId);
    const valuePerMinute = this.requireMinuteRateValue(input.valuePerMinute);
    await this.inactivateActiveMinuteRates(input.tenantId, company.id, input.actorUserId);

    const saved = await this.minuteRateRepository.save(
      this.minuteRateRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        companyId: company.id,
        valuePerMinute,
        status: MeasurementCatalogStatus.ACTIVE,
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
      entityType: 'company_minute_rate',
      entityId: saved.id,
      action: 'atelier.minute_rate.created',
      eventType: 'service_order.write',
      metadata: { companyId: company.id },
    });
    return this.toMinuteRateView(saved, this.companyDisplayName(company));
  }

  async updateMinuteRate(
    id: string,
    input: {
      tenantId: string;
      valuePerMinute?: number;
      status?: MeasurementCatalogStatus;
      actorUserId: string;
    },
  ): Promise<MinuteRateView> {
    const entity = await this.getMinuteRate(input.tenantId, id);
    const company = await this.companyService.getById(entity.companyId, input.tenantId);
    if (input.valuePerMinute !== undefined) {
      entity.valuePerMinute = this.requireMinuteRateValue(input.valuePerMinute);
    }
    if (input.status !== undefined && input.status !== entity.status) {
      if (input.status === MeasurementCatalogStatus.ACTIVE) {
        await this.inactivateActiveMinuteRates(input.tenantId, entity.companyId, input.actorUserId, entity.id);
      }
      entity.status = input.status;
    }
    entity.updatedBy = input.actorUserId;
    const saved = await this.minuteRateRepository.save(entity);
    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'company_minute_rate',
      entityId: saved.id,
      action: 'atelier.minute_rate.updated',
      eventType: 'service_order.write',
      metadata: { companyId: entity.companyId },
    });
    return this.toMinuteRateView(saved, this.companyDisplayName(company));
  }

  private async getMinuteRate(tenantId: string, id: string): Promise<CompanyMinuteRateEntity> {
    const entity = await this.minuteRateRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Company minute rate '${id}' was not found.`);
    }
    return entity;
  }

  private async inactivateActiveMinuteRates(
    tenantId: string,
    companyId: string,
    actorUserId: string,
    exceptId?: string,
  ): Promise<void> {
    const activeRows = await this.minuteRateRepository.findActiveByCompany(tenantId, companyId);
    for (const row of activeRows) {
      if (row.id === exceptId) {
        continue;
      }
      row.status = MeasurementCatalogStatus.INACTIVE;
      row.updatedBy = actorUserId;
      await this.minuteRateRepository.save(row);
    }
  }

  private toMinuteRateView(row: CompanyMinuteRateEntity, companyName: string): MinuteRateView {
    return {
      id: row.id,
      companyId: row.companyId,
      companyName,
      valuePerMinute: row.valuePerMinute,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  private companyDisplayName(company: { legalName: string; tradeName: string | null }): string {
    return company.tradeName?.trim() || company.legalName;
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

  private requireMinuteRateValue(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new DomainValidationError('Informe o valor por minuto.');
    }
    return value.toFixed(2);
  }

  private async toPriceViews(
    tenantId: string,
    rows: GarmentProductServiceEntity[],
  ): Promise<ProductServicePriceView[]> {
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const serviceIds = [...new Set(rows.map((row) => row.serviceId))];
    const [products, services] = await Promise.all([
      this.productRepository.findListedByTenant(tenantId),
      this.serviceRepository.findListedByTenant(tenantId),
    ]);
    const productById = new Map(products.filter((item) => productIds.includes(item.id)).map((item) => [item.id, item]));
    const serviceById = new Map(services.filter((item) => serviceIds.includes(item.id)).map((item) => [item.id, item]));
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      serviceId: row.serviceId,
      productName: productById.get(row.productId)?.displayName ?? 'Produto',
      serviceName: serviceById.get(row.serviceId)?.displayName ?? 'Serviço',
      suggestedPrice: row.suggestedPrice,
      estimatedMinutes: row.estimatedMinutes,
      status: row.status,
    }));
  }

  private requireSuggestedPrice(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new DomainValidationError('O preço sugerido é obrigatório.');
    }
    return value.toFixed(2);
  }

  private requireEstimatedMinutes(value: number) {
    if (!Number.isInteger(value) || value < 1) {
      throw new DomainValidationError('O tempo previsto é obrigatório.');
    }
    return value;
  }

  private async ensureTenantDefaults(tenantId: string, actorUserId: string) {
    await this.tenantService.getById(tenantId);
    const [listedProducts, listedServices, existingProductCodes, existingServiceCodes] = await Promise.all([
      this.productRepository.findListedByTenant(tenantId),
      this.serviceRepository.findListedByTenant(tenantId),
      this.productRepository.findCodesByTenant(tenantId),
      this.serviceRepository.findCodesByTenant(tenantId),
    ]);

    const knownProductCodes = new Set(existingProductCodes);
    const missingProducts = DEFAULT_GARMENT_PRODUCTS.filter((item) => !knownProductCodes.has(this.normalizeCode(item)));
    if (missingProducts.length > 0) {
      await this.productRepository.saveMany(
        missingProducts.map((item, index) =>
          this.productRepository.create({
            id: randomUUID(),
            tenantId,
            code: this.normalizeCode(item),
            displayName: item,
            sortOrder: listedProducts.length + index + 1,
            status: MeasurementCatalogStatus.ACTIVE,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          }),
        ),
      );
    }

    const knownServiceCodes = new Set(existingServiceCodes);
    const missingServices = DEFAULT_ATELIER_SERVICES.filter((item) => !knownServiceCodes.has(this.normalizeCode(item)));
    if (missingServices.length > 0) {
      await this.serviceRepository.saveMany(
        missingServices.map((item, index) =>
          this.serviceRepository.create({
            id: randomUUID(),
            tenantId,
            code: this.normalizeCode(item),
            displayName: item,
            defaultPrice: null,
            sortOrder: listedServices.length + index + 1,
            status: MeasurementCatalogStatus.ACTIVE,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          }),
        ),
      );
    }
  }

  private normalizeCode(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }
}
