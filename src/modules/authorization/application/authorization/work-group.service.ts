import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { WorkGroupMemberEntity } from '../../infrastructure/persistence/entities/work-group-member.entity';
import { WorkGroupMemberRepository } from '../../infrastructure/persistence/repositories/work-group-member.repository';
import { WorkGroupRepository } from '../../infrastructure/persistence/repositories/work-group.repository';

export type WorkGroupListItem = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  members: Array<{ userId: string; displayName: string; email: string }>;
};

@Injectable()
export class WorkGroupService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(WorkGroupRepository)
    private readonly workGroupRepository: WorkGroupRepository,
    @Inject(WorkGroupMemberRepository)
    private readonly workGroupMemberRepository: WorkGroupMemberRepository,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async list(tenantId: string): Promise<WorkGroupListItem[]> {
    const [groups, memberships, users] = await Promise.all([
      this.workGroupRepository.findByTenant(tenantId),
      this.workGroupMemberRepository.findByTenant(tenantId),
      this.identityService.listByTenant(tenantId),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    return groups.map((group) => ({
      id: group.id,
      code: group.code,
      displayName: group.displayName,
      description: group.description,
      members: memberships
        .filter((membership) => membership.workGroupId === group.id)
        .map((membership) => {
          const user = usersById.get(membership.userId);
          return {
            userId: membership.userId,
            displayName: user?.displayName ?? 'Usuário',
            email: user?.email ?? '',
          };
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR')),
    }));
  }

  async assignMember(tenantId: string, workGroupId: string, userId: string, actorUserId: string): Promise<WorkGroupListItem[]> {
    const group = await this.workGroupRepository.findById(workGroupId);
    if (!group || group.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Work group '${workGroupId}' was not found.`);
    }
    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId || user.isDeleted) {
      throw new DomainValidationError('O usuário precisa pertencer a esta conta.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(WorkGroupMemberEntity, { tenantId, userId });
      await manager.save(
        manager.create(WorkGroupMemberEntity, {
          id: randomUUID(),
          tenantId,
          workGroupId,
          userId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        }),
      );
    });

    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'work_group_member',
      entityId: userId,
      action: 'authorization.work_group.member_assigned',
      eventType: 'authorization.write',
      metadata: { workGroupId, workGroupCode: group.code, userId },
    });

    return this.list(tenantId);
  }
}
