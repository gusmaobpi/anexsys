import { Column, Entity } from 'typeorm';
import { MeasurementCatalogStatus } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'company_minute_rates' })
export class CompanyMinuteRateEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'value_per_minute', type: 'numeric', precision: 18, scale: 2 })
  valuePerMinute!: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: MeasurementCatalogStatus.ACTIVE })
  status!: MeasurementCatalogStatus;
}
