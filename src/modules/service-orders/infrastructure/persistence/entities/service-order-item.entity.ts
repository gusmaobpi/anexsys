import { Column, Entity } from 'typeorm';
import { DeliveryType, ServiceOrderItemStatus } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'service_order_items' })
export class ServiceOrderItemEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @Column({ name: 'item_no', type: 'integer' })
  itemNo!: number;

  @Column({ name: 'item_type', type: 'varchar', length: 50 })
  itemType!: string;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId!: string | null;

  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId!: string | null;

  @Column({ name: 'description', type: 'text' })
  description!: string;

  @Column({ name: 'complement', type: 'text', nullable: true })
  complement!: string | null;

  @Column({ name: 'brand', type: 'varchar', length: 120, default: '' })
  brand!: string;

  @Column({ name: 'model', type: 'varchar', length: 120, default: '' })
  model!: string;

  @Column({ name: 'serial_no', type: 'varchar', length: 120, default: '' })
  serialNo!: string;

  @Column({ name: 'time_minutes', type: 'integer', nullable: true })
  timeMinutes!: number | null;

  @Column({ name: 'quantity', type: 'numeric', precision: 18, scale: 4 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  unitPrice!: string | null;

  @Column({ name: 'discount_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  discountValue!: string | null;

  @Column({ name: 'delivery_type', type: 'varchar', length: 20, nullable: true })
  deliveryType!: DeliveryType | null;

  @Column({ name: 'operational_priority', type: 'varchar', length: 50, nullable: true })
  operationalPriority!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: ServiceOrderItemStatus.OPEN })
  status!: ServiceOrderItemStatus;

  @Column({ name: 'held_for_rework', type: 'boolean', default: false })
  heldForRework!: boolean;

  @Column({ name: 'origin_service_order_item_id', type: 'uuid', nullable: true })
  originServiceOrderItemId!: string | null;
}
