import { PaymentMethod, PaymentProviderName } from 'src/shared/domain/enums';

export interface PaymentProviderInitiationRequest {
  provider: PaymentProviderName;
  referenceNo: string;
  paymentMethod: PaymentMethod;
  informedModality?: string | null;
  amount: number;
  serviceOrderId: string;
  credentials: Record<string, string>;
  environment: string;
  terminalCode?: string | null;
  description?: string | null;
}

export interface PaymentProviderAuthorizationResult {
  provider: PaymentProviderName;
  referenceNo: string;
  authorized: boolean;
  authorizedAt?: string | null;
  failureReason?: string | null;
  awaitingTerminal?: boolean;
  cardBrand?: string | null;
  installments?: number | null;
  nsu?: string | null;
  authorizationCode?: string | null;
  acquirerTransactionId?: string | null;
  confirmedModality?: string | null;
  operatorProductCode?: string | null;
}

export interface PaymentProviderSettlementResult {
  provider: PaymentProviderName;
  referenceNo: string;
  settled: boolean;
  settledAt?: string | null;
  receivedAmount?: number | null;
  canceled?: boolean;
  cardBrand?: string | null;
  installments?: number | null;
  nsu?: string | null;
  authorizationCode?: string | null;
  acquirerTransactionId?: string | null;
  confirmedModality?: string | null;
  operatorProductCode?: string | null;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderName;
  initiatePayment(request: PaymentProviderInitiationRequest): Promise<PaymentProviderAuthorizationResult>;
  reconcileSettlement(
    referenceNo: string,
    options?: { credentials?: Record<string, string>; environment?: string },
  ): Promise<PaymentProviderSettlementResult>;
  cancelOrder?(
    orderId: string,
    options?: { credentials?: Record<string, string>; environment?: string },
  ): Promise<void>;
}
