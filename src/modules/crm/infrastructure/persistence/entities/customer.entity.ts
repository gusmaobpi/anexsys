import { Column, Entity } from 'typeorm';
import { CustomerStatus, CustomerType } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'customers' })
export class CustomerEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'customer_type', type: 'varchar', length: 20 })
  customerType!: CustomerType;

  @Column({ name: 'legal_name', type: 'text' })
  legalName!: string;

  @Column({ name: 'trade_name', type: 'text', nullable: true })
  tradeName!: string | null;

  @Column({ name: 'cpf_cnpj', type: 'varchar', length: 20, nullable: true })
  cpfCnpj!: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 40 })
  phone!: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ name: 'observations', type: 'text', nullable: true })
  observations!: string | null;

  @Column({ name: 'address_line_1', type: 'text', nullable: true })
  street!: string | null;

  @Column({ name: 'address_line_2', type: 'text', nullable: true })
  complement!: string | null;

  @Column({ name: 'address_number', type: 'text', nullable: true })
  number!: string | null;

  @Column({ name: 'district', type: 'text', nullable: true })
  district!: string | null;

  @Column({ name: 'city', type: 'text', nullable: true })
  city!: string | null;

  @Column({ name: 'state', type: 'varchar', length: 10, nullable: true })
  state!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ name: 'country', type: 'text', nullable: true })
  country!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: CustomerStatus.ACTIVE })
  status!: CustomerStatus;

  @Column({ name: 'whatsapp_consent', type: 'boolean', default: false })
  whatsappConsent!: boolean;

  @Column({ name: 'whatsapp_consent_at', type: 'timestamptz', nullable: true })
  whatsappConsentAt!: Date | null;

  @Column({ name: 'whatsapp_consent_text', type: 'text', nullable: true })
  whatsappConsentText!: string | null;
}
