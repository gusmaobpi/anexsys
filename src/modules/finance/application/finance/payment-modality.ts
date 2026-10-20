import { PaymentModality } from 'src/shared/domain/enums';

const OPERATOR_PRODUCT_TO_MODALITY: Record<string, PaymentModality> = {
  CREDIT: PaymentModality.CREDIT,
  CREDITO: PaymentModality.CREDIT,
  CREDITO_AVISTA: PaymentModality.CREDIT,
  DEBIT: PaymentModality.DEBIT,
  DEBITO: PaymentModality.DEBIT,
  DEBITO_AVISTA: PaymentModality.DEBIT,
  PIX: PaymentModality.PIX,
  VOUCHER: PaymentModality.VOUCHER,
};

const MODALITY_TO_CIELO_PAYMENT_CODE: Record<string, string> = {
  [PaymentModality.CREDIT]: 'CREDITO_AVISTA',
  [PaymentModality.DEBIT]: 'DEBITO_AVISTA',
  [PaymentModality.PIX]: 'PIX',
};

export function cieloPaymentCode(modality: string | null | undefined): string | null {
  const normalized = modality?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return MODALITY_TO_CIELO_PAYMENT_CODE[normalized] ?? null;
}

export function mapOperatorProductToModality(productCode: string | null | undefined): PaymentModality | null {
  const normalized = productCode?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return OPERATOR_PRODUCT_TO_MODALITY[normalized] ?? null;
}

export function modalitiesDiverge(
  informed: PaymentModality | string | null | undefined,
  confirmed: PaymentModality | string | null | undefined,
): boolean {
  return Boolean(informed && confirmed && informed !== confirmed);
}
