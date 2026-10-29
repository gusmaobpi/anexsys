import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { TenantEntity } from 'src/modules/tenant/infrastructure/persistence/entities/tenant.entity';
import { BranchEntity } from 'src/modules/branch/infrastructure/persistence/entities/branch.entity';
import { CompanyStatus } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'companies' })
export class CompanyEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, { nullable: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'legal_name', type: 'text' })
  legalName!: string;

  @Column({ name: 'trade_name', type: 'text', nullable: true })
  tradeName!: string | null;

  @Column({ name: 'cnpj', type: 'varchar', length: 14, nullable: true })
  cnpj!: string | null;

  @Column({ name: 'state_registration', type: 'varchar', length: 30, nullable: true })
  stateRegistration!: string | null;

  @Column({ name: 'municipal_registration', type: 'varchar', length: 30, nullable: true })
  municipalRegistration!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ name: 'street', type: 'text', nullable: true })
  street!: string | null;

  @Column({ name: 'address_number', type: 'text', nullable: true })
  number!: string | null;

  @Column({ name: 'complement', type: 'text', nullable: true })
  complement!: string | null;

  @Column({ name: 'district', type: 'text', nullable: true })
  district!: string | null;

  @Column({ name: 'city', type: 'text', nullable: true })
  city!: string | null;

  @Column({ name: 'state', type: 'varchar', length: 10, nullable: true })
  state!: string | null;

  @Column({ name: 'country', type: 'text', nullable: true })
  country!: string | null;

  @Column({ name: 'logo_mime_type', type: 'varchar', length: 30, nullable: true })
  logoMimeType!: string | null;

  @Column({ name: 'logo_base64', type: 'text', nullable: true })
  logoBase64!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'status', type: 'varchar', length: 30, default: CompanyStatus.ACTIVE })
  status!: CompanyStatus;

  @OneToMany(() => BranchEntity, (branch) => branch.company)
  branches?: BranchEntity[];
}
