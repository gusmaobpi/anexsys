import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { PaymentProviderConfigEntity } from '../entities/payment-provider-config.entity';

@Injectable()
export class PaymentProviderConfigRepository {
  constructor(
    @InjectRepository(PaymentProviderConfigEntity)
    private readonly repository: Repository<PaymentProviderConfigEntity>,
  ) {}

  create(payload: Partial<PaymentProviderConfigEntity>): PaymentProviderConfigEntity {
    return this.repository.create(payload);
  }

  async save(entity: PaymentProviderConfigEntity): Promise<PaymentProviderConfigEntity> {
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<PaymentProviderConfigEntity | null> {
    return this.repository.findOne({ where: { id, isDeleted: false } });
  }

  async findListedByCompany(tenantId: string, companyId: string): Promise<PaymentProviderConfigEntity[]> {
    return this.repository.find({
      where: { tenantId, companyId, isDeleted: false },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async findActiveByCompanyAndProvider(
    tenantId: string,
    companyId: string,
    provider: PaymentProviderName,
  ): Promise<PaymentProviderConfigEntity[]> {
    return this.repository.find({
      where: { tenantId, companyId, provider, isDeleted: false, status: 'active' },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
