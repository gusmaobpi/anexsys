import { AuditEventEntity } from 'src/modules/audit/infrastructure/persistence/entities/audit-event.entity';
import { RoleEntity } from 'src/modules/authorization/infrastructure/persistence/entities/role.entity';
import { PermissionEntity } from 'src/modules/authorization/infrastructure/persistence/entities/permission.entity';
import { RolePermissionEntity } from 'src/modules/authorization/infrastructure/persistence/entities/role-permission.entity';
import { CommunityPermissionEntity } from 'src/modules/authorization/infrastructure/persistence/entities/community-permission.entity';
import { CommunityEntity } from 'src/modules/authorization/infrastructure/persistence/entities/community.entity';
import { UserCommunityEntity } from 'src/modules/authorization/infrastructure/persistence/entities/user-community.entity';
import { WorkGroupEntity } from 'src/modules/authorization/infrastructure/persistence/entities/work-group.entity';
import { WorkGroupMemberEntity } from 'src/modules/authorization/infrastructure/persistence/entities/work-group-member.entity';
import { UserBranchScopeEntity } from 'src/modules/authorization/infrastructure/persistence/entities/user-branch-scope.entity';
import { UserRoleAssignmentEntity } from 'src/modules/authorization/infrastructure/persistence/entities/user-role-assignment.entity';
import { BranchEntity } from 'src/modules/branch/infrastructure/persistence/entities/branch.entity';
import { CompanyEntity } from 'src/modules/company/infrastructure/persistence/entities/company.entity';
import { BranchOperatingHoursEntity } from 'src/modules/company/infrastructure/persistence/entities/branch-operating-hours.entity';
import { TenantModuleEntity } from 'src/modules/company/infrastructure/persistence/entities/tenant-module.entity';
import { CustomerEntity } from 'src/modules/crm/infrastructure/persistence/entities/customer.entity';
import { CustomerPortalProfileEntity } from 'src/modules/customer-portal/infrastructure/persistence/entities/customer-portal-profile.entity';
import { StatusVisibilityMappingEntity } from 'src/modules/customer-portal/infrastructure/persistence/entities/status-visibility-mapping.entity';
import { CustomerContactEntity } from 'src/modules/crm/infrastructure/persistence/entities/customer-contact.entity';
import { CustomerInteractionEntity } from 'src/modules/crm/infrastructure/persistence/entities/customer-interaction.entity';
import { MeasurementBodyPartEntity } from 'src/modules/crm/infrastructure/persistence/entities/measurement-body-part.entity';
import { MeasurementRecordEntity } from 'src/modules/crm/infrastructure/persistence/entities/measurement-record.entity';
import { MeasurementSetEntity } from 'src/modules/crm/infrastructure/persistence/entities/measurement-set.entity';
import { MeasurementSetItemEntity } from 'src/modules/crm/infrastructure/persistence/entities/measurement-set-item.entity';
import { MeasurementUnitEntity } from 'src/modules/crm/infrastructure/persistence/entities/measurement-unit.entity';
import { OperationalResourceBranchScopeEntity } from 'src/modules/operational-resources/infrastructure/persistence/entities/operational-resource-branch-scope.entity';
import { OperationalResourceEntity } from 'src/modules/operational-resources/infrastructure/persistence/entities/operational-resource.entity';
import { ProductionExecutionEventEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/production-execution-event.entity';
import { QualityRecordEntity } from 'src/modules/quality/infrastructure/persistence/entities/quality-record.entity';
import { CustomerRejectionEntity } from 'src/modules/quality/infrastructure/persistence/entities/customer-rejection.entity';
import { ReworkCaseEntity } from 'src/modules/rework/infrastructure/persistence/entities/rework-case.entity';
import { WarrantyAdjustmentEntity } from 'src/modules/warranty/infrastructure/persistence/entities/warranty-adjustment.entity';
import { WarrantyExecutionEntity } from 'src/modules/warranty/infrastructure/persistence/entities/warranty-execution.entity';
import { FinancialExceptionEntity } from 'src/modules/finance/infrastructure/persistence/entities/financial-exception.entity';
import { PartialPaymentEntity } from 'src/modules/finance/infrastructure/persistence/entities/partial-payment.entity';
import { PaymentRecordEntity } from 'src/modules/finance/infrastructure/persistence/entities/payment-record.entity';
import { FiscalDocumentEntity } from 'src/modules/fiscal/infrastructure/persistence/entities/fiscal-document.entity';
import { CameraSnapshotEntity } from 'src/modules/custody/infrastructure/persistence/entities/camera-snapshot.entity';
import { CctvReferenceEntity } from 'src/modules/custody/infrastructure/persistence/entities/cctv-reference.entity';
import { CustodyEventEntity } from 'src/modules/custody/infrastructure/persistence/entities/custody-event.entity';
import { PhysicalBagSupportContextEntity } from 'src/modules/custody/infrastructure/persistence/entities/physical-bag-support-context.entity';
import { StorageLocationAssignmentEntity } from 'src/modules/custody/infrastructure/persistence/entities/storage-location-assignment.entity';
import { StorageLocationEntity } from 'src/modules/custody/infrastructure/persistence/entities/storage-location.entity';
import { ProductionOrderOperationalAssignmentEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/production-order-operational-assignment.entity';
import { ProductionOrderItemLinkEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/production-order-item-link.entity';
import { ProductionOrderVersionEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/production-order-version.entity';
import { ProductionOrderEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/production-order.entity';
import { QrCodeEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/qr-code.entity';
import { QrEventEntity } from 'src/modules/production-orders/infrastructure/persistence/entities/qr-event.entity';
import { CommunicationEventEntity } from 'src/modules/pickup/infrastructure/persistence/entities/communication-event.entity';
import { DigitalApprovalEntity } from 'src/modules/pickup/infrastructure/persistence/entities/digital-approval.entity';
import { PickupAuthorizationEntity } from 'src/modules/pickup/infrastructure/persistence/entities/pickup-authorization.entity';
import { PickupQrCodeEntity } from 'src/modules/pickup/infrastructure/persistence/entities/pickup-qr-code.entity';
import { PickupTokenEntity } from 'src/modules/pickup/infrastructure/persistence/entities/pickup-token.entity';
import { TemporaryPickupCodeEntity } from 'src/modules/pickup/infrastructure/persistence/entities/temporary-pickup-code.entity';
import { AtelierServiceEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/atelier-service.entity';
import { BusinessCalendarDayEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/business-calendar-day.entity';
import { GarmentProductEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/garment-product.entity';
import { GarmentProductServiceEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/garment-product-service.entity';
import { ServiceOrderEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/service-order.entity';
import { ServiceOrderItemEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/service-order-item.entity';
import { ServiceOrderApprovalEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/service-order-approval.entity';
import { ServiceOrderPickupEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/service-order-pickup.entity';
import { ServiceOrderProofNoteEntity } from 'src/modules/service-orders/infrastructure/persistence/entities/service-order-proof-note.entity';
import { FirstAccessTokenEntity } from 'src/modules/identity/infrastructure/persistence/entities/first-access-token.entity';
import { UserContextPreferenceEntity } from 'src/modules/identity/infrastructure/persistence/entities/user-context-preference.entity';
import { UserCredentialEntity } from 'src/modules/identity/infrastructure/persistence/entities/user-credential.entity';
import { UserIdentityEntity } from 'src/modules/identity/infrastructure/persistence/entities/user-identity.entity';
import { UserSessionEntity } from 'src/modules/identity/infrastructure/persistence/entities/user-session.entity';
import { SmartConciergeCheckInEntity } from 'src/modules/smart-concierge/infrastructure/persistence/entities/smart-concierge-check-in.entity';
import { TenantEntity } from 'src/modules/tenant/infrastructure/persistence/entities/tenant.entity';

export const typeOrmEntities = [
  TenantEntity,
  CompanyEntity,
  TenantModuleEntity,
  BranchEntity,
  BranchOperatingHoursEntity,
  CustomerEntity,
  CustomerPortalProfileEntity,
  CustomerContactEntity,
  CustomerInteractionEntity,
  MeasurementRecordEntity,
  MeasurementBodyPartEntity,
  MeasurementUnitEntity,
  MeasurementSetEntity,
  MeasurementSetItemEntity,
  OperationalResourceEntity,
  OperationalResourceBranchScopeEntity,
  ProductionOrderEntity,
  ProductionOrderItemLinkEntity,
  ProductionOrderVersionEntity,
  ProductionOrderOperationalAssignmentEntity,
  QrCodeEntity,
  QrEventEntity,
  ProductionExecutionEventEntity,
  QualityRecordEntity,
  CustomerRejectionEntity,
  ReworkCaseEntity,
  WarrantyAdjustmentEntity,
  WarrantyExecutionEntity,
  PaymentRecordEntity,
  PartialPaymentEntity,
  FinancialExceptionEntity,
  FiscalDocumentEntity,
  PickupAuthorizationEntity,
  PickupTokenEntity,
  PickupQrCodeEntity,
  TemporaryPickupCodeEntity,
  CommunicationEventEntity,
  SmartConciergeCheckInEntity,
  StatusVisibilityMappingEntity,
  DigitalApprovalEntity,
  StorageLocationEntity,
  StorageLocationAssignmentEntity,
  PhysicalBagSupportContextEntity,
  CustodyEventEntity,
  CctvReferenceEntity,
  CameraSnapshotEntity,
  BusinessCalendarDayEntity,
  GarmentProductEntity,
  GarmentProductServiceEntity,
  AtelierServiceEntity,
  ServiceOrderEntity,
  ServiceOrderItemEntity,
  ServiceOrderProofNoteEntity,
  ServiceOrderPickupEntity,
  ServiceOrderApprovalEntity,
  UserIdentityEntity,
  UserCredentialEntity,
  UserSessionEntity,
  FirstAccessTokenEntity,
  UserContextPreferenceEntity,
  RoleEntity,
  PermissionEntity,
  RolePermissionEntity,
  UserRoleAssignmentEntity,
  UserBranchScopeEntity,
  CommunityEntity,
  CommunityPermissionEntity,
  UserCommunityEntity,
  WorkGroupEntity,
  WorkGroupMemberEntity,
  AuditEventEntity,
] as const;
