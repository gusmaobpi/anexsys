import { Column, Entity } from 'typeorm';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'payment_terminals' })
export class PaymentTerminalEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 30 })
  provider!: PaymentProviderName;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'terminal_code', type: 'varchar', length: 80 })
  terminalCode!: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'active' })
  status!: 'active' | 'inactive';
}
