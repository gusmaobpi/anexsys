require('reflect-metadata');

const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');

const { AppModule } = require('../dist/app.module.js');
const { TenantService } = require('../dist/modules/tenant/application/tenant/tenant.service.js');
const { BranchService } = require('../dist/modules/branch/application/branch/branch.service.js');
const { IdentityService } = require('../dist/modules/identity/application/identity/identity.service.js');
const { AuthorizationService } = require('../dist/modules/authorization/application/authorization/authorization.service.js');
const { RoleRepository } = require('../dist/modules/authorization/infrastructure/persistence/repositories/role.repository.js');
const { PermissionRepository } = require('../dist/modules/authorization/infrastructure/persistence/repositories/permission.repository.js');
const { RolePermissionRepository } = require('../dist/modules/authorization/infrastructure/persistence/repositories/role-permission.repository.js');
const { UserRoleAssignmentRepository } = require('../dist/modules/authorization/infrastructure/persistence/repositories/user-role-assignment.repository.js');
const { UserBranchScopeRepository } = require('../dist/modules/authorization/infrastructure/persistence/repositories/user-branch-scope.repository.js');
const { BranchScopeType } = require('../dist/shared/domain/enums.js');

const ALL_PERMISSION_CODES = [
  'branches.read',
  'branches.write',
  'communities.read',
  'companies.read',
  'companies.write',
  'communities.write',
  'custody.read',
  'custody.write',
  'customer-portal.manage',
  'customer-portal.read',
  'customer-portal.write',
  'customers.read',
  'customers.write',
  'finance.read',
  'finance.write',
  'floor_schedule.write',
  'measurements.read',
  'measurements.write',
  'fiscal.read',
  'fiscal.write',
  'measurements.read',
  'measurements.write',
  'operational_resources.read',
  'operational_resources.write',
  'permissions.read',
  'permissions.write',
  'pickup.read',
  'pickup.write',
  'platform.tenants.create',
  'production_orders.read',
  'production_orders.write',
  'quality.read',
  'quality.write',
  'rework.read',
  'rework.write',
  'roles.read',
  'roles.write',
  'service_orders.read',
  'service_orders.write',
  'smart-concierge.read',
  'smart-concierge.write',
  'tenants.read',
  'tenants.write',
  'users.read',
  'users.write',
  'warranty.read',
  'warranty.write',
  'whatsapp.read',
  'whatsapp.resend',
  'whatsapp.write',
  'email.write',
  'service_orders.release',
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Defina a variavel de ambiente ${name} antes de executar este script.`);
  }
  return value.trim();
}

const bootstrapValues = {
  tenant: {
    code: process.env.BOOTSTRAP_TENANT_CODE ?? 'ANXDEV',
    legalName: process.env.BOOTSTRAP_TENANT_LEGAL_NAME ?? 'ANEXSYS DEV LTDA',
    displayName: process.env.BOOTSTRAP_TENANT_DISPLAY_NAME ?? 'ANEXSYS DEV',
  },
  branch: {
    code: process.env.BOOTSTRAP_BRANCH_CODE ?? 'HQ',
    legalName: process.env.BOOTSTRAP_BRANCH_LEGAL_NAME ?? 'ANEXSYS DEV MATRIZ',
    displayName: process.env.BOOTSTRAP_BRANCH_DISPLAY_NAME ?? 'Matriz',
    businessCalendarName: process.env.BOOTSTRAP_BRANCH_CALENDAR_NAME ?? 'Calendario Local',
  },
  admin: {
    email: requiredEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase(),
    displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? 'Administrador Local',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? null,
  },
  community: {
    code: 'GLOBAL_ADMINISTRATORS',
    displayName: 'Global Administrators',
  },
  role: {
    code: 'MASTER_ADMINISTRATOR',
    displayName: 'Master Administrator',
  },
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const tenantService = app.get(TenantService);
    const branchService = app.get(BranchService);
    const identityService = app.get(IdentityService);
    const authorizationService = app.get(AuthorizationService);
    const roleRepository = app.get(RoleRepository);
    const permissionRepository = app.get(PermissionRepository);
    const rolePermissionRepository = app.get(RolePermissionRepository);
    const userRoleAssignmentRepository = app.get(UserRoleAssignmentRepository);
    const userBranchScopeRepository = app.get(UserBranchScopeRepository);

    const bootstrapActorId = randomUUID();

    const tenant = await ensureTenant(tenantService, bootstrapActorId);
    const branch = await ensureBranch(branchService, tenant.id, bootstrapActorId);
    const adminUser = await ensureAdminUser(identityService, tenant.id, branch.id, bootstrapActorId);
    const role = await ensureRole(roleRepository, authorizationService, tenant.id, adminUser.id);
    const permissions = await ensurePermissions(permissionRepository, authorizationService, tenant.id, adminUser.id);

    for (const permission of permissions) {
      const roleLink = await rolePermissionRepository.findByRoleAndPermission(tenant.id, role.id, permission.id);
      if (!roleLink) {
        await authorizationService.assignPermissionToRole({
          tenantId: tenant.id,
          roleId: role.id,
          permissionId: permission.id,
          actorUserId: adminUser.id,
        });
      }
    }

    const tenantWideRole = await userRoleAssignmentRepository.findActiveAssignment(tenant.id, adminUser.id, role.id, null);
    if (!tenantWideRole) {
      await authorizationService.assignRole({
        tenantId: tenant.id,
        userId: adminUser.id,
        roleId: role.id,
        grantsAllBranches: true,
        actorUserId: adminUser.id,
      });
    }

    const branchScope = await userBranchScopeRepository.findByUserBranchAndScope(tenant.id, adminUser.id, branch.id, BranchScopeType.ADMIN);
    if (!branchScope) {
      await authorizationService.assignBranchScope({
        tenantId: tenant.id,
        userId: adminUser.id,
        branchId: branch.id,
        scopeType: BranchScopeType.ADMIN,
        actorUserId: adminUser.id,
      });
    }

    await identityService.saveContextPreference({
      normalizedEmail: adminUser.email,
      lastTenantId: tenant.id,
      lastBranchId: branch.id,
      actorUserId: adminUser.id,
    });

    const effectiveAccess = await authorizationService.getEffectiveAccessForUser(tenant.id, adminUser.id);

    console.log(
      JSON.stringify(
        {
          tenantId: tenant.id,
          tenantDisplayName: tenant.displayName,
          branchId: branch.id,
          branchDisplayName: branch.displayName,
          adminUserId: adminUser.id,
          adminEmail: adminUser.email,
          roleId: role.id,
          roleCode: role.code,
          permissionCount: permissions.length,
          effectivePermissionCount: effectiveAccess.permissions.length,
          effectiveBranchIds: effectiveAccess.branchIds,
          effectiveCommunities: effectiveAccess.communities,
          adminPasswordRequiredFromEnv: bootstrapValues.admin.password === null,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function ensureTenant(tenantService, actorUserId) {
  const existing = (await tenantService.list()).find(
    (tenant) => tenant.code === bootstrapValues.tenant.code || tenant.displayName === bootstrapValues.tenant.displayName,
  );

  if (existing) {
    return existing;
  }

  return tenantService.create({
    code: bootstrapValues.tenant.code,
    legalName: bootstrapValues.tenant.legalName,
    displayName: bootstrapValues.tenant.displayName,
    actorUserId,
  });
}

async function ensureBranch(branchService, tenantId, actorUserId) {
  const existing = (await branchService.listByTenant(tenantId)).find(
    (branch) => branch.code === bootstrapValues.branch.code || branch.displayName === bootstrapValues.branch.displayName,
  );

  if (existing) {
    return existing;
  }

  return branchService.create({
    tenantId,
    code: bootstrapValues.branch.code,
    legalName: bootstrapValues.branch.legalName,
    displayName: bootstrapValues.branch.displayName,
    businessCalendarName: bootstrapValues.branch.businessCalendarName,
    actorUserId,
  });
}

async function ensureAdminUser(identityService, tenantId, branchId, actorUserId) {
  const existing = await identityService.getByTenantAndEmail(tenantId, bootstrapValues.admin.email);
  if (existing) {
    return existing;
  }

  if (!bootstrapValues.admin.password) {
    throw new Error(
      `Bootstrap admin user '${bootstrapValues.admin.email}' does not exist. Set BOOTSTRAP_ADMIN_PASSWORD to create it.`,
    );
  }

  return identityService.createUser({
    tenantId,
    defaultBranchId: branchId,
    email: bootstrapValues.admin.email,
    displayName: bootstrapValues.admin.displayName,
    password: bootstrapValues.admin.password,
    actorUserId,
  });
}

async function ensureRole(roleRepository, authorizationService, tenantId, actorUserId) {
  const existing = await roleRepository.findByTenantAndCode(tenantId, bootstrapValues.role.code);
  if (existing) {
    return existing;
  }

  return authorizationService.createRole({
    tenantId,
    code: bootstrapValues.role.code,
    displayName: bootstrapValues.role.displayName,
    description: 'Global master administration role for the tenant bootstrap owner.',
    isSystemManaged: true,
    actorUserId,
  });
}

async function ensurePermissions(permissionRepository, authorizationService, tenantId, actorUserId) {
  const permissions = [];
  for (const code of ALL_PERMISSION_CODES) {
    const existing = await permissionRepository.findByTenantAndCode(tenantId, code);
    if (existing) {
      permissions.push(existing);
      continue;
    }

    const created = await authorizationService.createPermission({
      tenantId,
      code,
      displayName: code,
      description: `Bootstrap-generated permission for ${code}.`,
      actorUserId,
    });
    permissions.push(created);
  }

  return permissions;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
