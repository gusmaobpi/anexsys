import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ServiceOrderApprovalEntity } from '../entities/service-order-approval.entity';

@Injectable()
export class ServiceOrderApprovalRepository {
  constructor(
    @InjectRepository(ServiceOrderApprovalEntity)
    private readonly repository: Repository<ServiceOrderApprovalEntity>,
  ) {}

  create(payload: Partial<ServiceOrderApprovalEntity>): ServiceOrderApprovalEntity {
    return this.repository.create(payload);
  }

  async save(approval: ServiceOrderApprovalEntity): Promise<ServiceOrderApprovalEntity> {
    return this.repository.save(approval);
  }

  async findLatestByServiceOrder(serviceOrderId: string): Promise<ServiceOrderApprovalEntity | null> {
    const rows = await this.repository.find({
      where: { serviceOrderId, isDeleted: false },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async findLatestSignatureByServiceOrder(serviceOrderId: string): Promise<ServiceOrderApprovalEntity | null> {
    const rows = await this.repository.find({
      where: { serviceOrderId, isDeleted: false },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return rows.find((row) => row.method === 'counter' || row.method === 'paper' || row.method === 'release' || row.method === 'link') ?? null;
  }

  async findIdsWithPhoto(serviceOrderIds: string[]): Promise<string[]> {
    if (serviceOrderIds.length === 0) {
      return [];
    }
    const rows = await this.repository.find({
      where: { serviceOrderId: In(serviceOrderIds), isDeleted: false, photoBase64: Not(IsNull()) },
      select: { serviceOrderId: true },
    });
    return [...new Set(rows.map((row) => row.serviceOrderId))];
  }
}
