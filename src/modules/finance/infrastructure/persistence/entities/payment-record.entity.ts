import { Column, Entity } from 'typeorm';
import { PaymentDirection, PaymentMethod, PaymentModality, PaymentProviderName, PaymentRecordStatus } from 'src/shared/domain/enums';
import { MutableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'payment_records' })
export class PaymentRecordEntity extends MutableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @Column({ name: 'billing_scope_id', type: 'uuid' })
  billingScopeId!: string;

  @Column({ name: 'informed_modality', type: 'varchar', length: 20, nullable: true })
  informedModality!: PaymentModality | null;

  @Column({ name: 'confirmed_modality', type: 'varchar', length: 20, nullable: true })
  confirmedModality!: PaymentModality | null;

  @Column({ name: 'operator_product_code', type: 'varchar', length: 80, nullable: true })
  operatorProductCode!: string | null;

  @Column({ name: 'payment_reference_no', type: 'varchar', length: 50, nullable: true })
  paymentReferenceNo!: string | null;

  @Column({ name: 'payment_method', type: 'varchar', length: 30 })
  paymentMethod!: PaymentMethod;

  @Column({ name: 'payment_provider', type: 'varchar', length: 30, nullable: true })
  paymentProvider!: PaymentProviderName | null;

  @Column({ name: 'payment_direction', type: 'varchar', length: 20, default: PaymentDirection.INBOUND })
  paymentDirection!: PaymentDirection;

  @Column({ name: 'payment_amount', type: 'numeric', precision: 18, scale: 2 })
  paymentAmount!: string;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt!: Date | null;

  @Column({ name: 'authorized_at', type: 'timestamptz', nullable: true })
  authorizedAt!: Date | null;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt!: Date | null;

  @Column({ name: 'card_brand', type: 'varchar', length: 30, nullable: true })
  cardBrand!: string | null;

  @Column({ name: 'installments', type: 'integer', nullable: true })
  installments!: number | null;

  @Column({ name: 'nsu', type: 'varchar', length: 40, nullable: true })
  nsu!: string | null;

  @Column({ name: 'authorization_code', type: 'varchar', length: 60, nullable: true })
  authorizationCode!: string | null;

  @Column({ name: 'acquirer_transaction_id', type: 'varchar', length: 80, nullable: true })
  acquirerTransactionId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status!: PaymentRecordStatus;

  @Column({ name: 'manual_reason', type: 'varchar', length: 200, nullable: true })
  manualReason!: string | null;

  @Column({ name: 'reversal_reason', type: 'varchar', length: 200, nullable: true })
  reversalReason!: string | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt!: Date | null;

  @Column({ name: 'reversed_by', type: 'uuid', nullable: true })
  reversedBy!: string | null;
}
