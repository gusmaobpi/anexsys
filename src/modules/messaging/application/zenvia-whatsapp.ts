export const ZENVIA_WHATSAPP_URL = 'https://api.zenvia.com/v2/channels/whatsapp/messages';

export function zenviaWhatsappTextBody(from: string, to: string, text: string): Record<string, unknown> {
  return {
    from,
    to,
    contents: [{ type: 'text', text }],
  };
}

export async function sendZenviaWhatsappText(input: {
  token: string;
  from: string;
  to: string;
  text: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const response = await fetch(ZENVIA_WHATSAPP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-API-TOKEN': input.token,
      },
      body: JSON.stringify(zenviaWhatsappTextBody(input.from, input.to, input.text)),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string; code?: string };
    if (!response.ok) {
      return { ok: false, error: data.message || data.code || 'A Zenvia recusou o envio.' };
    }
    if (!data.id) {
      return { ok: false, error: 'A Zenvia não devolveu o identificador da mensagem.' };
    }
    return { ok: true, messageId: String(data.id) };
  } catch {
    return { ok: false, error: 'Não foi possível falar com a Zenvia.' };
  }
}
