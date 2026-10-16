import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeasurementCatalogStatus } from 'src/shared/domain/enums';
import { CompanyMinuteRateEntity } from '../entities/company-minute-rate.entity';

@Injectable()
export class CompanyMinuteRateRepository {
  constructor(
    @InjectRepository(CompanyMinuteRateEntity)
    private readonly repository: Repository<CompanyMinuteRateEntity>,
  ) {}

  create(payload: Partial<CompanyMinuteRateEntity>): CompanyMinuteRateEntity {
    return this.repository.create(payload);
  }

  async save(entity: CompanyMinuteRateEntity): Promise<CompanyMinuteRateEntity> {
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<CompanyMinuteRateEntity | null> {
    return this.repository.findOne({ where: { id, isDeleted: false } });
  }

  async findListedByCompany(tenantId: string, companyId: string): Promise<CompanyMinuteRateEntity[]> {
    return this.repository.find({
      where: { tenantId, companyId, isDeleted: false },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async findActiveByCompany(tenantId: string, companyId: string): Promise<CompanyMinuteRateEntity[]> {
    return this.repository.find({
      where: { tenantId, companyId, isDeleted: false, status: MeasurementCatalogStatus.ACTIVE },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
