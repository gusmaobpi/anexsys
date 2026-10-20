import { Column, Entity, Unique } from 'typeorm';
import { MutableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'work_group_members' })
@Unique('uq_work_group_members_tenant_user', ['tenantId', 'userId'])
export class WorkGroupMemberEntity extends MutableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'work_group_id', type: 'uuid' })
  workGroupId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;
}
