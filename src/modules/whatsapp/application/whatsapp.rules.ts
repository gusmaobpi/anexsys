export const WHATSAPP_VARIABLES = [
  { token: '{primeiro_nome}', key: 'primeiro_nome', label: 'Primeiro nome', example: 'Maria' },
  { token: '{estabelecimento}', key: 'estabelecimento', label: 'Estabelecimento', example: 'Ateliê' },
  { token: '{numero_os}', key: 'numero_os', label: 'Número da OS', example: 'AAA000001' },
  { token: '{previsao}', key: 'previsao', label: 'Previsão', example: '28/10/2026' },
  { token: '{link}', key: 'link', label: 'Link', example: 'https://atelier.exemplo/os/acompanhar' },
] as const;

export const WHATSAPP_OS_OPENED = 'os_opened';
export const WHATSAPP_READY = 'ready_for_pickup';

export const DEFAULT_OS_OPENED_BODY =
  'Olá, {primeiro_nome}, aqui é do {estabelecimento}, você está recebendo a sua ordem de serviço digital {numero_os}, acompanhe o status de produção, mas fique tranquila que por este canal avisaremos quando estiver pronto, entre agora para aprovar o que ficou combinado. {link}';

export const DEFAULT_READY_BODY =
  'Olá, {primeiro_nome}, aqui é do {estabelecimento}. A ordem de serviço {numero_os} está pronta para retirada. Previsão: {previsao}. Acompanhe por aqui: {link}';

export const DEFAULT_CONSENT_TEXT =
  'Autorizo o ateliê a me avisar pelo WhatsApp quando a ordem de serviço for aberta e quando estiver pronta para retirada.';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_MINUTES = 15;

const ALLOWED = new Set<string>(WHATSAPP_VARIABLES.map((item) => item.token));

export function unknownWhatsappVariable(body: string): string | null {
  const matches = body.match(/\{[^}]+\}/g) ?? [];
  return matches.find((token) => !ALLOWED.has(token)) ?? null;
}

export function whatsappMetaBody(body: string): { text: string; keys: string[] } {
  const keys: string[] = [];
  const text = body.replace(/\{[a-z_]+\}/g, (token) => {
    const variable = WHATSAPP_VARIABLES.find((item) => item.token === token);
    keys.push(variable?.key ?? token);
    return `{{${keys.length}}}`;
  });
  return { text, keys };
}

export function renderWhatsappBody(body: string, values: Record<string, string>): string {
  return body.replace(/\{[a-z_]+\}/g, (token) => {
    const variable = WHATSAPP_VARIABLES.find((item) => item.token === token);
    const value = variable ? values[variable.key] : '';
    return value?.trim() ? value.trim() : '—';
  });
}

export function whatsappParameterValues(body: string, values: Record<string, string>): string[] {
  return whatsappMetaBody(body).keys.map((key) => {
    const value = values[key]?.trim() || '—';
    return value.replace(/\s+/g, ' ').slice(0, 900);
  });
}

export function minutesUntilSendWindow(nowMinutes: number, start: number | null, end: number | null): number | null {
  if (start === null || end === null) {
    return null;
  }
  if (nowMinutes >= start && nowMinutes < end) {
    return null;
  }
  if (nowMinutes < start) {
    return start - nowMinutes;
  }
  return 24 * 60 - nowMinutes + start;
}

export function clockToMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

export function saoPauloMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function firstNameOf(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || '—';
}

export function toWhatsappDigits(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return digits.startsWith('55') ? digits : `55${digits}`;
}
