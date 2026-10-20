import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkGroupMemberEntity } from '../entities/work-group-member.entity';

@Injectable()
export class WorkGroupMemberRepository {
  constructor(
    @InjectRepository(WorkGroupMemberEntity)
    private readonly repository: Repository<WorkGroupMemberEntity>,
  ) {}

  async findByTenant(tenantId: string): Promise<WorkGroupMemberEntity[]> {
    return this.repository.find({ where: { tenantId } });
  }
}
