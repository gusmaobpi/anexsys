import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerService } from 'src/modules/crm/application/customer/customer.service';
import { CustomerStatus, CustomerType } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

function buildTransactionDataSource() {
  return {
    async transaction(callback: (manager: any) => Promise<unknown>) {
      const manager = {
        create(_entity: unknown, payload: Record<string, unknown>) {
          return payload;
        },
        async save(_entity: unknown, payload: Record<string, unknown>) {
          return payload;
        },
        async findOne() {
          return null;
        },
      };

      return callback(manager);
    },
  };
}

describe('CustomerService', () => {
  it('creates a tenant-wide customer, primary contact, interaction, and audit entry', async () => {
    const auditCalls: Array<Record<string, unknown>> = [];
    const service = new CustomerService(
      buildTransactionDataSource() as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async findByTenantAndDocument() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async record(payload: Record<string, unknown>) { auditCalls.push(payload); } } as never,
      { async assertCustomerCanInactivate() {} } as never,
    );

    const customer = await service.create({
      tenantId: 'tenant-1',
      customerType: CustomerType.PERSON,
      fullName: ' Maria Silva ',
      mobilePhone: '(11) 99888-7766',
      cpf: '529.982.247-25',
      postalCode: '12345-678',
      street: 'Rua das Flores',
      number: '123',
      complement: 'Casa 2',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
      email: ' Maria@Example.com ',
      birthDate: '1990-05-20',
      observations: 'VIP',
      actorUserId: 'actor-1',
    });

    assert.equal(customer.legalName, 'Maria Silva');
    assert.equal(customer.branchId, null);
    assert.equal(customer.phone, '11998887766');
    assert.equal(customer.cpfCnpj, '52998224725');
    assert.equal(customer.email, 'maria@example.com');
    assert.equal(customer.postalCode, '12345678');
    assert.equal(customer.street, 'Rua das Flores');
    assert.equal(customer.number, '123');
    assert.equal(customer.country, 'Brasil');
    assert.equal(customer.status, CustomerStatus.ACTIVE);
    assert.equal(auditCalls[0]?.action, 'customer.created');
    assert.equal(auditCalls[0]?.branchId, null);
    assert.equal(auditCalls[0]?.newValues?.legalName, 'Maria Silva');
  });

  it('rejects future birth dates', async () => {
    const service = new CustomerService(
      buildTransactionDataSource() as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async findByTenantAndDocument() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          fullName: 'Maria Silva',
          mobilePhone: '(11) 99888-7766',
          postalCode: '12345-678',
          street: 'Rua das Flores',
          number: '123',
          complement: 'Casa 2',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          country: 'Brasil',
          birthDate: '2999-01-01',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects invalid CPF values', async () => {
    const service = new CustomerService(
      buildTransactionDataSource() as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async findByTenantAndDocument() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          customerType: CustomerType.PERSON,
          fullName: 'Maria Silva',
          mobilePhone: '(11) 99888-7766',
          cpf: '123.456.789-01',
          postalCode: '12345-678',
          street: 'Rua das Flores',
          number: '123',
          complement: 'Casa 2',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          country: 'Brasil',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects duplicate CPF/CNPJ inside the same tenant', async () => {
    const service = new CustomerService(
      buildTransactionDataSource() as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async findByTenantAndDocument() {
          return { id: 'customer-existing' };
        },
      } as never,
      {} as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create({
          tenantId: 'tenant-1',
          customerType: CustomerType.COMPANY,
          fullName: 'Empresa XPTO',
          tradeName: 'XPTO',
          mobilePhone: '(11) 99888-7766',
          cpf: '04.252.011/0001-10',
          postalCode: '12345-678',
          street: 'Rua das Flores',
          number: '123',
          complement: 'Sala 4',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          country: 'Brasil',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('deactivates a customer through update status changes', async () => {
    const auditCalls: Array<Record<string, unknown>> = [];
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      branchId: null,
      customerType: CustomerType.PERSON,
      legalName: 'Maria Silva',
      tradeName: null,
      cpfCnpj: '52998224725',
      email: 'maria@example.com',
      phone: '11998887766',
      birthDate: null,
      observations: null,
      postalCode: '12345678',
      street: 'Rua das Flores',
      number: '123',
      complement: 'Casa 2',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
      status: CustomerStatus.ACTIVE,
    };
    const service = new CustomerService(
      {
        async transaction(callback: (manager: any) => Promise<unknown>) {
          const manager = {
            async save(_entity: unknown, payload: Record<string, unknown>) {
              return payload;
            },
            async findOne() {
              return {
                contactName: 'Maria Silva',
                email: 'maria@example.com',
                phone: '11998887766',
                updatedBy: 'actor-1',
              };
            },
            create(_entity: unknown, payload: Record<string, unknown>) {
              return payload;
            },
          };

          return callback(manager);
        },
      } as never,
      {
        async findById() {
          return customer;
        },
        async findByTenantAndDocument() {
          return customer;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { async record(payload: Record<string, unknown>) { auditCalls.push(payload); } } as never,
      { async assertCustomerCanInactivate() {} } as never,
    );

    const updated = await service.update('customer-1', 'tenant-1', {
      status: CustomerStatus.INACTIVE,
      actorUserId: 'actor-1',
    });

    assert.equal(updated.status, CustomerStatus.INACTIVE);
    assert.equal(updated.branchId, null);
    assert.equal(auditCalls[0]?.action, 'customer.deactivated');
    assert.equal(auditCalls[0]?.previousValues?.status, CustomerStatus.ACTIVE);
  });

  it('blocks customer inactivation when dependency validation fails', async () => {
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      branchId: null,
      customerType: CustomerType.PERSON,
      legalName: 'Maria Silva',
      tradeName: null,
      cpfCnpj: '52998224725',
      email: 'maria@example.com',
      phone: '11998887766',
      birthDate: null,
      observations: null,
      postalCode: '12345678',
      street: 'Rua das Flores',
      number: '123',
      complement: 'Casa 2',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
      status: CustomerStatus.ACTIVE,
    };
    const service = new CustomerService(
      buildTransactionDataSource() as never,
      {
        async findById() {
          return customer;
        },
        async findByTenantAndDocument() {
          return customer;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { async record() {} } as never,
      {
        async assertCustomerCanInactivate() {
          throw new DomainValidationError('Cliente vinculado a service orders.');
        },
      } as never,
    );

    await assert.rejects(
      () => service.update('customer-1', 'tenant-1', { status: CustomerStatus.INACTIVE, actorUserId: 'actor-1' }),
      DomainValidationError,
    );
  });

  it('soft-deletes a customer without movement', async () => {
    const auditCalls: Array<Record<string, unknown>> = [];
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      legalName: 'Maria Silva',
      status: CustomerStatus.ACTIVE,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    };
    const service = new CustomerService(
      {} as never,
      {
        async findById() {
          return customer;
        },
        async save(payload: Record<string, unknown>) {
          return payload;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { async record(payload: Record<string, unknown>) { auditCalls.push(payload); } } as never,
      { async assertCustomerCanDelete() {} } as never,
    );

    await service.remove('customer-1', 'tenant-1', 'actor-1');
    assert.equal(customer.isDeleted, true);
    assert.equal(customer.deletedBy, 'actor-1');
    assert.equal(auditCalls[0]?.action, 'customer.deleted');
  });

  it('blocks customer deletion when dependency validation fails', async () => {
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      legalName: 'Maria Silva',
      status: CustomerStatus.ACTIVE,
      isDeleted: false,
    };
    const service = new CustomerService(
      {} as never,
      {
        async findById() {
          return customer;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { async record() {} } as never,
      {
        async assertCustomerCanDelete() {
          throw new DomainValidationError('Cliente vinculado a service orders.');
        },
      } as never,
    );

    await assert.rejects(
      () => service.remove('customer-1', 'tenant-1', 'actor-1'),
      DomainValidationError,
    );
    assert.equal(customer.isDeleted, false);
  });

  it('creates an imported customer when phone and address are missing', async () => {
    const service = new CustomerService(
      buildTransactionDataSource() as never,
      {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async findByTenantAndDocument() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      { async record() {} } as never,
      { async assertCustomerCanInactivate() {} } as never,
    );

    const customer = await service.create({
      tenantId: 'tenant-1',
      actorUserId: 'actor-1',
      allowIncompleteImport: true,
      customerType: CustomerType.PERSON,
      fullName: 'Daniela Caetano',
      mobilePhone: '11',
      postalCode: '',
      street: '',
      number: '',
      district: '',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
    });

    assert.equal(customer.legalName, 'Daniela Caetano');
    assert.equal(customer.phone, '');
    assert.equal(customer.postalCode, null);
    assert.equal(customer.street, null);
    assert.equal(customer.number, null);
    assert.equal(customer.district, null);
    assert.equal(customer.city, 'São Paulo');
  });
});
