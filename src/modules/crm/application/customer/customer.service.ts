import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import {
  CustomerInteractionType,
  CustomerStatus,
  CustomerType,
  InteractionChannel,
} from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { CustomerEntity } from '../../infrastructure/persistence/entities/customer.entity';
import { CustomerContactEntity } from '../../infrastructure/persistence/entities/customer-contact.entity';
import { CustomerInteractionEntity } from '../../infrastructure/persistence/entities/customer-interaction.entity';
import { CustomerContactRepository } from '../../infrastructure/persistence/repositories/customer-contact.repository';
import { CustomerInteractionRepository } from '../../infrastructure/persistence/repositories/customer-interaction.repository';
import { CustomerRepository, CustomerSearchFilters } from '../../infrastructure/persistence/repositories/customer.repository';
import { DEFAULT_CONSENT_TEXT } from 'src/modules/whatsapp/application/whatsapp.rules';
import { CreateCustomerDto } from '../../contracts/dto/create-customer.dto';
import { UpdateCustomerDto } from '../../contracts/dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(CustomerRepository)
    private readonly customerRepository: CustomerRepository,
    @Inject(CustomerContactRepository)
    private readonly customerContactRepository: CustomerContactRepository,
    @Inject(CustomerInteractionRepository)
    private readonly customerInteractionRepository: CustomerInteractionRepository,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  async create(dto: CreateCustomerDto): Promise<CustomerEntity> {
    await this.tenantService.getById(dto.tenantId);

    const normalizedPhone = this.normalizePhone(dto.mobilePhone);
    const customerType = dto.customerType ?? CustomerType.PERSON;
    const normalizedEmail = this.normalizeEmail(dto.email);
    const normalizedCpf = this.normalizeCpfOrCnpj(dto.cpf, customerType);
    const normalizedPostalCode = this.normalizePostalCode(dto.postalCode);
    const normalizedBirthDate = this.normalizeBirthDate(dto.birthDate);
    const normalizedAddress = this.normalizeAddress(dto);
    await this.assertUniqueDocument(dto.tenantId, normalizedCpf);

    const customer = this.customerRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      branchId: null,
      customerType,
      legalName: dto.fullName.trim(),
      tradeName: dto.tradeName?.trim() || null,
      cpfCnpj: normalizedCpf,
      email: normalizedEmail,
      phone: normalizedPhone,
      birthDate: normalizedBirthDate,
      observations: dto.observations?.trim() || null,
      street: normalizedAddress.street,
      complement: normalizedAddress.complement,
      number: normalizedAddress.number,
      district: normalizedAddress.district,
      city: normalizedAddress.city,
      state: normalizedAddress.state,
      postalCode: normalizedPostalCode,
      country: normalizedAddress.country,
      status: CustomerStatus.ACTIVE,
      whatsappConsent: dto.whatsappConsent === true,
      whatsappConsentAt: dto.whatsappConsent === true ? new Date() : null,
      whatsappConsentText: dto.whatsappConsent === true ? await this.currentConsentText(dto.tenantId) : null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const savedCustomer = await this.dataSource.transaction(async (manager) => {
      const persistedCustomer = manager.create(CustomerEntity, customer);
      await manager.save(CustomerEntity, persistedCustomer);

      const contact = manager.create(CustomerContactEntity, this.buildPrimaryContact(persistedCustomer, dto.actorUserId));
      await manager.save(CustomerContactEntity, contact);

      const interaction = manager.create(
        CustomerInteractionEntity,
        this.buildInteraction({
          tenantId: persistedCustomer.tenantId,
          customerId: persistedCustomer.id,
          actorUserId: dto.actorUserId,
          type: CustomerInteractionType.PROFILE_CREATED,
          summary: 'Customer profile created.',
          detail: `Customer '${persistedCustomer.legalName}' was created.`,
        }),
      );
      await manager.save(CustomerInteractionEntity, interaction);

      return persistedCustomer;
    });

    await this.auditService.record({
      tenantId: savedCustomer.tenantId,
      branchId: null,
      actorUserId: dto.actorUserId,
      entityType: 'customer',
      entityId: savedCustomer.id,
      action: 'customer.created',
      eventType: 'crm.write',
      metadata: { customerType: savedCustomer.customerType, phone: savedCustomer.phone },
      newValues: this.buildAuditSnapshot(savedCustomer),
    });

    return savedCustomer;
  }

  async update(id: string, tenantId: string, dto: UpdateCustomerDto): Promise<CustomerEntity> {
    const customer = await this.getById(id, tenantId);
    const previousValues = this.buildAuditSnapshot(customer);
    const customerTypeBeforeUpdate = customer.customerType;

    const previousStatus = customer.status;
    if (dto.status === CustomerStatus.BLOCKED) {
      throw new DomainValidationError('Blocked status management is outside Sprint 2 scope.');
    }

    if (dto.customerType) {
      customer.customerType = dto.customerType;
      if (dto.cpf === undefined && customer.cpfCnpj) {
        customer.cpfCnpj = this.normalizeCpfOrCnpj(customer.cpfCnpj, customer.customerType);
      }
    }

    if (dto.fullName !== undefined) {
      customer.legalName = dto.fullName.trim();
    }

    if (dto.tradeName !== undefined) {
      customer.tradeName = dto.tradeName?.trim() || null;
    }

    if (dto.mobilePhone !== undefined) {
      customer.phone = this.normalizePhone(dto.mobilePhone);
    }

    if (dto.cpf !== undefined) {
      customer.cpfCnpj = this.normalizeCpfOrCnpj(dto.cpf, customer.customerType);
      await this.assertUniqueDocument(tenantId, customer.cpfCnpj, customer.id);
    }

    if (dto.email !== undefined) {
      customer.email = this.normalizeEmail(dto.email);
    }

    if (dto.postalCode !== undefined) {
      if (dto.postalCode === null) {
        throw new DomainValidationError('Postal code is required.');
      }
      customer.postalCode = this.normalizePostalCode(dto.postalCode);
    }

    if (dto.birthDate !== undefined) {
      customer.birthDate = this.normalizeBirthDate(dto.birthDate);
    }

    if (dto.observations !== undefined) {
      customer.observations = dto.observations?.trim() || null;
    }

    this.applyAddressUpdates(customer, dto);
    customer.branchId = null;

    if (dto.whatsappConsent !== undefined && dto.whatsappConsent !== customer.whatsappConsent) {
      customer.whatsappConsent = dto.whatsappConsent;
      if (dto.whatsappConsent) {
        customer.whatsappConsentAt = new Date();
        customer.whatsappConsentText = await this.currentConsentText(tenantId);
      }
    }

    if (dto.status !== undefined) {
      if (dto.status === CustomerStatus.INACTIVE && previousStatus !== CustomerStatus.INACTIVE) {
        await this.dependencyValidationService.assertCustomerCanInactivate(tenantId, id);
      }
      customer.status = dto.status;
    }

    customer.updatedBy = dto.actorUserId;

    const savedCustomer = await this.dataSource.transaction(async (manager) => {
      const persistedCustomer = await manager.save(CustomerEntity, customer);
      const existingPrimaryContact = await manager.findOne(CustomerContactEntity, {
        where: { tenantId, customerId: customer.id, isPrimary: true, isDeleted: false },
      });

      if (existingPrimaryContact) {
        existingPrimaryContact.contactName = persistedCustomer.legalName;
        existingPrimaryContact.email = persistedCustomer.email;
        existingPrimaryContact.phone = persistedCustomer.phone;
        existingPrimaryContact.updatedBy = dto.actorUserId;
        await manager.save(CustomerContactEntity, existingPrimaryContact);
      } else {
        const contact = manager.create(
          CustomerContactEntity,
          this.buildPrimaryContact(persistedCustomer, dto.actorUserId),
        );
        await manager.save(CustomerContactEntity, contact);
      }

      const interaction = manager.create(
        CustomerInteractionEntity,
        this.buildInteraction({
          tenantId: persistedCustomer.tenantId,
          customerId: persistedCustomer.id,
          actorUserId: dto.actorUserId,
          type:
            dto.status !== undefined && dto.status !== previousStatus
              ? CustomerInteractionType.STATUS_CHANGED
              : CustomerInteractionType.PROFILE_UPDATED,
          summary:
            dto.status !== undefined && dto.status !== previousStatus
              ? `Customer status changed to ${persistedCustomer.status}.`
              : 'Customer profile updated.',
          detail:
            dto.status !== undefined && dto.status !== previousStatus
              ? `Customer '${persistedCustomer.legalName}' changed from ${previousStatus} to ${persistedCustomer.status}.`
              : `Customer '${persistedCustomer.legalName}' was updated.`,
        }),
      );
      await manager.save(CustomerInteractionEntity, interaction);

      return persistedCustomer;
    });

    await this.auditService.record({
      tenantId: savedCustomer.tenantId,
      branchId: null,
      actorUserId: dto.actorUserId,
      entityType: 'customer',
      entityId: savedCustomer.id,
      action:
        savedCustomer.status !== previousStatus
          ? savedCustomer.status === CustomerStatus.INACTIVE
            ? 'customer.deactivated'
            : 'customer.reactivated'
          : 'customer.updated',
      eventType: 'crm.write',
      metadata: {
        previousStatus,
        currentStatus: savedCustomer.status,
        previousCustomerType: customerTypeBeforeUpdate,
        currentCustomerType: savedCustomer.customerType,
      },
      previousValues,
      newValues: this.buildAuditSnapshot(savedCustomer),
    });

    return savedCustomer;
  }

  async search(tenantId: string, filters: CustomerSearchFilters): Promise<CustomerEntity[]> {
    await this.tenantService.getById(tenantId);
    return this.customerRepository.search(tenantId, filters);
  }

  async getById(id: string, tenantId: string): Promise<CustomerEntity> {
    const customer = await this.customerRepository.findById(id);
    if (!customer || customer.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Customer '${id}' was not found.`);
    }

    return customer;
  }

  async remove(id: string, tenantId: string, actorUserId: string): Promise<void> {
    const customer = await this.getById(id, tenantId);
    await this.dependencyValidationService.assertCustomerCanDelete(tenantId, id);
    const previousValues = this.buildAuditSnapshot(customer);
    customer.isDeleted = true;
    customer.deletedAt = new Date();
    customer.deletedBy = actorUserId;
    customer.updatedBy = actorUserId;
    await this.customerRepository.save(customer);
    await this.auditService.record({
      tenantId,
      branchId: null,
      actorUserId,
      entityType: 'customer',
      entityId: customer.id,
      action: 'customer.deleted',
      eventType: 'crm.write',
      metadata: { legalName: customer.legalName },
      previousValues,
      newValues: this.buildAuditSnapshot(customer),
    });
  }

  async getProfile(tenantId: string, customerId: string): Promise<{
    customer: CustomerEntity;
    contacts: CustomerContactEntity[];
    interactions: CustomerInteractionEntity[];
    auditTrail: Awaited<ReturnType<AuditService['listByEntity']>>;
  }> {
    const customer = await this.getById(customerId, tenantId);
    const [contacts, interactions, auditTrail] = await Promise.all([
      this.customerContactRepository.findByCustomer(tenantId, customerId),
      this.customerInteractionRepository.findByCustomer(tenantId, customerId),
      this.auditService.listByEntity(tenantId, 'customer', customerId, 100),
    ]);

    return {
      customer,
      contacts,
      interactions,
      auditTrail,
    };
  }

  private normalizePhone(value: string): string {
    const normalized = value.replace(/\D/g, '');
    if (normalized.length < 10 || normalized.length > 13) {
      throw new DomainValidationError('Customer mobile phone / WhatsApp with DDD is required.');
    }

    return normalized;
  }

  private normalizeEmail(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    return value.trim().toLowerCase() || null;
  }

  private normalizeCpfOrCnpj(value: string | null | undefined, customerType: CustomerType): string | null {
    if (value == null || value === '') {
      return null;
    }

    const normalized = value.replace(/\D/g, '');
    if (customerType === CustomerType.COMPANY) {
      if (normalized.length !== 14) {
        throw new DomainValidationError('Company customers must use a 14-digit CNPJ.');
      }
      if (!this.isValidCnpj(normalized)) {
        throw new DomainValidationError('Company customers must use a valid CNPJ.');
      }
      return normalized;
    }

    if (normalized.length !== 11) {
      throw new DomainValidationError('Person customers must use an 11-digit CPF.');
    }
    if (!this.isValidCpf(normalized)) {
      throw new DomainValidationError('Person customers must use a valid CPF.');
    }

    return normalized;
  }

  private normalizePostalCode(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.replace(/\D/g, '');
    if (normalized.length !== 8) {
      throw new DomainValidationError('Postal code must contain 8 digits.');
    }

    return normalized;
  }

  private buildAuditSnapshot(customer: CustomerEntity) {
    return {
      customerType: customer.customerType,
      legalName: customer.legalName,
      tradeName: customer.tradeName,
      cpfCnpj: customer.cpfCnpj,
      email: customer.email,
      phone: customer.phone,
      birthDate: customer.birthDate,
      postalCode: customer.postalCode,
      street: customer.street,
      number: customer.number,
      district: customer.district,
      city: customer.city,
      state: customer.state,
      country: customer.country,
      status: customer.status,
      whatsappConsent: customer.whatsappConsent,
    };
  }

  private async currentConsentText(tenantId: string): Promise<string> {
    try {
      const rows = await this.dataSource.query(`SELECT consent_text FROM whatsapp_settings WHERE tenant_id = $1`, [tenantId]);
      const text = rows[0]?.consent_text;
      return typeof text === 'string' && text.trim() ? text.trim() : DEFAULT_CONSENT_TEXT;
    } catch {
      return DEFAULT_CONSENT_TEXT;
    }
  }

  private normalizeBirthDate(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const birthDate = new Date(value);
    if (Number.isNaN(birthDate.getTime())) {
      throw new DomainValidationError('Birth date is invalid.');
    }
    if (birthDate.getTime() > Date.now()) {
      throw new DomainValidationError('Birth date cannot be in the future.');
    }

    return value;
  }

  private normalizeAddress(input: Pick<CreateCustomerDto, 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'country'>) {
    return {
      street: this.normalizeRequiredAddressField(input.street, 'Street'),
      number: this.normalizeRequiredAddressField(input.number, 'Number'),
      complement: this.normalizeOptionalAddressField(input.complement),
      district: this.normalizeRequiredAddressField(input.district, 'District'),
      city: this.normalizeRequiredAddressField(input.city, 'City'),
      state: this.normalizeRequiredAddressField(input.state, 'State'),
      country: this.normalizeRequiredAddressField(input.country, 'Country'),
    };
  }

  private applyAddressUpdates(customer: CustomerEntity, dto: UpdateCustomerDto): void {
    if (dto.street !== undefined) {
      customer.street = this.normalizeUpdatedAddressField(dto.street, 'Street');
    }
    if (dto.number !== undefined) {
      customer.number = this.normalizeUpdatedAddressField(dto.number, 'Number');
    }
    if (dto.complement !== undefined) {
      customer.complement = this.normalizeOptionalAddressField(dto.complement);
    }
    if (dto.district !== undefined) {
      customer.district = this.normalizeUpdatedAddressField(dto.district, 'District');
    }
    if (dto.city !== undefined) {
      customer.city = this.normalizeUpdatedAddressField(dto.city, 'City');
    }
    if (dto.state !== undefined) {
      customer.state = this.normalizeUpdatedAddressField(dto.state, 'State');
    }
    if (dto.country !== undefined) {
      customer.country = this.normalizeUpdatedAddressField(dto.country, 'Country');
    }
  }

  private normalizeRequiredAddressField(value: string | null | undefined, label: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new DomainValidationError(`${label} is required.`);
    }
    return normalized;
  }

  private normalizeUpdatedAddressField(value: string | null | undefined, label: string): string {
    if (value == null) {
      throw new DomainValidationError(`${label} is required.`);
    }
    return this.normalizeRequiredAddressField(value, label);
  }

  private normalizeOptionalAddressField(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private async assertUniqueDocument(tenantId: string, cpfCnpj: string | null, currentCustomerId?: string): Promise<void> {
    if (!cpfCnpj) {
      return;
    }

    const existingCustomer = await this.customerRepository.findByTenantAndDocument(tenantId, cpfCnpj);
    if (existingCustomer && existingCustomer.id !== currentCustomerId) {
      throw new DomainValidationError('Another customer with the same CPF/CNPJ already exists in the tenant.');
    }
  }

  private isValidCpf(value: string): boolean {
    if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) {
      return false;
    }

    const digits = value.split('').map(Number);
    const firstCheck = this.calculateBrazilianCheckDigit(digits.slice(0, 9), 10);
    const secondCheck = this.calculateBrazilianCheckDigit(digits.slice(0, 10), 11);
    return firstCheck === digits[9] && secondCheck === digits[10];
  }

  private isValidCnpj(value: string): boolean {
    if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) {
      return false;
    }

    const digits = value.split('').map(Number);
    const firstCheck = this.calculateWeightedCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondCheck = this.calculateWeightedCheckDigit(
      digits.slice(0, 13),
      [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    return firstCheck === digits[12] && secondCheck === digits[13];
  }

  private calculateBrazilianCheckDigit(baseDigits: number[], initialWeight: number): number {
    const sum = baseDigits.reduce((total, digit, index) => total + digit * (initialWeight - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  }

  private calculateWeightedCheckDigit(baseDigits: number[], weights: number[]): number {
    const sum = baseDigits.reduce((total, digit, index) => total + digit * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  private buildPrimaryContact(customer: CustomerEntity, actorUserId: string): Partial<CustomerContactEntity> {
    return {
      id: randomUUID(),
      tenantId: customer.tenantId,
      customerId: customer.id,
      contactName: customer.legalName,
      contactRole: 'primary',
      email: customer.email,
      phone: customer.phone,
      isPrimary: true,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };
  }

  private buildInteraction(input: {
    tenantId: string;
    customerId: string;
    actorUserId: string;
    type: CustomerInteractionType;
    summary: string;
    detail: string | null;
  }): Partial<CustomerInteractionEntity> {
    return {
      id: randomUUID(),
      tenantId: input.tenantId,
      customerId: input.customerId,
      serviceOrderId: null,
      interactionType: input.type,
      channel: InteractionChannel.SYSTEM,
      occurredAt: new Date(),
      summary: input.summary,
      detail: input.detail,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    };
  }
}
