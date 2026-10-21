import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorizationService } from 'src/modules/authorization/application/authorization/authorization.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

function createService(overrides: Record<string, unknown> = {}) {
  const defaults = {
    roleRepository: {
      async findByTenantAndCode() {
        return null;
      },
    },
    permissionRepository: {
      async findByIds() {
        return [];
      },
      async findByTenantAndCode() {
        return null;
      },
      async findById() {
        return { id: 'permission-1', tenantId: 'tenant-1' };
      },
    },
    rolePermissionRepository: {
      async findByRoleIds() {
        return [];
      },
      async findByRoleAndPermission() {
        return null;
      },
      create() {
        return {};
      },
      async save() {},
    },
    userRoleAssignmentRepository: {
      async findActiveByUserId() {
        return [];
      },
      async findActiveAssignment() {
        return null;
      },
      create() {
        return {};
      },
      async save() {},
    },
    userBranchScopeRepository: {
      async findByUserId() {
        return [];
      },
      async findByUserBranchAndScope() {
        return null;
      },
      create() {
        return {};
      },
      async save() {},
    },
    identityService: {
      async getById() {
        return { id: 'user-1', tenantId: 'tenant-1' };
      },
      async userIsMaster() {
        return false;
      },
    },
    branchService: {
      async listByTenant() {
        return [];
      },
      async getById() {
        return { id: 'branch-1', tenantId: 'tenant-1' };
      },
    },
    auditService: { async record() {} },
    communityRepository: {
      async findByTenantAndCode() {
        return null;
      },
      async findByIds() {
        return [];
      },
      async findById() {
        return { id: 'community-1', tenantId: 'tenant-1' };
      },
      create() {
        return {};
      },
      async save() {},
    },
    communityPermissionRepository: {
      async findByCommunityIds() {
        return [];
      },
      async findByCommunityAndPermission() {
        return null;
      },
      create() {
        return {};
      },
      async save() {},
    },
    userCommunityRepository: {
      async findByUserId() {
        return [];
      },
      async findByUserAndCommunity() {
        return null;
      },
      create() {
        return {};
      },
      async save() {},
    },
  };
  const deps = { ...defaults, ...overrides };
  return new AuthorizationService(
    deps.roleRepository as never,
    deps.permissionRepository as never,
    deps.rolePermissionRepository as never,
    deps.userRoleAssignmentRepository as never,
    deps.userBranchScopeRepository as never,
    deps.identityService as never,
    deps.branchService as never,
    deps.auditService as never,
    deps.communityRepository as never,
    deps.communityPermissionRepository as never,
    deps.userCommunityRepository as never,
  );
}

describe('AuthorizationService', () => {
  it('combines role permissions and explicit branch scopes, ignoring frozen community permissions', async () => {
    const service = createService({
      permissionRepository: {
        async findByIds(tenantId: string, ids: string[]) {
          assert.equal(tenantId, 'tenant-1');
          const catalog = [
            { id: 'permission-1', code: 'tenant.manage' },
            { id: 'permission-2', code: 'branch.manage' },
            { id: 'permission-3', code: 'finance.export' },
          ];
          return catalog.filter((permission) => ids.includes(permission.id));
        },
      },
      rolePermissionRepository: {
        async findByRoleIds(tenantId: string) {
          assert.equal(tenantId, 'tenant-1');
          return [
            { roleId: 'role-1', permissionId: 'permission-1' },
            { roleId: 'role-2', permissionId: 'permission-2' },
          ];
        },
      },
      userRoleAssignmentRepository: {
        async findActiveByUserId(tenantId: string, userId: string) {
          assert.equal(tenantId, 'tenant-1');
          assert.equal(userId, 'user-1');
          return [
            { roleId: 'role-1', assignedBranchId: 'branch-1' },
            { roleId: 'role-2', assignedBranchId: null },
          ];
        },
      },
      userBranchScopeRepository: {
        async findByUserId(tenantId: string, userId: string) {
          assert.equal(tenantId, 'tenant-1');
          assert.equal(userId, 'user-1');
          return [
            { branchId: 'branch-2', scopeType: 'member' },
            { branchId: 'branch-1', scopeType: 'manager' },
          ];
        },
      },
      branchService: {
        async listByTenant(tenantId: string) {
          assert.equal(tenantId, 'tenant-1');
          return [{ id: 'branch-1' }, { id: 'branch-2' }];
        },
      },
      userCommunityRepository: {
        async findByUserId(tenantId: string, userId: string) {
          assert.equal(tenantId, 'tenant-1');
          assert.equal(userId, 'user-1');
          return [{ communityId: 'community-1' }];
        },
      },
      communityRepository: {
        async findByIds(tenantId: string, ids: string[]) {
          assert.equal(tenantId, 'tenant-1');
          assert.deepEqual(ids, ['community-1']);
          return [{ id: 'community-1', code: 'FINANCE' }];
        },
      },
      communityPermissionRepository: {
        async findByCommunityIds(tenantId: string, ids: string[]) {
          assert.equal(tenantId, 'tenant-1');
          assert.deepEqual(ids, ['community-1']);
          return [{ communityId: 'community-1', permissionId: 'permission-3' }];
        },
      },
    });

    const effectiveAccess = await service.getEffectiveAccessForUser('tenant-1', 'user-1');

    assert.deepEqual(effectiveAccess, {
      branchIds: ['branch-2', 'branch-1'],
      permissions: ['branch.manage', 'tenant.manage'],
      communities: ['FINANCE'],
    });
  });


  it('fails fast when assignments reference missing permissions', async () => {
    const service = createService({
      rolePermissionRepository: {
        async findByRoleIds() {
          return [{ roleId: 'role-1', permissionId: 'missing-permission' }];
        },
      },
      userRoleAssignmentRepository: {
        async findActiveByUserId() {
          return [{ roleId: 'role-1', assignedBranchId: null }];
        },
      },
      branchService: {
        async listByTenant() {
          return [];
        },
      },
      permissionRepository: {
        async findByIds() {
          return [];
        },
      },
    });

    await assert.rejects(() => service.getEffectiveAccessForUser('tenant-1', 'user-1'), DomainValidationError);
  });

  it('returns empty effective access when the user has no grants', async () => {
    const service = createService();
    const access = await service.getEffectiveAccessForUser('tenant-1', 'user-1');
    assert.deepEqual(access, { branchIds: [], permissions: [], communities: [] });
  });

  it('grants all tenant branches only when grantsAllBranches is explicit', async () => {
    const service = createService({
      userRoleAssignmentRepository: {
        async findActiveByUserId() {
          return [{ roleId: 'role-1', assignedBranchId: null, grantsAllBranches: true }];
        },
      },
      branchService: {
        async listByTenant(tenantId: string) {
          assert.equal(tenantId, 'tenant-1');
          return [{ id: 'branch-a' }, { id: 'branch-b' }];
        },
      },
    });

    const access = await service.getEffectiveAccessForUser('tenant-1', 'user-1');
    assert.deepEqual(access.branchIds, ['branch-a', 'branch-b']);
  });

  it('leaves a new user without Filial until the administrator assigns one', async () => {
    const service = createService({
      userRoleAssignmentRepository: {
        async findActiveByUserId() {
          return [{ roleId: 'role-1', assignedBranchId: null, grantsAllBranches: false }];
        },
      },
      branchService: {
        async listByTenant() {
          return [{ id: 'branch-a' }, { id: 'branch-b' }];
        },
      },
    });

    const access = await service.getEffectiveAccessForUser('tenant-1', 'user-1');
    assert.deepEqual(access.branchIds, []);
  });

  it('rejects duplicate role creation per tenant code', async () => {
    const service = createService({
      roleRepository: { async findByTenantAndCode() { return { id: 'role-1' }; } },
    });

    await assert.rejects(
      () =>
        service.createRole({
          tenantId: 'tenant-1',
          code: 'admin',
          displayName: 'Admin',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects duplicate permission creation per tenant code', async () => {
    const service = createService({
      permissionRepository: { async findByTenantAndCode() { return { id: 'permission-1' }; } },
    });

    await assert.rejects(
      () =>
        service.createPermission({
          tenantId: 'tenant-1',
          code: 'users.read',
          displayName: 'Users Read',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects duplicate role permission assignment', async () => {
    const service = createService({
      roleRepository: { async findById() { return { id: 'role-1', tenantId: 'tenant-1' }; } },
      permissionRepository: { async findById() { return { id: 'permission-1', tenantId: 'tenant-1' }; } },
      rolePermissionRepository: { async findByRoleAndPermission() { return { id: 'existing-link' }; } },
    });

    await assert.rejects(
      () =>
        service.assignPermissionToRole({
          tenantId: 'tenant-1',
          roleId: 'role-1',
          permissionId: 'permission-1',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects community writes because communities are frozen', async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.assignPermissionToCommunity({
          tenantId: 'tenant-1',
          communityId: 'community-1',
          permissionId: 'permission-1',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects duplicate active role assignments', async () => {
    const service = createService({
      roleRepository: { async findById() { return { id: 'role-1', tenantId: 'tenant-a' }; } },
      userRoleAssignmentRepository: { async findActiveAssignment() { return { id: 'assignment-1' }; } },
      identityService: { async getById() { return { id: 'user-1', tenantId: 'tenant-a' }; }, async userIsMaster() { return false; } },
    });

    await assert.rejects(
      () =>
        service.assignRole({
          tenantId: 'tenant-a',
          userId: 'user-1',
          roleId: 'role-1',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects community membership writes because communities are frozen', async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.assignUserToCommunity({
          tenantId: 'tenant-a',
          userId: 'user-1',
          communityId: 'community-1',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects duplicate branch scope assignments', async () => {
    const service = createService({
      userBranchScopeRepository: { async findByUserBranchAndScope() { return { id: 'scope-1' }; } },
      identityService: { async getById() { return { id: 'user-1', tenantId: 'tenant-a' }; }, async userIsMaster() { return false; } },
      branchService: { async getById() { return { id: 'branch-1', tenantId: 'tenant-a' }; } },
    });

    await assert.rejects(
      () =>
        service.assignBranchScope({
          tenantId: 'tenant-a',
          userId: 'user-1',
          branchId: 'branch-1',
          scopeType: 'member',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects cross-tenant role assignments', async () => {
    const service = createService({
      roleRepository: { async findById() { return { id: 'role-1', tenantId: 'tenant-b' }; } },
      identityService: { async getById() { return { id: 'user-1', tenantId: 'tenant-a' }; }, async userIsMaster() { return false; } },
    });

    await assert.rejects(
      () =>
        service.assignRole({
          tenantId: 'tenant-a',
          userId: 'user-1',
          roleId: 'role-1',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });

  it('rejects role assignments to a branch from a different tenant', async () => {
    const service = createService({
      roleRepository: { async findById() { return { id: 'role-1', tenantId: 'tenant-a' }; } },
      identityService: { async getById() { return { id: 'user-1', tenantId: 'tenant-a' }; }, async userIsMaster() { return false; } },
      branchService: { async getById() { return { id: 'branch-1', tenantId: 'tenant-b' }; } },
    });

    await assert.rejects(
      () =>
        service.assignRole({
          tenantId: 'tenant-a',
          userId: 'user-1',
          roleId: 'role-1',
          assignedBranchId: 'branch-1',
          actorUserId: 'actor-1',
        }),
      DomainValidationError,
    );
  });
});
