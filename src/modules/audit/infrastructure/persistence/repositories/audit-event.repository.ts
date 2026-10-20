import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEventEntity } from '../entities/audit-event.entity';

@Injectable()
export class AuditEventRepository {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly repository: Repository<AuditEventEntity>,
  ) {}

  create(payload: Partial<AuditEventEntity>): AuditEventEntity {
    return this.repository.create(payload);
  }

  async save(event: AuditEventEntity): Promise<AuditEventEntity> {
    return this.repository.save(event);
  }

  async findByAction(tenantId: string, action: string, limit: number = 20): Promise<AuditEventEntity[]> {
    return this.repository.find({
      where: { tenantId, action },
      order: { occurredAt: 'DESC' },
      take: limit,
    });
  }

  async findByEntity(tenantId: string, entityType: string, entityId: string, limit: number = 50): Promise<AuditEventEntity[]> {
    return this.repository.find({
      where: { tenantId, entityType, entityId },
      order: { occurredAt: 'DESC' },
      take: limit,
    });
  }
}
