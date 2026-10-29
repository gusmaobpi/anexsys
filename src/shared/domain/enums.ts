export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BranchStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum CompanyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum UserStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  INACTIVE = 'inactive',
}

export enum SessionStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

export enum RoleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BranchScopeType {
  MEMBER = 'member',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

export enum CustomerType {
  PERSON = 'person',
  COMPANY = 'company',
}

export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
}

export enum MeasurementCatalogStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum CustomerInteractionType {
  PROFILE_CREATED = 'profile_created',
  PROFILE_UPDATED = 'profile_updated',
  STATUS_CHANGED = 'status_changed',
  MEASUREMENT_RECORDED = 'measurement_recorded',
}

export enum InteractionChannel {
  SYSTEM = 'system',
  PHONE = 'phone',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  PORTAL = 'portal',
}

export enum DeliveryType {
  STANDARD = 'Standard',
  PRIORITY = 'Priority',
  EXPRESS = 'Express',
}

export enum SurchargeMethod {
  FIXED = 'fixed',
  PERCENTAGE = 'percentage',
}

export enum ServiceOrderStatus {
  OPEN = 'open',
  APPROVED = 'approved',
  CANCELLED = 'cancelled',
  IN_PRODUCTION = 'in_production',
  AWAITING_PROOF = 'awaiting_proof',
  AWAITING_QUALITY = 'awaiting_quality',
  QUALITY = 'quality',
  IN_REWORK = 'in_rework',
  READY_FOR_PICKUP = 'ready_for_pickup',
  PICKED_UP = 'picked_up',
}

export enum ServiceOrderReturnKind {
  RECONSERTO = 'reconserto',
  WARRANTY = 'warranty',
  CHARGED = 'charged',
  COUNTER = 'counter',
}

export enum ServiceOrderItemStatus {
  OPEN = 'open',
  CANCELLED = 'cancelled',
}

export enum CalendarDayScope {
  TENANT = 'tenant',
  BRANCH = 'branch',
  HOLIDAY = 'holiday',
}


export enum ProductionOrderStatus {
  OPEN = 'open',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ProductionOrderVersionReason {
  REWORK = 'rework',
  WARRANTY_EXECUTION = 'warranty_execution',
  CORRECTIVE_PRODUCTION = 'corrective_production',
}

export enum OperationalResourceType {
  EMPLOYEE = 'employee',
  DAILY_WORKER = 'daily_worker',
  CONTRACTOR = 'contractor',
}

export enum OperationalResourceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum OperationalAvailabilityStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
}

export enum OperationalAssignmentRole {
  PRIMARY = 'primary',
  PARTICIPANT = 'participant',
}

export enum QrScanType {
  START_EXECUTION = 'start_execution',
  ASSUME_RESPONSIBILITY = 'assume_responsibility',
  UPDATE_STATUS = 'update_status',
  UPDATE_DIARY = 'update_diary',
}

export enum QrScanResult {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum ProductionExecutionEventType {
  EXECUTION_START = 'execution_start',
  RESPONSIBILITY_ASSUMED = 'responsibility_assumed',
  STATUS_UPDATED = 'status_updated',
  DIARY_UPDATED = 'diary_updated',
}

export enum QualityInspectionType {
  INPUT_VALIDATION = 'input_validation',
  IN_PROCESS = 'in_process',
  FINAL = 'final',
  POST_REWORK = 'post_rework',
  POST_WARRANTY = 'post_warranty',
  CUSTOMER_REJECTION = 'customer_rejection',
}

export enum QualityInspectionResult {
  PENDING = 'pending',
  PASSED = 'passed',
  FAILED = 'failed',
}

export enum QualityReleaseDecision {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REWORK_REQUESTED = 'rework_requested',
  WARRANTY_EXECUTION_REQUESTED = 'warranty_execution_requested',
}

export enum DefectSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum CustomerRejectionStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
}

export enum CustomerRejectionResolutionType {
  REWORK = 'rework',
  WARRANTY_ADJUSTMENT = 'warranty_adjustment',
  WARRANTY_EXECUTION = 'warranty_execution',
  REFUND = 'refund',
  REPLACEMENT = 'replacement',
}

export enum ReworkCaseStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}

export enum WarrantyAdjustmentStatus {
  OPEN = 'open',
  APPROVED = 'approved',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

export enum WarrantyExecutionStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

export enum WarrantyStartSource {
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  PIX = 'pix',
  BANK_TRANSFER = 'bank_transfer',
  OTHER = 'other',
}

export enum PaymentModality {
  CREDIT = 'credit',
  DEBIT = 'debit',
  PIX = 'pix',
  VOUCHER = 'voucher',
}

export enum PaymentDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum PaymentRecordStatus {
  AUTHORIZED = 'authorized',
  RECEIVED = 'received',
  SETTLED = 'settled',
  REVERSED = 'reversed',
  FAILED = 'failed',
  PENDING = 'pending',
  CANCELED = 'canceled',
}

export enum ServiceOrderPaymentStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
}

export enum FinancialExceptionType {
  REFUND = 'refund',
  CHARGEBACK = 'chargeback',
  REVERSAL = 'reversal',
  OVERPAYMENT = 'overpayment',
  UNDERPAYMENT = 'underpayment',
  DUPLICATE_PAYMENT = 'duplicate_payment',
  ALLOCATION_CORRECTION = 'allocation_correction',
  FAILED_SETTLEMENT = 'failed_settlement',
}

export enum FinancialExceptionStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

export enum PaymentProviderName {
  STONE = 'stone',
  CIELO = 'cielo',
  PAGBANK = 'pagbank',
}

export enum FiscalDocumentType {
  NFSE = 'nfse',
  NFE = 'nfe',
  NFCE = 'nfce',
  CTE = 'cte',
  MDFE = 'mdfe',
  CREDIT_DOCUMENT = 'credit_document',
  DEBIT_DOCUMENT = 'debit_document',
}

export enum FiscalDocumentStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  CANCELLED = 'cancelled',
  ERROR = 'error',
}

export enum PickupAuthorizationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum PickupAuthorizationPath {
  CUSTOMER = 'customer',
  FAMILY_MEMBER = 'family_member',
  EMPLOYEE = 'employee',
  COURIER = 'courier',
  MOTORCYCLE_COURIER = 'motorcycle_courier',
  THIRD_PARTY = 'third_party',
}

export enum PickupCredentialStatus {
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum PickupCredentialType {
  TOKEN = 'token',
  QR_CODE = 'qr_code',
  TEMPORARY_CODE = 'temporary_code',
  REMOTE_APPROVAL = 'remote_approval',
}

export enum StorageLocationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum CustodyEventStage {
  INTAKE = 'intake',
  PRODUCTION_START = 'production_start',
  PRODUCTION_TRANSFER = 'production_transfer',
  QUALITY = 'quality',
  REWORK = 'rework',
  WARRANTY = 'warranty',
  STORAGE = 'storage',
  DELIVERY = 'delivery',
  PICKUP = 'pickup',
  RETURN = 'return',
}

export enum CommunicationDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

export enum CommunicationDeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export enum DigitalApprovalType {
  PICKUP_AUTHORIZATION = 'pickup_authorization',
  SERVICE_ORDER_APPROVAL = 'service_order_approval',
}

export enum SmartConciergeQueueStatus {
  WAITING = 'waiting',
  CALLED = 'called',
  IN_SERVICE = 'in_service',
  NO_SHOW = 'no_show',
  COMPLETED = 'completed',
}

export enum CustomerIdentificationMethod {
  NAME = 'name',
  PHONE = 'phone',
  WHATSAPP = 'whatsapp',
  CPF = 'cpf',
  CUSTOMER_CODE = 'customer_code',
  QR_CODE = 'qr_code',
  FACIAL_RECOGNITION = 'facial_recognition',
}

export enum DigitalApprovalDecision {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
