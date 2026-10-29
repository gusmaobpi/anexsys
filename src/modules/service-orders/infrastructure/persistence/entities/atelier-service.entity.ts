import { Column, Entity } from 'typeorm';
import { MeasurementCatalogStatus } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'atelier_services' })
export class AtelierServiceEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'code', type: 'varchar', length: 100 })
  code!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ name: 'default_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  defaultPrice!: string | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ name: 'difficulty_grade', type: 'smallint', nullable: true })
  difficultyGrade!: number | null;

  @Column({ name: 'fiscal_code', type: 'varchar', length: 20, nullable: true })
  fiscalCode!: string | null;

  @Column({ name: 'national_nfse_code', type: 'varchar', length: 20, nullable: true })
  nationalNfseCode!: string | null;

  @Column({ name: 'municipal_code', type: 'varchar', length: 20, nullable: true })
  municipalCode!: string | null;

  @Column({ name: 'iss_rate', type: 'numeric', precision: 8, scale: 4, nullable: true })
  issRate!: string | null;

  @Column({ name: 'iss_withheld', type: 'boolean', default: false })
  issWithheld!: boolean;

  @Column({ name: 'operation_nature', type: 'varchar', length: 80, nullable: true })
  operationNature!: string | null;

  @Column({ name: 'fiscal_description', type: 'text', nullable: true })
  fiscalDescription!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: MeasurementCatalogStatus.ACTIVE })
  status!: MeasurementCatalogStatus;
}
