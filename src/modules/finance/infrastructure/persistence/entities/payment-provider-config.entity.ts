import { Column, Entity } from 'typeorm';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

export enum PaymentProviderEnvironment {
  SANDBOX = 'sandbox',
  PRODUCTION = 'production',
}

@Entity({ name: 'payment_provider_configs' })
export class PaymentProviderConfigEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 30 })
  provider!: PaymentProviderName;

  @Column({ name: 'environment', type: 'varchar', length: 20, default: PaymentProviderEnvironment.SANDBOX })
  environment!: PaymentProviderEnvironment;

  @Column({ name: 'credentials', type: 'jsonb', default: () => "'{}'" })
  credentials!: Record<string, string>;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'active' })
  status!: 'active' | 'inactive';
}
