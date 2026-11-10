import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

export function normalizeWhatsappSender(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/[A-Za-z]/.test(trimmed)) {
    if (trimmed.length > 64 || /\s/.test(trimmed)) {
      throw new DomainValidationError('A keyword do WhatsApp no sandbox da Zenvia não tem espaço e fica com até 64 caracteres.');
    }
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new DomainValidationError('O remetente de WhatsApp precisa ter DDD e número, com o código do país se houver.');
  }
  return digits;
}

export function normalizeSmsSender(value: string): string {
  const sender = value.trim();
  if (!sender) {
    return '';
  }
  if (sender.length > 20 || !/^[\p{L}0-9][\p{L}0-9 ._-]{0,19}$/u.test(sender)) {
    throw new DomainValidationError('O remetente de SMS usa até 20 letras, números, ponto, espaço, _ ou -.');
  }
  return sender;
}

export function normalizeZenviaToken(value: string | undefined, current: string): string {
  const token = value?.trim() ?? '';
  if (!token) {
    return current;
  }
  if (token.length > 500) {
    throw new DomainValidationError('O token da Zenvia está longo demais.');
  }
  return token;
}
