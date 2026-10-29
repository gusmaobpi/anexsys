import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { CompanyStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { readBrandImageUpdate } from 'src/shared/brand-image';
import { CompanyEntity } from '../../infrastructure/persistence/entities/company.entity';
import { CompanyRepository } from '../../infrastructure/persistence/repositories/company.repository';

export type CompanyFiscalInput = {
  legalName?: string;
  tradeName?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  logoMimeType?: string | null;
  logoBase64?: string | null;
};

export type CreateCompanyInput = CompanyFiscalInput & {
  tenantId: string;
  legalName: string;
  actorUserId: string;
};

export type UpdateCompanyInput = CompanyFiscalInput & {
  actorUserId: string;
  status?: CompanyStatus;
};

@Injectable()
export class CompanyService {
  constructor(
    @Inject(CompanyRepository)
    private readonly companyRepository: CompanyRepository,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  async create(input: CreateCompanyInput): Promise<CompanyEntity> {
    await this.tenantService.getById(input.tenantId);
    const legalName = input.legalName.trim();
    if (!legalName) {
      throw new DomainValidationError('A razão social é obrigatória.');
    }
    const profile = this.normalizeFiscalProfile(input);
    if (profile.cnpj) {
      const existing = await this.companyRepository.findByTenantAndCnpj(input.tenantId, profile.cnpj);
      if (existing) {
        throw new DomainValidationError('Já existe uma empresa com este CNPJ nesta Conta.');
      }
    }

    const existingCompanies = await this.companyRepository.findByTenant(input.tenantId);
    const company = this.companyRepository.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      legalName,
      ...profile,
      country: profile.country ?? 'BR',
      ...this.logoColumns(input.logoMimeType, input.logoBase64),
      isDefault: existingCompanies.length === 0,
      status: CompanyStatus.ACTIVE,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });
    const saved = await this.companyRepository.save(company);

    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: 'company',
      entityId: saved.id,
      action: 'company.created',
      eventType: 'governance.write',
      metadata: { cnpj: saved.cnpj, isDefault: saved.isDefault },
    });

    return saved;
  }

  async listByTenant(tenantId: string): Promise<CompanyEntity[]> {
    await this.tenantService.getById(tenantId);
    return this.companyRepository.findByTenant(tenantId);
  }

  async getById(id: string, tenantId: string): Promise<CompanyEntity> {
    const company = await this.companyRepository.findById(id);
    if (!company || company.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Company '${id}' was not found.`);
    }
    return company;
  }

  async getOrCreateDefault(tenantId: string, actorUserId: string): Promise<CompanyEntity> {
    const existing = await this.companyRepository.findDefaultByTenant(tenantId);
    if (existing && existing.status !== CompanyStatus.INACTIVE) {
      return existing;
    }
    const listed = (await this.companyRepository.findByTenant(tenantId)).filter(
      (company) => company.status !== CompanyStatus.INACTIVE,
    );
    if (listed[0]) {
      return listed[0];
    }
    const tenant = await this.tenantService.getById(tenantId);
    return this.create({
      tenantId,
      legalName: tenant.legalName,
      tradeName: tenant.displayName,
      actorUserId,
    });
  }

  async update(id: string, tenantId: string, dto: UpdateCompanyInput): Promise<CompanyEntity> {
    const company = await this.getById(id, tenantId);
    const previousStatus = company.status ?? CompanyStatus.ACTIVE;
    if (dto.legalName !== undefined) {
      const legalName = dto.legalName.trim();
      if (!legalName) {
        throw new DomainValidationError('A razão social é obrigatória.');
      }
      company.legalName = legalName;
    }
    const profile = this.normalizeFiscalProfile(dto);
    if (dto.tradeName !== undefined) {
      company.tradeName = profile.tradeName;
    }
    if (dto.cnpj !== undefined) {
      if (profile.cnpj) {
        const existing = await this.companyRepository.findByTenantAndCnpj(tenantId, profile.cnpj);
        if (existing && existing.id !== company.id) {
          throw new DomainValidationError('Já existe uma empresa com este CNPJ nesta Conta.');
        }
      }
      company.cnpj = profile.cnpj;
    }
    if (dto.stateRegistration !== undefined) {
      company.stateRegistration = profile.stateRegistration;
    }
    if (dto.municipalRegistration !== undefined) {
      company.municipalRegistration = profile.municipalRegistration;
    }
    if (dto.email !== undefined) {
      company.email = profile.email;
    }
    if (dto.phone !== undefined) {
      company.phone = profile.phone;
    }
    if (dto.postalCode !== undefined) {
      company.postalCode = profile.postalCode;
    }
    if (dto.street !== undefined) {
      company.street = profile.street;
    }
    if (dto.number !== undefined) {
      company.number = profile.number;
    }
    if (dto.complement !== undefined) {
      company.complement = profile.complement;
    }
    if (dto.district !== undefined) {
      company.district = profile.district;
    }
    if (dto.city !== undefined) {
      company.city = profile.city;
    }
    if (dto.state !== undefined) {
      company.state = profile.state;
    }
    if (dto.country !== undefined) {
      company.country = profile.country;
    }
    const logo = readBrandImageUpdate(dto.logoMimeType, dto.logoBase64);
    if (logo !== undefined) {
      company.logoMimeType = logo?.mimeType ?? null;
      company.logoBase64 = logo?.contentBase64 ?? null;
    }
    if (dto.status !== undefined && dto.status !== previousStatus) {
      if (dto.status === CompanyStatus.INACTIVE) {
        await this.assertNotLastActiveCompany(tenantId, company.id);
        await this.dependencyValidationService.assertCompanyCanInactivate(tenantId, company.id);
      }
      company.status = dto.status;
    }
    company.updatedBy = dto.actorUserId;
    const saved = await this.companyRepository.save(company);
    if (dto.status !== undefined && dto.status !== previousStatus) {
      await this.auditService.record({
        tenantId,
        actorUserId: dto.actorUserId,
        entityType: 'company',
        entityId: saved.id,
        action: saved.status === CompanyStatus.INACTIVE ? 'company.deactivated' : 'company.reactivated',
        eventType: 'governance.write',
        metadata: { previousStatus, currentStatus: saved.status },
      });
    }
    return saved;
  }

  async remove(id: string, tenantId: string, actorUserId: string): Promise<CompanyEntity> {
    const company = await this.getById(id, tenantId);
    if ((company.status ?? CompanyStatus.ACTIVE) !== CompanyStatus.INACTIVE) {
      await this.assertNotLastActiveCompany(tenantId, company.id);
    }
    await this.dependencyValidationService.assertCompanyCanDelete(tenantId, company.id);
    company.isDeleted = true;
    company.deletedAt = new Date();
    company.deletedBy = actorUserId;
    company.updatedBy = actorUserId;
    const saved = await this.companyRepository.save(company);
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'company',
      entityId: saved.id,
      action: 'company.deleted',
      eventType: 'governance.write',
      metadata: { legalName: saved.legalName, cnpj: saved.cnpj },
    });
    return saved;
  }

  private async assertNotLastActiveCompany(tenantId: string, companyId: string): Promise<void> {
    const companies = await this.companyRepository.findByTenant(tenantId);
    const otherActive = companies.filter(
      (item) => item.id !== companyId && (item.status ?? CompanyStatus.ACTIVE) !== CompanyStatus.INACTIVE,
    );
    if (otherActive.length === 0) {
      throw new DomainValidationError(
        'A Conta precisa ficar com pelo menos uma Empresa ativa. Cadastre outra Empresa antes de inativar ou excluir esta.',
      );
    }
  }

  private normalizeFiscalProfile(input: CompanyFiscalInput) {
    return {
      tradeName: this.normalizeOptionalText(input.tradeName),
      cnpj: this.normalizeCnpj(input.cnpj),
      stateRegistration: this.normalizeOptionalText(input.stateRegistration),
      municipalRegistration: this.normalizeOptionalText(input.municipalRegistration),
      email: this.normalizeEmail(input.email),
      phone: this.normalizeOptionalText(input.phone),
      postalCode: this.normalizePostalCode(input.postalCode),
      street: this.normalizeOptionalText(input.street),
      number: this.normalizeOptionalText(input.number),
      complement: this.normalizeOptionalText(input.complement),
      district: this.normalizeOptionalText(input.district),
      city: this.normalizeOptionalText(input.city),
      state: this.normalizeState(input.state),
      country: this.normalizeOptionalText(input.country),
    };
  }

  private logoColumns(mimeType?: string | null, contentBase64?: string | null) {
    const logo = readBrandImageUpdate(mimeType, contentBase64);
    if (!logo) {
      return { logoMimeType: null, logoBase64: null };
    }
    return { logoMimeType: logo.mimeType, logoBase64: logo.contentBase64 };
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeEmail(value?: string | null): string | null {
    const email = this.normalizeOptionalText(value);
    return email ? email.toLowerCase() : null;
  }

  private normalizePostalCode(value?: string | null): string | null {
    if (value === undefined || value === null || !value.trim()) {
      return null;
    }
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 8) {
      throw new DomainValidationError('O CEP deve ter 8 dígitos.');
    }
    return digits;
  }

  private normalizeState(value?: string | null): string | null {
    const state = this.normalizeOptionalText(value);
    return state ? state.toUpperCase() : null;
  }

  private normalizeCnpj(value?: string | null): string | null {
    if (value === undefined || value === null || !value.trim()) {
      return null;
    }
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 14) {
      throw new DomainValidationError('O CNPJ deve ter 14 dígitos.');
    }
    if (!this.isValidCnpj(digits)) {
      throw new DomainValidationError('O CNPJ informado é inválido.');
    }
    return digits;
  }

  private isValidCnpj(value: string): boolean {
    if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) {
      return false;
    }

    const digits = value.split('').map(Number);
    const firstCheck = this.calculateWeightedCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondCheck = this.calculateWeightedCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return firstCheck === digits[12] && secondCheck === digits[13];
  }

  private calculateWeightedCheckDigit(baseDigits: number[], weights: number[]): number {
    const sum = baseDigits.reduce((total, digit, index) => total + digit * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }
}
