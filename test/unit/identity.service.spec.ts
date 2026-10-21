import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

describe('IdentityService', () => {
  it('creates a user and stores a hashed credential', async () => {
    const transactionSaves: Array<Record<string, unknown>> = [];
    const userIdentityRepository = {
      async findByTenantAndEmail() {
        return null;
      },
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async findById() {
        return null;
      },
    };
    const userCredentialRepository = {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
    };
    const tenantService = { async getById() { return { id: 'tenant-1' }; } };
    const branchService = {
      async getById() {
        return { id: 'branch-1', tenantId: 'tenant-1' };
      },
    };
    const passwordHasherService = {
      async hash(password: string) {
        return `hashed:${password}`;
      },
    };
    const auditService = { async record() {} };
    const dataSource = {
      async transaction<T>(callback: (manager: { create: <X>(_: unknown, payload: X) => X; save: <X>(entity: unknown, payload: X) => Promise<X>; }) => Promise<T>) {
        return callback({
          create: (_entity, payload) => payload,
          async save(entity, payload) {
            transactionSaves.push({ entity: String(entity), ...payload as Record<string, unknown> });
            return payload;
          },
        });
      },
    };

    const service = new IdentityService(
      dataSource as never,
      userIdentityRepository as never,
      userCredentialRepository as never,
      tenantService as never,
      branchService as never,
      passwordHasherService as never,
      auditService as never,
      { async findByEmail() { return null; }, create(payload: Record<string, unknown>) { return payload; }, async save(payload: Record<string, unknown>) { return payload; } } as never,
    );

    const user = await service.createUser({
      tenantId: 'tenant-1',
      defaultBranchId: 'branch-1',
      email: 'USER@EXAMPLE.COM',
      displayName: 'Main User',
      password: 'super-secret-password',
      actorUserId: 'actor-1',
    });

    assert.equal(user.email, 'user@example.com');
    assert.ok(transactionSaves.some((payload) => payload.passwordHash === 'hashed:super-secret-password'));
  });

  it('rejects deleting the signed-in user', async () => {
    const service = new IdentityService(
      { async transaction() { throw new Error('should not run'); } } as never,
      {
        async findById() {
          return { id: 'user-1', tenantId: 'tenant-1', email: 'ana@atelier.com', defaultBranchId: null };
        },
      } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
      { async record() {} } as never,
      {} as never,
    );

    await assert.rejects(
      () => service.removeUser('user-1', 'tenant-1', 'user-1'),
      DomainValidationError,
    );
  });

  it('rejects deleting the last remaining user of the tenant', async () => {
    const service = new IdentityService(
      { async query() { return []; }, async transaction() { throw new Error('should not run'); } } as never,
      {
        async findById() {
          return { id: 'user-2', tenantId: 'tenant-1', email: 'bruno@atelier.com', defaultBranchId: null };
        },
        async countLiveByTenant() {
          return 1;
        },
      } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
      { async record() {} } as never,
      {} as never,
    );

    await assert.rejects(
      () => service.removeUser('user-2', 'tenant-1', 'user-1'),
      DomainValidationError,
    );
  });

  it('soft-deletes another user of the same tenant', async () => {
    const saved: Record<string, unknown>[] = [];
    const service = new IdentityService(
      {
        async query() {
          return [];
        },
        async transaction<T>(callback: (manager: { save: (entity: unknown, payload: Record<string, unknown>) => Promise<Record<string, unknown>>; update: () => Promise<void>; createQueryBuilder: () => { update: () => { set: () => { where: () => { andWhere: () => { execute: () => Promise<void> } } } } } }) => Promise<T>) {
          return callback({
            async save(_entity, payload) {
              saved.push(payload);
              return payload;
            },
            async update() {},
            createQueryBuilder() {
              return {
                update() {
                  return {
                    set() {
                      return {
                        where() {
                          return {
                            andWhere() {
                              return { async execute() {} };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          });
        },
      } as never,
      {
        async findById() {
          return {
            id: 'user-2',
            tenantId: 'tenant-1',
            email: 'bruno@atelier.com',
            defaultBranchId: null,
            isDeleted: false,
          };
        },
        async countLiveByTenant() {
          return 2;
        },
      } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
      { async record() {} } as never,
      {} as never,
    );

    await service.removeUser('user-2', 'tenant-1', 'user-1');
    assert.equal(saved[0]?.isDeleted, true);
  });

  it('rejects deleting a user who already has business movement', async () => {
    const service = new IdentityService(
      {
        async query(sql: string) {
          if (sql.includes('MASTER_ADMINISTRATOR')) {
            return [];
          }
          if (sql.includes('service_orders')) {
            return [{ ok: 1 }];
          }
          return [];
        },
        async transaction() {
          throw new Error('should not run');
        },
      } as never,
      {
        async findById() {
          return { id: 'user-2', tenantId: 'tenant-1', email: 'bruno@atelier.com', defaultBranchId: null };
        },
        async countLiveByTenant() {
          return 2;
        },
      } as never,
      {} as never,
      { async getById() { return { id: 'tenant-1' }; } } as never,
      {} as never,
      {} as never,
      { async record() {} } as never,
      {} as never,
    );

    await assert.rejects(
      () => service.removeUser('user-2', 'tenant-1', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(String(error.message), /Inativar/);
        return true;
      },
    );
  });
});
