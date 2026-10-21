import { Column, Entity } from 'typeorm';
import { DeliveryType, ServiceOrderReturnKind, ServiceOrderStatus, SurchargeMethod } from 'src/shared/domain/enums';
import { SoftDeletableBusinessEntity } from 'src/shared/persistence/base.entity';

@Entity({ name: 'service_orders' })
export class ServiceOrderEntity extends SoftDeletableBusinessEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'workflow_definition_id', type: 'uuid', nullable: true })
  workflowDefinitionId!: string | null;

  @Column({ name: 'current_status_definition_id', type: 'uuid', nullable: true })
  currentStatusDefinitionId!: string | null;

  @Column({ name: 'order_no', type: 'varchar', length: 50 })
  orderNo!: string;

  @Column({ name: 'public_token', type: 'uuid', nullable: true })
  publicToken!: string | null;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId!: string | null;

  @Column({ name: 'group_seq', type: 'integer', nullable: true })
  groupSeq!: number | null;

  @Column({ name: 'version_suffix', type: 'varchar', length: 8, nullable: true })
  versionSuffix!: string | null;

  @Column({ name: 'bag_closed', type: 'boolean', default: false })
  bagClosed!: boolean;

  @Column({ name: 'opened_at', type: 'timestamptz' })
  openedAt!: Date;

  @Column({ name: 'delivery_commitment_source_at', type: 'timestamptz' })
  deliveryCommitmentSourceAt!: Date;

  @Column({ name: 'promised_delivery_date', type: 'date' })
  promisedDeliveryDate!: string;

  @Column({ name: 'promised_delivery_time', type: 'varchar', length: 5, nullable: true })
  promisedDeliveryTime!: string | null;

  @Column({ name: 'difficulty_grade', type: 'smallint', nullable: true })
  difficultyGrade!: number | null;

  @Column({ name: 'actual_pickup_date', type: 'date', nullable: true })
  actualPickupDate!: string | null;

  @Column({ name: 'origin_service_order_id', type: 'uuid', nullable: true })
  originServiceOrderId!: string | null;

  @Column({ name: 'return_kind', type: 'varchar', length: 20, nullable: true })
  returnKind!: ServiceOrderReturnKind | null;

  @Column({ name: 'actual_delivery_date', type: 'date', nullable: true })
  actualDeliveryDate!: string | null;

  @Column({ name: 'actual_delivery_time', type: 'varchar', length: 5, nullable: true })
  actualDeliveryTime!: string | null;

  @Column({ name: 'payment_terms_days', type: 'integer', default: 0 })
  paymentTermsDays!: number;

  @Column({ name: 'delivery_type', type: 'varchar', length: 20, default: DeliveryType.STANDARD })
  deliveryType!: DeliveryType;

  @Column({ name: 'operational_priority', type: 'varchar', length: 50, nullable: true })
  operationalPriority!: string | null;

  @Column({ name: 'commercial_responsible_actor_id', type: 'uuid' })
  commercialResponsibleActorId!: string;

  @Column({ name: 'technical_measurement_responsible_actor_id', type: 'uuid' })
  technicalMeasurementResponsibleActorId!: string;

  @Column({ name: 'delivery_surcharge_method', type: 'varchar', length: 20, nullable: true })
  deliverySurchargeMethod!: SurchargeMethod | null;

  @Column({ name: 'delivery_surcharge_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  deliverySurchargeValue!: string | null;

  @Column({ name: 'commercial_notes', type: 'text', nullable: true })
  commercialNotes!: string | null;

  @Column({ name: 'customer_notes', type: 'text', nullable: true })
  customerNotes!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: ServiceOrderStatus.OPEN })
  status!: ServiceOrderStatus;

  @Column({ name: 'total_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  totalValue!: string | null;

  @Column({ name: 'discount_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  discountValue!: string | null;

  @Column({ name: 'floor_holder_user_id', type: 'uuid', nullable: true })
  floorHolderUserId!: string | null;

  @Column({ name: 'origin_floor_names', type: 'text', nullable: true })
  originFloorNames!: string | null;

  @Column({ name: 'delivery_released_at', type: 'timestamptz', nullable: true })
  deliveryReleasedAt!: Date | null;

  @Column({ name: 'delivery_released_by', type: 'uuid', nullable: true })
  deliveryReleasedBy!: string | null;

  @Column({ name: 'delivery_release_reason', type: 'varchar', length: 200, nullable: true })
  deliveryReleaseReason!: string | null;

  @Column({ name: 'charge_waived_at', type: 'timestamptz', nullable: true })
  chargeWaivedAt!: Date | null;

  @Column({ name: 'charge_waived_by', type: 'uuid', nullable: true })
  chargeWaivedBy!: string | null;

  @Column({ name: 'charge_waived_reason', type: 'varchar', length: 200, nullable: true })
  chargeWaivedReason!: string | null;
}
