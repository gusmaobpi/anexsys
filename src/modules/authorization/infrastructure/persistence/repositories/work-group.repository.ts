import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkGroupEntity } from '../entities/work-group.entity';

@Injectable()
export class WorkGroupRepository {
  constructor(
    @InjectRepository(WorkGroupEntity)
    private readonly repository: Repository<WorkGroupEntity>,
  ) {}

  async findByTenant(tenantId: string): Promise<WorkGroupEntity[]> {
    return this.repository.find({ where: { tenantId }, order: { sortOrder: 'ASC', displayName: 'ASC' } });
  }

  async findById(id: string): Promise<WorkGroupEntity | null> {
    return this.repository.findOne({ where: { id } });
  }
}
