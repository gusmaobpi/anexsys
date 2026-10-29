import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

export const APPROVAL_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const APPROVAL_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const APPROVAL_ACCEPTED_TEXT = 'Concordo com o serviço e o preço.';
export const APPROVAL_RELEASE_TEXT = 'Produção liberada sem assinatura do cliente.';
export const LINK_ACCEPTANCE_TEXT =
  'Concordo com o serviço e o preço desta OS. Aceito a confirmação eletrônica neste link como comprovante. Li o aviso de privacidade.';
export const PUBLIC_PRIVACY_NOTICE =
  'O ateliê guarda os dados desta ordem de serviço para executar o serviço, avisar sobre o andamento e cumprir prazos legais. Você pode pedir acesso, correção ou exclusão pelo ateliê. Este texto ainda pode ser ajustado.';

export type ApprovalMethod = 'counter' | 'paper' | 'release' | 'link';

export function isCustomerSignatureMethod(method: string | null | undefined): boolean {
  return method === 'counter' || method === 'paper' || method === 'link';
}

export function canRecordApproval(status: string): boolean {
  return status !== 'cancelled' && status !== 'picked_up';
}

export function approvalMethodLabel(method: string | null | undefined): string | null {
  if (method === 'counter') {
    return 'Balcão';
  }
  if (method === 'paper') {
    return 'Papel';
  }
  if (method === 'release') {
    return 'Liberação';
  }
  if (method === 'link') {
    return 'Link do cliente';
  }
  return null;
}

export function normalizeReleaseReason(reason?: string | null): string {
  const text = reason?.trim() ?? '';
  if (text.length < 3) {
    throw new DomainValidationError('Informe o motivo para liberar a produção sem assinatura.');
  }
  return text;
}

export function normalizeApprovalPhoto(
  photo?: { mimeType?: string | null; contentBase64?: string | null; fileName?: string | null } | null,
): { mimeType: string; contentBase64: string; fileName: string } | null {
  const mimeType = photo?.mimeType?.trim().toLowerCase() ?? '';
  const contentBase64 = (photo?.contentBase64 ?? '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!contentBase64) {
    return null;
  }
  if (!APPROVAL_PHOTO_MIME_TYPES.includes(mimeType as (typeof APPROVAL_PHOTO_MIME_TYPES)[number])) {
    throw new DomainValidationError('A foto da OS assinada precisa ser JPEG, PNG ou WebP.');
  }
  const padding = contentBase64.endsWith('==') ? 2 : contentBase64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((contentBase64.length * 3) / 4) - padding;
  if (bytes > APPROVAL_PHOTO_MAX_BYTES) {
    throw new DomainValidationError('A foto da OS assinada pode ter no máximo 4 MB.');
  }
  return {
    mimeType,
    contentBase64,
    fileName: photo?.fileName?.trim() || 'os-assinada.jpg',
  };
}

export function buildApprovalServicesSnapshot(
  items: Array<{
    itemNo: number;
    itemType: string;
    description: string;
    complement?: string | null;
    quantity: string | number;
    unitPrice?: string | number | null;
    discountValue?: string | number | null;
  }>,
) {
  return items.map((item) => ({
    itemNo: item.itemNo,
    itemType: item.itemType,
    description: item.description,
    complement: item.complement ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? null,
    discountValue: item.discountValue ?? null,
  }));
}

export function buildApprovalMeasurementsSnapshot(
  records: Array<{
    measurementLabel: string;
    measurementData: Record<string, unknown>;
    versionNo: number;
    measuredAt: Date | string;
  }>,
): Record<string, unknown> | null {
  if (records.length === 0) {
    return null;
  }
  return Object.fromEntries(
    records.map((record) => [
      record.measurementLabel,
      {
        ...record.measurementData,
        versionNo: record.versionNo,
        measuredAt: record.measuredAt instanceof Date ? record.measuredAt.toISOString() : record.measuredAt,
      },
    ]),
  );
}
