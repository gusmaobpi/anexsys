import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTerminalEntity } from '../entities/payment-terminal.entity';

@Injectable()
export class PaymentTerminalRepository {
  constructor(
    @InjectRepository(PaymentTerminalEntity)
    private readonly repository: Repository<PaymentTerminalEntity>,
  ) {}

  create(payload: Partial<PaymentTerminalEntity>): PaymentTerminalEntity {
    return this.repository.create(payload);
  }

  async save(entity: PaymentTerminalEntity): Promise<PaymentTerminalEntity> {
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<PaymentTerminalEntity | null> {
    return this.repository.findOne({ where: { id, isDeleted: false } });
  }

  async findListedByBranch(tenantId: string, branchId: string): Promise<PaymentTerminalEntity[]> {
    return this.repository.find({
      where: { tenantId, branchId, isDeleted: false },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async findActiveByBranch(tenantId: string, branchId: string): Promise<PaymentTerminalEntity[]> {
    return this.repository.find({
      where: { tenantId, branchId, isDeleted: false, status: 'active' },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
