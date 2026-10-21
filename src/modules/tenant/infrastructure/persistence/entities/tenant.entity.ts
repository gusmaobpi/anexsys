import { Column, Entity, OneToMany } from 'typeorm';
import { BranchEntity } from 'src/modules/branch/infrastructure/persistence/entities/branch.entity';
import { TenantStatus } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'tenants' })
export class TenantEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ name: 'legal_name', type: 'text' })
  legalName!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: TenantStatus.ACTIVE })
  status!: TenantStatus;

  @Column({ name: 'warranty_adjustment_period_days', type: 'integer', default: 7 })
  warrantyAdjustmentPeriodDays!: number;

  @Column({ name: 'warranty_execution_period_days', type: 'integer', default: 90 })
  warrantyExecutionPeriodDays!: number;

  @Column({ name: 'block_delivery_with_outstanding_balance', type: 'boolean', default: true })
  blockDeliveryWithOutstandingBalance!: boolean;

  @Column({ name: 'machine_wait_minutes', type: 'integer', default: 3 })
  machineWaitMinutes!: number;

  @Column({ name: 'default_measurement_unit_code', type: 'varchar', length: 20, default: 'CM' })
  defaultMeasurementUnitCode!: string;

  @Column({ name: 'max_pieces_per_bag', type: 'integer', default: 5 })
  maxPiecesPerBag!: number;

  @OneToMany(() => BranchEntity, (branch) => branch.tenant)
  branches?: BranchEntity[];
}
