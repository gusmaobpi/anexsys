import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { BranchModule } from 'src/modules/branch/branch.module';
import { IdentityModule } from 'src/modules/identity/identity.module';
import { CommunitiesController } from './http/communities.controller';
import { WorkGroupsController } from './http/work-groups.controller';
import { PermissionsController } from './http/permissions.controller';
import { RolesController } from './http/roles.controller';
import { AuthorizationService } from './application/authorization/authorization.service';
import { WorkGroupService } from './application/authorization/work-group.service';
import { CommunityPermissionEntity } from './infrastructure/persistence/entities/community-permission.entity';
import { CommunityEntity } from './infrastructure/persistence/entities/community.entity';
import { PermissionEntity } from './infrastructure/persistence/entities/permission.entity';
import { RolePermissionEntity } from './infrastructure/persistence/entities/role-permission.entity';
import { RoleEntity } from './infrastructure/persistence/entities/role.entity';
import { UserBranchScopeEntity } from './infrastructure/persistence/entities/user-branch-scope.entity';
import { UserCommunityEntity } from './infrastructure/persistence/entities/user-community.entity';
import { WorkGroupEntity } from './infrastructure/persistence/entities/work-group.entity';
import { WorkGroupMemberEntity } from './infrastructure/persistence/entities/work-group-member.entity';
import { UserRoleAssignmentEntity } from './infrastructure/persistence/entities/user-role-assignment.entity';
import { CommunityPermissionRepository } from './infrastructure/persistence/repositories/community-permission.repository';
import { CommunityRepository } from './infrastructure/persistence/repositories/community.repository';
import { PermissionRepository } from './infrastructure/persistence/repositories/permission.repository';
import { RolePermissionRepository } from './infrastructure/persistence/repositories/role-permission.repository';
import { RoleRepository } from './infrastructure/persistence/repositories/role.repository';
import { UserBranchScopeRepository } from './infrastructure/persistence/repositories/user-branch-scope.repository';
import { UserCommunityRepository } from './infrastructure/persistence/repositories/user-community.repository';
import { WorkGroupMemberRepository } from './infrastructure/persistence/repositories/work-group-member.repository';
import { WorkGroupRepository } from './infrastructure/persistence/repositories/work-group.repository';
import { UserRoleAssignmentRepository } from './infrastructure/persistence/repositories/user-role-assignment.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserRoleAssignmentEntity,
      UserBranchScopeEntity,
      CommunityEntity,
      CommunityPermissionEntity,
      UserCommunityEntity,
      WorkGroupEntity,
      WorkGroupMemberEntity,
    ]),
    AuditModule,
    forwardRef(() => BranchModule),
    forwardRef(() => IdentityModule),
  ],
  controllers: [RolesController, PermissionsController, CommunitiesController, WorkGroupsController],
  providers: [
    AuthorizationService,
    RoleRepository,
    PermissionRepository,
    RolePermissionRepository,
    UserRoleAssignmentRepository,
    UserBranchScopeRepository,
    CommunityRepository,
    CommunityPermissionRepository,
    UserCommunityRepository,
    WorkGroupRepository,
    WorkGroupMemberRepository,
    WorkGroupService,
  ],
  exports: [
    AuthorizationService,
    RoleRepository,
    PermissionRepository,
    RolePermissionRepository,
    UserRoleAssignmentRepository,
    UserBranchScopeRepository,
    CommunityRepository,
    CommunityPermissionRepository,
    UserCommunityRepository,
  ],
})
export class AuthorizationModule {}
