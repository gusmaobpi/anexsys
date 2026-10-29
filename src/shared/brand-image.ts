import { DomainValidationError } from './errors/domain-validation.error';

export const BRAND_IMAGE_MAX_BYTES = 180_000;

const MIME_BY_KIND = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export type BrandImage = {
  mimeType: (typeof MIME_BY_KIND)[keyof typeof MIME_BY_KIND];
  contentBase64: string;
};

export function readBrandImageUpdate(
  mimeType: string | null | undefined,
  contentBase64: string | null | undefined,
): BrandImage | null | undefined {
  if (mimeType === undefined && contentBase64 === undefined) {
    return undefined;
  }
  if (!contentBase64?.trim()) {
    return null;
  }
  return normalizeBrandImage(contentBase64);
}

export function normalizeBrandImage(contentBase64: string): BrandImage {
  const cleaned = contentBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!cleaned) {
    throw new DomainValidationError('Escolha uma imagem JPG, PNG ou WebP.');
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(cleaned, 'base64');
  } catch {
    throw new DomainValidationError('Escolha uma imagem JPG, PNG ou WebP.');
  }
  if (bytes.length === 0 || bytes.length > BRAND_IMAGE_MAX_BYTES) {
    throw new DomainValidationError('A imagem precisa caber no quadro. Escolha um arquivo menor.');
  }
  const mimeType = mimeFromBytes(bytes);
  if (!mimeType) {
    throw new DomainValidationError('Escolha uma imagem JPG, PNG ou WebP.');
  }
  return { mimeType, contentBase64: cleaned };
}

function mimeFromBytes(bytes: Buffer): BrandImage['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return MIME_BY_KIND.jpeg;
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return MIME_BY_KIND.png;
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return MIME_BY_KIND.webp;
  }
  return null;
}
