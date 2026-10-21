import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { CreatePermissionDto } from 'src/modules/authorization/contracts/dto/create-permission.dto';
import { CreateRoleDto } from 'src/modules/authorization/contracts/dto/create-role.dto';
import { AssignBranchScopeDto } from 'src/modules/authorization/contracts/dto/assign-branch-scope.dto';
import { AssignPermissionToRoleDto } from 'src/modules/authorization/contracts/dto/assign-permission-to-role.dto';
import { AssignRoleDto } from 'src/modules/authorization/contracts/dto/assign-role.dto';
import { BranchScopeType, BranchStatus, RoleStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { CommunityEntity } from '../../infrastructure/persistence/entities/community.entity';
import { PermissionEntity } from '../../infrastructure/persistence/entities/permission.entity';
import { RoleEntity } from '../../infrastructure/persistence/entities/role.entity';
import { CommunityPermissionRepository } from '../../infrastructure/persistence/repositories/community-permission.repository';
import { CommunityRepository } from '../../infrastructure/persistence/repositories/community.repository';
import { PermissionRepository } from '../../infrastructure/persistence/repositories/permission.repository';
import { RolePermissionRepository } from '../../infrastructure/persistence/repositories/role-permission.repository';
import { RoleRepository } from '../../infrastructure/persistence/repositories/role.repository';
import { UserBranchScopeRepository } from '../../infrastructure/persistence/repositories/user-branch-scope.repository';
import { UserCommunityRepository } from '../../infrastructure/persistence/repositories/user-community.repository';
import { UserRoleAssignmentRepository } from '../../infrastructure/persistence/repositories/user-role-assignment.repository';

const COMMUNITY_FROZEN_MESSAGE =
  'Comunidades estão congeladas. A permissão vem só do papel e do escopo (Empresa/Filial).';

export interface EffectiveAccessResult {
  branchIds: string[];
  permissions: string[];
  communities: string[];
}

export interface AccessImpactReport {
  userId: string;
  displayName?: string;
  email?: string;
  communities: string[];
  permissionsLostFromCommunities: string[];
  hasAllBranchesGrant: boolean;
  assignedBranchIds: string[];
  effectiveBranchIds: string[];
}

export interface UserAccessSummary {
  roles: Array<{
    assignmentId: string;
    roleId: string;
    code: string;
    displayName: string;
    assignedBranchId: string | null;
    assignedBranchLabel: string | null;
    grantsAllBranches: boolean;
  }>;
  communities: Array<{
    membershipId: string;
    communityId: string;
    code: string;
    displayName: string;
  }>;
  branchScopes: Array<{
    scopeId: string;
    branchId: string;
    branchLabel: string;
    scopeType: BranchScopeType;
  }>;
  effectiveAccess: EffectiveAccessResult;
}

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(RoleRepository)
    private readonly roleRepository: RoleRepository,
    @Inject(PermissionRepository)
    private readonly permissionRepository: PermissionRepository,
    @Inject(RolePermissionRepository)
    private readonly rolePermissionRepository: RolePermissionRepository,
    @Inject(UserRoleAssignmentRepository)
    private readonly userRoleAssignmentRepository: UserRoleAssignmentRepository,
    @Inject(UserBranchScopeRepository)
    private readonly userBranchScopeRepository: UserBranchScopeRepository,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(CommunityRepository)
    private readonly communityRepository: CommunityRepository,
    @Inject(CommunityPermissionRepository)
    private readonly communityPermissionRepository: CommunityPermissionRepository,
    @Inject(UserCommunityRepository)
    private readonly userCommunityRepository: UserCommunityRepository,
  ) {}

  async createRole(dto: CreateRoleDto): Promise<RoleEntity> {
    const normalizedCode = dto.code.trim().toUpperCase();
    const existingRole = await this.roleRepository.findByTenantAndCode(dto.tenantId, normalizedCode);
    if (existingRole) {
      throw new DomainValidationError(`Role code '${normalizedCode}' already exists for this tenant.`);
    }

    const role = this.roleRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      code: normalizedCode,
      displayName: dto.displayName.trim(),
      description: dto.description?.trim() ?? null,
      status: RoleStatus.ACTIVE,
      isSystemManaged: dto.isSystemManaged ?? false,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const saved = await this.roleRepository.save(role);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'role',
      entityId: saved.id,
      action: 'authorization.role.created',
      eventType: 'authorization.write',
      metadata: { code: saved.code },
    });

    return saved;
  }

  async createPermission(dto: CreatePermissionDto): Promise<PermissionEntity> {
    const normalizedCode = dto.code.trim().toLowerCase();
    const existingPermission = await this.permissionRepository.findByTenantAndCode(dto.tenantId, normalizedCode);
    if (existingPermission) {
      throw new DomainValidationError(`Permission code '${normalizedCode}' already exists for this tenant.`);
    }

    const permission = this.permissionRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      code: normalizedCode,
      displayName: dto.displayName.trim(),
      description: dto.description?.trim() ?? null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const saved = await this.permissionRepository.save(permission);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'permission',
      entityId: saved.id,
      action: 'authorization.permission.created',
      eventType: 'authorization.write',
      metadata: { code: saved.code },
    });

    return saved;
  }

  async createCommunity(dto: {
    tenantId: string;
    code: string;
    displayName: string;
    description?: string;
    actorUserId: string;
  }): Promise<CommunityEntity> {
    this.assertCommunitiesWritable();
    const normalizedCode = dto.code.trim().toUpperCase();
    const existing = await this.communityRepository.findByTenantAndCode(dto.tenantId, normalizedCode);
    if (existing) {
      throw new DomainValidationError(`Community code '${normalizedCode}' already exists for this tenant.`);
    }

    const community = this.communityRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      code: normalizedCode,
      displayName: dto.displayName.trim(),
      description: dto.description?.trim() ?? null,
      status: RoleStatus.ACTIVE,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const saved = await this.communityRepository.save(community);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'community',
      entityId: saved.id,
      action: 'authorization.community.created',
      eventType: 'authorization.write',
      metadata: { code: saved.code },
    });

    return saved;
  }

  async updateRole(dto: {
    tenantId: string;
    roleId: string;
    code?: string;
    displayName?: string;
    description?: string | null;
    status?: RoleStatus;
    isSystemManaged?: boolean;
    actorUserId: string;
  }): Promise<RoleEntity> {
    const role = await this.getRole(dto.roleId);
    if (role.tenantId !== dto.tenantId) {
      throw new DomainValidationError('Role is outside the tenant scope.');
    }
    if ((role.code ?? '').toUpperCase() === 'MASTER_ADMINISTRATOR' || dto.code?.trim().toUpperCase() === 'MASTER_ADMINISTRATOR') {
      throw new DomainValidationError('O papel master não pode ser alterado.');
    }

    if (dto.code) {
      const normalizedCode = dto.code.trim().toUpperCase();
      if (normalizedCode !== role.code) {
        const existingRole = await this.roleRepository.findByTenantAndCode(dto.tenantId, normalizedCode);
        if (existingRole && existingRole.id !== role.id) {
          throw new DomainValidationError(`Role code '${normalizedCode}' already exists for this tenant.`);
        }
        role.code = normalizedCode;
      }
    }

    if (dto.displayName !== undefined) {
      role.displayName = dto.displayName.trim();
    }
    if (dto.description !== undefined) {
      role.description = dto.description?.trim() || null;
    }
    if (dto.status !== undefined) {
      role.status = dto.status;
    }
    if (dto.isSystemManaged !== undefined) {
      role.isSystemManaged = dto.isSystemManaged;
    }
    role.updatedBy = dto.actorUserId;

    const saved = await this.roleRepository.save(role);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'role',
      entityId: saved.id,
      action: 'authorization.role.updated',
      eventType: 'authorization.write',
      metadata: { code: saved.code, status: saved.status },
    });

    return saved;
  }

  async updatePermission(dto: {
    tenantId: string;
    permissionId: string;
    code?: string;
    displayName?: string;
    description?: string | null;
    actorUserId: string;
  }): Promise<PermissionEntity> {
    const permission = await this.getPermission(dto.permissionId);
    if (permission.tenantId !== dto.tenantId) {
      throw new DomainValidationError('Permission is outside the tenant scope.');
    }

    if (dto.code) {
      const normalizedCode = dto.code.trim().toLowerCase();
      if (normalizedCode !== permission.code) {
        const existingPermission = await this.permissionRepository.findByTenantAndCode(dto.tenantId, normalizedCode);
        if (existingPermission && existingPermission.id !== permission.id) {
          throw new DomainValidationError(`Permission code '${normalizedCode}' already exists for this tenant.`);
        }
        permission.code = normalizedCode;
      }
    }

    if (dto.displayName !== undefined) {
      permission.displayName = dto.displayName.trim();
    }
    if (dto.description !== undefined) {
      permission.description = dto.description?.trim() || null;
    }
    permission.updatedBy = dto.actorUserId;

    const saved = await this.permissionRepository.save(permission);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'permission',
      entityId: saved.id,
      action: 'authorization.permission.updated',
      eventType: 'authorization.write',
      metadata: { code: saved.code },
    });

    return saved;
  }

  async updateCommunity(dto: {
    tenantId: string;
    communityId: string;
    code?: string;
    displayName?: string;
    description?: string | null;
    status?: RoleStatus;
    actorUserId: string;
  }): Promise<CommunityEntity> {
    this.assertCommunitiesWritable();
    const community = await this.getCommunity(dto.communityId);
    if (community.tenantId !== dto.tenantId) {
      throw new DomainValidationError('Community is outside the tenant scope.');
    }

    if (dto.code) {
      const normalizedCode = dto.code.trim().toUpperCase();
      if (normalizedCode !== community.code) {
        const existingCommunity = await this.communityRepository.findByTenantAndCode(dto.tenantId, normalizedCode);
        if (existingCommunity && existingCommunity.id !== community.id) {
          throw new DomainValidationError(`Community code '${normalizedCode}' already exists for this tenant.`);
        }
        community.code = normalizedCode;
      }
    }

    if (dto.displayName !== undefined) {
      community.displayName = dto.displayName.trim();
    }
    if (dto.description !== undefined) {
      community.description = dto.description?.trim() || null;
    }
    if (dto.status !== undefined) {
      community.status = dto.status;
    }
    community.updatedBy = dto.actorUserId;

    const saved = await this.communityRepository.save(community);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'community',
      entityId: saved.id,
      action: 'authorization.community.updated',
      eventType: 'authorization.write',
      metadata: { code: saved.code, status: saved.status },
    });

    return saved;
  }

  async assignPermissionToRole(dto: AssignPermissionToRoleDto): Promise<void> {
    const role = await this.getRole(dto.roleId);
    if ((role.code ?? '').toUpperCase() === 'MASTER_ADMINISTRATOR') {
      throw new DomainValidationError('O papel master não pode ser alterado.');
    }
    const permission = await this.getPermission(dto.permissionId);
    if (role.tenantId !== dto.tenantId || permission.tenantId !== dto.tenantId) {
      throw new DomainValidationError('Role and permission must belong to the assignment tenant.');
    }

    const existingAssignment = await this.rolePermissionRepository.findByRoleAndPermission(
      dto.tenantId,
      dto.roleId,
      dto.permissionId,
    );
    if (existingAssignment) {
      throw new DomainValidationError('Role permission assignment already exists.');
    }

    const link = this.rolePermissionRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      roleId: dto.roleId,
      permissionId: dto.permissionId,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    await this.rolePermissionRepository.save(link);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'role_permission',
      entityId: link.id,
      action: 'authorization.role.permission.assigned',
      eventType: 'authorization.write',
      metadata: { roleId: dto.roleId, permissionId: dto.permissionId },
    });
  }

  async assignPermissionToCommunity(dto: {
    tenantId: string;
    communityId: string;
    permissionId: string;
    actorUserId: string;
  }): Promise<void> {
    this.assertCommunitiesWritable();
    const community = await this.getCommunity(dto.communityId);
    const permission = await this.getPermission(dto.permissionId);
    if (community.tenantId !== dto.tenantId || permission.tenantId !== dto.tenantId) {
      throw new DomainValidationError('Community and permission must belong to the assignment tenant.');
    }

    const existingAssignment = await this.communityPermissionRepository.findByCommunityAndPermission(
      dto.tenantId,
      dto.communityId,
      dto.permissionId,
    );
    if (existingAssignment) {
      throw new DomainValidationError('Community permission assignment already exists.');
    }

    const link = this.communityPermissionRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      communityId: dto.communityId,
      permissionId: dto.permissionId,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    await this.communityPermissionRepository.save(link);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'community_permission',
      entityId: link.id,
      action: 'authorization.community.permission.assigned',
      eventType: 'authorization.write',
      metadata: { communityId: dto.communityId, permissionId: dto.permissionId },
    });
  }

  async assignRole(dto: AssignRoleDto): Promise<void> {
    const user = await this.identityService.getById(dto.userId);
    const role = await this.getRole(dto.roleId);
    if (user.tenantId !== dto.tenantId || role.tenantId !== dto.tenantId) {
      throw new DomainValidationError('User and role must belong to the assignment tenant.');
    }
    await this.assertUserAccessMutable(dto.tenantId, dto.userId);

    if (dto.assignedBranchId) {
      const branch = await this.branchService.getById(dto.assignedBranchId);
      if (branch.tenantId !== dto.tenantId) {
        throw new DomainValidationError('Assigned branch must belong to the assignment tenant.');
      }
    }

    const existingAssignment = await this.userRoleAssignmentRepository.findActiveAssignment(
      dto.tenantId,
      dto.userId,
      dto.roleId,
      dto.assignedBranchId ?? null,
    );
    if (existingAssignment) {
      throw new DomainValidationError('Active user role assignment already exists.');
    }

    const assignment = this.userRoleAssignmentRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      userId: dto.userId,
      roleId: dto.roleId,
      assignedBranchId: dto.assignedBranchId ?? null,
      grantsAllBranches: dto.grantsAllBranches === true,
      assignedAt: new Date(),
      revokedAt: null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    await this.userRoleAssignmentRepository.save(assignment);
    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: dto.assignedBranchId,
      actorUserId: dto.actorUserId,
      entityType: 'user_role_assignment',
      entityId: assignment.id,
      action: 'authorization.role.assigned',
      eventType: 'authorization.write',
      metadata: { userId: dto.userId, roleId: dto.roleId },
    });
  }

  async assignUserToCommunity(dto: {
    tenantId: string;
    userId: string;
    communityId: string;
    actorUserId: string;
  }): Promise<void> {
    this.assertCommunitiesWritable();
    const user = await this.identityService.getById(dto.userId);
    const community = await this.getCommunity(dto.communityId);
    if (user.tenantId !== dto.tenantId || community.tenantId !== dto.tenantId) {
      throw new DomainValidationError('User and community must belong to the assignment tenant.');
    }
    await this.assertUserAccessMutable(dto.tenantId, dto.userId);

    const existing = await this.userCommunityRepository.findByUserAndCommunity(dto.tenantId, dto.userId, dto.communityId);
    if (existing) {
      throw new DomainValidationError('User community membership already exists.');
    }

    const membership = this.userCommunityRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      userId: dto.userId,
      communityId: dto.communityId,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    await this.userCommunityRepository.save(membership);
    await this.auditService.record({
      tenantId: dto.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'user_community',
      entityId: membership.id,
      action: 'authorization.community.assigned',
      eventType: 'authorization.write',
      metadata: { userId: dto.userId, communityId: dto.communityId },
    });
  }

  async assignBranchScope(dto: AssignBranchScopeDto): Promise<void> {
    const user = await this.identityService.getById(dto.userId);
    const branch = await this.branchService.getById(dto.branchId);
    if (user.tenantId !== dto.tenantId || branch.tenantId !== dto.tenantId) {
      throw new DomainValidationError('User and branch must belong to the assignment tenant.');
    }
    await this.assertUserAccessMutable(dto.tenantId, dto.userId);

    const existingScope = await this.userBranchScopeRepository.findByUserBranchAndScope(
      dto.tenantId,
      dto.userId,
      dto.branchId,
      dto.scopeType,
    );
    if (existingScope) {
      throw new DomainValidationError('User branch scope assignment already exists.');
    }

    const scope = this.userBranchScopeRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      userId: dto.userId,
      branchId: dto.branchId,
      scopeType: dto.scopeType,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    await this.userBranchScopeRepository.save(scope);
    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: dto.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'user_branch_scope',
      entityId: scope.id,
      action: 'authorization.branch.scope.assigned',
      eventType: 'authorization.write',
      metadata: { userId: dto.userId, scopeType: dto.scopeType },
    });
  }

  async listRoles(tenantId: string): Promise<RoleEntity[]> {
    return this.roleRepository.findByTenant(tenantId);
  }

  async listPermissions(tenantId: string): Promise<PermissionEntity[]> {
    return this.permissionRepository.findByTenant(tenantId);
  }

  async listCommunities(tenantId: string): Promise<CommunityEntity[]> {
    return this.communityRepository.findByTenant(tenantId);
  }

  async getRoleById(roleId: string): Promise<RoleEntity> {
    return this.getRole(roleId);
  }

  async getPermissionById(permissionId: string): Promise<PermissionEntity> {
    return this.getPermission(permissionId);
  }

  async getCommunityById(communityId: string): Promise<CommunityEntity> {
    return this.getCommunity(communityId);
  }

  async getUserAccessSummary(tenantId: string, userId: string): Promise<UserAccessSummary> {
    const assignments = await this.userRoleAssignmentRepository.findActiveByUserId(tenantId, userId);
    const memberships = await this.userCommunityRepository.findByUserId(tenantId, userId);
    const branchScopes = await this.userBranchScopeRepository.findByUserId(tenantId, userId);

    const roles = await Promise.all(assignments.map((assignment) => this.getRole(assignment.roleId)));
    const communities = await this.communityRepository.findByIds(
      tenantId,
      memberships.map((membership) => membership.communityId),
    );
    const branchMap = new Map<string, string>();
    const branchIds = [
      ...new Set(
        [
          ...assignments.map((assignment) => assignment.assignedBranchId).filter((branchId): branchId is string => Boolean(branchId)),
          ...branchScopes.map((scope) => scope.branchId),
        ],
      ),
    ];
    for (const branchId of branchIds) {
      const branch = await this.branchService.getById(branchId);
      branchMap.set(branch.id, branch.displayName || branch.code);
    }

    const communityMap = new Map(communities.map((community) => [community.id, community] as const));
    const effectiveAccess = await this.getEffectiveAccessForUser(tenantId, userId);

    return {
      roles: assignments.map((assignment) => {
        const role = roles.find((candidate) => candidate.id === assignment.roleId);
        return {
          assignmentId: assignment.id,
          roleId: assignment.roleId,
          code: role?.code ?? assignment.roleId,
          displayName: role?.displayName ?? assignment.roleId,
          assignedBranchId: assignment.assignedBranchId,
          assignedBranchLabel: assignment.assignedBranchId ? branchMap.get(assignment.assignedBranchId) ?? assignment.assignedBranchId : null,
          grantsAllBranches: assignment.grantsAllBranches === true,
        };
      }),
      communities: memberships.map((membership) => {
        const community = communityMap.get(membership.communityId);
        return {
          membershipId: membership.id,
          communityId: membership.communityId,
          code: community?.code ?? membership.communityId,
          displayName: community?.displayName ?? membership.communityId,
        };
      }),
      branchScopes: await Promise.all(
        branchScopes.map(async (scope) => {
          const branch = branchMap.get(scope.branchId) ?? (await this.branchService.getById(scope.branchId)).displayName;
          return {
            scopeId: scope.id,
            branchId: scope.branchId,
            branchLabel: branch,
            scopeType: scope.scopeType,
          };
        }),
      ),
      effectiveAccess,
    };
  }

  async getEffectiveAccessForUser(tenantId: string, userId: string): Promise<EffectiveAccessResult> {
    const assignments = await this.userRoleAssignmentRepository.findActiveByUserId(tenantId, userId);
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const rolePermissions = await this.rolePermissionRepository.findByRoleIds(tenantId, roleIds);
    const branchScopes = await this.userBranchScopeRepository.findByUserId(tenantId, userId);
    const memberships = await this.userCommunityRepository.findByUserId(tenantId, userId);
    const communityIds = memberships.map((membership) => membership.communityId);
    const communities = await this.communityRepository.findByIds(tenantId, communityIds);
    const permissionIds = [...new Set(rolePermissions.map((rolePermission) => rolePermission.permissionId))];
    const permissions = await this.permissionRepository.findByIds(tenantId, permissionIds);
    if (permissions.length !== permissionIds.length) {
      throw new DomainValidationError('Permission assignments reference missing permissions.');
    }

    const branchIds = [
      ...branchScopes.map((scope) => scope.branchId),
      ...assignments
        .map((assignment) => assignment.assignedBranchId)
        .filter((branchId): branchId is string => Boolean(branchId)),
    ];

    if (assignments.some((assignment) => assignment.grantsAllBranches === true)) {
      const tenantBranches = await this.branchService.listByTenant(tenantId);
      branchIds.push(...tenantBranches.filter((branch) => branch.status !== BranchStatus.INACTIVE).map((branch) => branch.id));
    }

    return {
      branchIds: [...new Set(branchIds)],
      permissions: [...new Set(permissions.map((permission) => permission.code))].sort(),
      communities: [...new Set(communities.map((community) => community.code))].sort(),
    };
  }

  async getUserAccessImpact(tenantId: string, userId: string): Promise<AccessImpactReport> {
    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new DomainValidationError('User is outside the tenant scope.');
    }
    const assignments = await this.userRoleAssignmentRepository.findActiveByUserId(tenantId, userId);
    const memberships = await this.userCommunityRepository.findByUserId(tenantId, userId);
    const communityIds = memberships.map((membership) => membership.communityId);
    const communities = await this.communityRepository.findByIds(tenantId, communityIds);
    const communityPermissions = await this.communityPermissionRepository.findByCommunityIds(tenantId, communityIds);
    const rolePermissions = await this.rolePermissionRepository.findByRoleIds(
      tenantId,
      assignments.map((assignment) => assignment.roleId),
    );
    const rolePermissionIds = new Set(rolePermissions.map((item) => item.permissionId));
    const lostPermissionIds = [
      ...new Set(
        communityPermissions
          .map((item) => item.permissionId)
          .filter((permissionId) => !rolePermissionIds.has(permissionId)),
      ),
    ];
    const lostPermissions = lostPermissionIds.length
      ? await this.permissionRepository.findByIds(tenantId, lostPermissionIds)
      : [];
    const effectiveAccess = await this.getEffectiveAccessForUser(tenantId, userId);

    return {
      userId,
      displayName: user.displayName,
      email: user.email,
      communities: communities.map((community) => community.code).sort(),
      permissionsLostFromCommunities: lostPermissions.map((permission) => permission.code).sort(),
      hasAllBranchesGrant: assignments.some((assignment) => assignment.grantsAllBranches === true),
      assignedBranchIds: assignments
        .map((assignment) => assignment.assignedBranchId)
        .filter((branchId): branchId is string => Boolean(branchId)),
      effectiveBranchIds: effectiveAccess.branchIds,
    };
  }

  async getTenantAccessImpact(tenantId: string): Promise<AccessImpactReport[]> {
    const users = await this.identityService.listByTenant(tenantId);
    const reports: AccessImpactReport[] = [];
    for (const user of users) {
      reports.push(await this.getUserAccessImpact(tenantId, user.id));
    }
    return reports;
  }

  async userHasBranchScope(tenantId: string, userId: string, branchId: string, scopeType?: BranchScopeType): Promise<boolean> {
    const scopes = await this.userBranchScopeRepository.findByUserId(tenantId, userId);
    return scopes.some((scope) => scope.branchId === branchId && (!scopeType || scope.scopeType === scopeType));
  }

  private async getRole(roleId: string): Promise<RoleEntity> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new EntityNotFoundError(`Role '${roleId}' was not found.`);
    }

    return role;
  }

  private async getPermission(permissionId: string): Promise<PermissionEntity> {
    const permission = await this.permissionRepository.findById(permissionId);
    if (!permission) {
      throw new EntityNotFoundError(`Permission '${permissionId}' was not found.`);
    }

    return permission;
  }

  private async getCommunity(communityId: string): Promise<CommunityEntity> {
    const community = await this.communityRepository.findById(communityId);
    if (!community) {
      throw new EntityNotFoundError(`Community '${communityId}' was not found.`);
    }

    return community;
  }

  private async assertUserAccessMutable(tenantId: string, userId: string): Promise<void> {
    if (await this.identityService.userIsMaster(tenantId, userId)) {
      throw new DomainValidationError('O master só altera a senha.');
    }
  }

  private assertCommunitiesWritable(): void {
    throw new DomainValidationError(COMMUNITY_FROZEN_MESSAGE);
  }
}
