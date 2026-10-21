import { randomBytes, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  DEFAULT_CONSENT_TEXT,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_OS_OPENED_BODY,
  DEFAULT_READY_BODY,
  DEFAULT_RETRY_MINUTES,
  WHATSAPP_OS_OPENED,
  WHATSAPP_READY,
  clockToMinutes,
  firstNameOf,
  minutesUntilSendWindow,
  renderWhatsappBody,
  saoPauloMinutes,
  toWhatsappDigits,
  whatsappMetaBody,
  whatsappParameterValues,
} from './whatsapp.rules';

const GRAPH = 'https://graph.facebook.com/v21.0';

type Sql = Pick<DataSource, 'query'>;

type SettingsRow = {
  id: string;
  tenant_id: string;
  phone_display: string;
  waba_id: string;
  phone_number_id: string;
  access_token: string;
  environment: string;
  max_attempts: number;
  retry_interval_minutes: number;
  send_window_start: string | null;
  send_window_end: string | null;
  consent_text: string;
  public_link_origin: string;
  webhook_verify_token: string;
};

type TemplateRow = {
  id: string;
  code: string;
  body: string;
  meta_name: string;
  meta_language: string;
  status: string;
  status_detail: string | null;
};

type OrderContext = {
  id: string;
  tenant_id: string;
  branch_id: string;
  customer_id: string;
  order_no: string;
  group_id: string | null;
  public_token: string | null;
  promised_delivery_date: string | null;
  promised_delivery_time: string | null;
  legal_name: string;
  phone: string;
  whatsapp_consent: boolean;
  company_name: string | null;
};

export async function ensureWhatsappAccount(sql: Sql, tenantId: string, actorUserId: string): Promise<SettingsRow> {
  const existing = await sql.query(`SELECT * FROM whatsapp_settings WHERE tenant_id = $1`, [tenantId]);
  let settings = existing[0] as SettingsRow | undefined;
  if (!settings) {
    const id = randomUUID();
    const token = randomBytes(16).toString('hex');
    const inserted = await sql.query(
      `INSERT INTO whatsapp_settings (
         id, tenant_id, consent_text, webhook_verify_token, max_attempts, retry_interval_minutes, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (tenant_id) DO NOTHING
       RETURNING *`,
      [id, tenantId, DEFAULT_CONSENT_TEXT, token, DEFAULT_MAX_ATTEMPTS, DEFAULT_RETRY_MINUTES, actorUserId],
    );
    settings = (inserted[0] as SettingsRow | undefined) ?? ((await sql.query(`SELECT * FROM whatsapp_settings WHERE tenant_id = $1`, [tenantId]))[0] as SettingsRow);
  }
  await sql.query(
    `INSERT INTO whatsapp_templates (id, tenant_id, code, body, meta_name, updated_by)
     VALUES ($1, $2, 'os_opened', $3, 'anexsys_os_aberta', $4)
     ON CONFLICT (tenant_id, code) DO NOTHING`,
    [randomUUID(), tenantId, DEFAULT_OS_OPENED_BODY, actorUserId],
  );
  await sql.query(
    `INSERT INTO whatsapp_templates (id, tenant_id, code, body, meta_name, updated_by)
     VALUES ($1, $2, 'ready_for_pickup', $3, 'anexsys_pronto_retirada', $4)
     ON CONFLICT (tenant_id, code) DO NOTHING`,
    [randomUUID(), tenantId, DEFAULT_READY_BODY, actorUserId],
  );
  return settings;
}

export async function enqueueWhatsappNotice(
  dataSource: DataSource,
  tenantId: string,
  serviceOrderId: string,
  kind: typeof WHATSAPP_OS_OPENED | typeof WHATSAPP_READY,
  actorUserId: string,
): Promise<void> {
  await ensureWhatsappAccount(dataSource, tenantId, actorUserId);
  const context = await loadOrderContext(dataSource, tenantId, serviceOrderId);
  if (!context) {
    return;
  }
  const template = await loadTemplate(dataSource, tenantId, kind);
  if (!template) {
    return;
  }
  const settings = (await dataSource.query(`SELECT * FROM whatsapp_settings WHERE tenant_id = $1`, [tenantId]))[0] as SettingsRow;
  const values = messageValues(context, settings.public_link_origin);
  const preview = renderWhatsappBody(template.body, values);
  const groupId = context.group_id || context.id;
  const status = context.whatsapp_consent ? 'queued' : 'skipped';
  const lastError = context.whatsapp_consent ? null : 'Cliente sem autorização para aviso por WhatsApp.';
  await dataSource.query(
    `INSERT INTO whatsapp_messages (
       id, tenant_id, branch_id, service_order_id, group_id, customer_id, kind, status,
       body_snapshot, to_phone, last_error, next_attempt_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      tenantId,
      context.branch_id,
      context.id,
      groupId,
      context.customer_id,
      kind,
      status,
      preview,
      toWhatsappDigits(context.phone),
      lastError,
    ],
  );
  await dispatchDueWhatsapp(dataSource, 20);
}

export async function dispatchDueWhatsapp(dataSource: DataSource, limit = 20): Promise<void> {
  await dataSource.query(
    `UPDATE whatsapp_messages
     SET status = 'queued', updated_at = now()
     WHERE status = 'sending' AND updated_at < now() - interval '5 minutes'`,
  );
  const claimed = (await dataSource.query(
    `UPDATE whatsapp_messages
     SET status = 'sending', updated_at = now()
     WHERE id IN (
       SELECT id FROM whatsapp_messages
       WHERE status = 'queued' AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, tenant_id`,
    [limit],
  )) as Array<{ id: string; tenant_id: string }>;
  for (const row of claimed) {
    await deliverMessage(dataSource, row.tenant_id, row.id);
  }
}

export async function submitWhatsappTemplate(sql: Sql, tenantId: string, code: string, actorUserId: string): Promise<TemplateRow> {
  const settings = await ensureWhatsappAccount(sql, tenantId, actorUserId);
  const template = await loadTemplate(sql, tenantId, code);
  if (!template) {
    throw new Error('Modelo de mensagem não encontrado.');
  }
  if (!settings.waba_id || !settings.access_token) {
    throw new Error('Informe a conta e o token da Meta antes de pedir a aprovação.');
  }
  const meta = whatsappMetaBody(template.body);
  const component: Record<string, unknown> = { type: 'BODY', text: meta.text };
  if (meta.keys.length > 0) {
    component.example = {
      body_text: [meta.keys.map((key) => exampleOf(key))],
    };
  }
  const response = await metaFetch(`/${settings.waba_id}/message_templates`, settings.access_token, {
    method: 'POST',
    body: JSON.stringify({
      name: template.meta_name,
      language: template.meta_language || 'pt_BR',
      category: 'UTILITY',
      components: [component],
    }),
  });
  const detail = response.ok ? 'Enviado para análise da Meta.' : response.error;
  const status = response.ok ? 'pending' : template.status;
  const rows = await sql.query(
    `UPDATE whatsapp_templates
     SET status = $3, status_detail = $4, updated_at = now(), updated_by = $5
     WHERE tenant_id = $1 AND code = $2
     RETURNING id, code, body, meta_name, meta_language, status, status_detail`,
    [tenantId, code, status, detail.slice(0, 500), actorUserId],
  );
  return rows[0] as TemplateRow;
}

export async function refreshWhatsappTemplate(sql: Sql, tenantId: string, code: string, actorUserId: string): Promise<TemplateRow> {
  const settings = await ensureWhatsappAccount(sql, tenantId, actorUserId);
  const template = await loadTemplate(sql, tenantId, code);
  if (!template) {
    throw new Error('Modelo de mensagem não encontrado.');
  }
  if (!settings.waba_id || !settings.access_token) {
    throw new Error('Informe a conta e o token da Meta antes de consultar a situação.');
  }
  const response = await metaFetch(
    `/${settings.waba_id}/message_templates?name=${encodeURIComponent(template.meta_name)}`,
    settings.access_token,
  );
  const remote = response.data?.data?.[0]?.status as string | undefined;
  const mapped = remote === 'APPROVED' ? 'approved' : remote === 'REJECTED' ? 'rejected' : remote === 'PENDING' ? 'pending' : template.status;
  const detail = response.ok ? remote || template.status_detail || '' : response.error;
  const rows = await sql.query(
    `UPDATE whatsapp_templates
     SET status = $3, status_detail = $4, updated_at = now(), updated_by = $5
     WHERE tenant_id = $1 AND code = $2
     RETURNING id, code, body, meta_name, meta_language, status, status_detail`,
    [tenantId, code, mapped, String(detail).slice(0, 500), actorUserId],
  );
  return rows[0] as TemplateRow;
}

export async function sendWhatsappTest(sql: Sql, tenantId: string, code: string, phone: string, actorUserId: string): Promise<string> {
  const settings = await ensureWhatsappAccount(sql, tenantId, actorUserId);
  const template = await loadTemplate(sql, tenantId, code);
  if (!template) {
    throw new Error('Modelo de mensagem não encontrado.');
  }
  if (template.status !== 'approved') {
    throw new Error('O teste só sai quando o modelo está aprovado na Meta.');
  }
  const to = toWhatsappDigits(phone);
  if (to.length < 12) {
    throw new Error('Informe o celular com DDD para o teste.');
  }
  const samples = Object.fromEntries(whatsappMetaBody(template.body).keys.map((key) => [key, exampleOf(key)]));
  const sent = await postTemplate(settings, template, to, whatsappParameterValues(template.body, samples));
  if (!sent.ok) {
    throw new Error(sent.error);
  }
  void actorUserId;
  return 'Mensagem de teste aceita pela Meta. Ela só aparece como enviada quando a Meta confirmar.';
}

export async function applyWhatsappWebhook(sql: Sql, body: unknown): Promise<void> {
  const entries = (body as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<Record<string, unknown>> } }> }> })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const messageId = String(status.id ?? '');
        const remote = String(status.status ?? '');
        if (!messageId) {
          continue;
        }
        if (remote === 'failed') {
          const errors = status.errors as Array<{ message?: string; title?: string }> | undefined;
          const reason = errors?.[0]?.message || errors?.[0]?.title || 'A Meta recusou a mensagem.';
          await sql.query(
            `UPDATE whatsapp_messages
             SET status = 'failed', last_error = $2, updated_at = now()
             WHERE meta_message_id = $1 AND status <> 'sent'`,
            [messageId, reason.slice(0, 500)],
          );
          continue;
        }
        if (remote === 'sent' || remote === 'delivered' || remote === 'read') {
          await sql.query(
            `UPDATE whatsapp_messages
             SET status = 'sent', sent_at = COALESCE(sent_at, now()), last_error = NULL, updated_at = now()
             WHERE meta_message_id = $1`,
            [messageId],
          );
        }
      }
    }
  }
}

export async function verifyWhatsappWebhook(sql: Sql, mode: string, token: string, challenge: string): Promise<string | null> {
  if (mode !== 'subscribe' || !token || !challenge) {
    return null;
  }
  const rows = await sql.query(`SELECT 1 FROM whatsapp_settings WHERE webhook_verify_token = $1 LIMIT 1`, [token]);
  return rows.length > 0 ? challenge : null;
}

async function deliverMessage(sql: Sql, tenantId: string, messageId: string): Promise<void> {
  const messages = await sql.query(`SELECT * FROM whatsapp_messages WHERE id = $1 AND tenant_id = $2`, [messageId, tenantId]);
  const message = messages[0] as
    | {
        id: string;
        service_order_id: string;
        kind: string;
        attempt_count: number;
      }
    | undefined;
  if (!message) {
    return;
  }
  const settingsRows = await sql.query(`SELECT * FROM whatsapp_settings WHERE tenant_id = $1`, [tenantId]);
  const settings = settingsRows[0] as SettingsRow | undefined;
  const template = await loadTemplate(sql, tenantId, message.kind);
  const context = await loadOrderContext(sql, tenantId, message.service_order_id);
  if (!settings || !template || !context) {
    await failMessage(sql, messageId, message.attempt_count, settings?.max_attempts ?? DEFAULT_MAX_ATTEMPTS, settings?.retry_interval_minutes ?? DEFAULT_RETRY_MINUTES, 'A ordem de serviço não está mais disponível.');
    return;
  }
  if (!context.whatsapp_consent) {
    await sql.query(
      `UPDATE whatsapp_messages
       SET status = 'skipped', last_error = $2, updated_at = now()
       WHERE id = $1`,
      [messageId, 'Cliente sem autorização para aviso por WhatsApp.'],
    );
    return;
  }
  const wait = minutesUntilSendWindow(saoPauloMinutes(new Date()), clockToMinutes(settings.send_window_start), clockToMinutes(settings.send_window_end));
  if (wait !== null && wait > 0) {
    await sql.query(
      `UPDATE whatsapp_messages
       SET status = 'queued', next_attempt_at = now() + ($2 || ' minutes')::interval, updated_at = now()
       WHERE id = $1`,
      [messageId, String(wait)],
    );
    return;
  }
  const values = messageValues(context, settings.public_link_origin);
  const preview = renderWhatsappBody(template.body, values);
  const phone = toWhatsappDigits(context.phone);
  const blocked = blockReason(settings, template, phone, values.link);
  if (blocked) {
    await sql.query(
      `UPDATE whatsapp_messages
       SET status = 'failed', body_snapshot = $2, to_phone = $3, last_error = $4, updated_at = now()
       WHERE id = $1`,
      [messageId, preview, phone, blocked],
    );
    return;
  }
  const sent = await postTemplate(settings, template, phone, whatsappParameterValues(template.body, values));
  if (sent.ok) {
    await sql.query(
      `UPDATE whatsapp_messages
       SET status = 'accepted', body_snapshot = $2, to_phone = $3, meta_message_id = $4, last_error = NULL, updated_at = now()
       WHERE id = $1`,
      [messageId, preview, phone, sent.messageId],
    );
    return;
  }
  await failMessage(sql, messageId, message.attempt_count, settings.max_attempts, settings.retry_interval_minutes, sent.error, preview, phone);
}

async function failMessage(
  sql: Sql,
  messageId: string,
  attemptCount: number,
  maxAttempts: number,
  retryMinutes: number,
  error: string,
  preview?: string,
  phone?: string,
): Promise<void> {
  const nextAttempt = attemptCount + 1;
  const status = nextAttempt >= maxAttempts ? 'failed' : 'queued';
  await sql.query(
    `UPDATE whatsapp_messages
     SET status = $2,
         attempt_count = $3,
         last_error = $4,
         body_snapshot = COALESCE($5, body_snapshot),
         to_phone = COALESCE($6, to_phone),
         next_attempt_at = now() + ($7 || ' minutes')::interval,
         updated_at = now()
     WHERE id = $1`,
    [messageId, status, nextAttempt, error.slice(0, 500), preview ?? null, phone ?? null, String(retryMinutes)],
  );
}

function blockReason(settings: SettingsRow, template: TemplateRow, phone: string, link: string): string | null {
  if (!settings.phone_number_id || !settings.access_token) {
    return 'A conta de WhatsApp ainda não está configurada.';
  }
  if (template.status !== 'approved') {
    return 'O modelo ainda não está aprovado na Meta.';
  }
  if (!settings.public_link_origin) {
    return 'Informe o endereço do link na tela de WhatsApp.';
  }
  if (!link.startsWith('http')) {
    return 'Informe o endereço do link na tela de WhatsApp.';
  }
  if (phone.length < 12) {
    return 'O cliente não tem WhatsApp válido.';
  }
  return null;
}

async function postTemplate(
  settings: SettingsRow,
  template: TemplateRow,
  to: string,
  parameters: string[],
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template.meta_name,
      language: { code: template.meta_language || 'pt_BR' },
      ...(parameters.length > 0
        ? {
            components: [
              {
                type: 'body',
                parameters: parameters.map((text) => ({ type: 'text', text })),
              },
            ],
          }
        : {}),
    },
  };
  const response = await metaFetch(`/${settings.phone_number_id}/messages`, settings.access_token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  const messageId = response.data?.messages?.[0]?.id;
  if (!messageId) {
    return { ok: false, error: 'A Meta não devolveu o identificador da mensagem.' };
  }
  return { ok: true, messageId: String(messageId) };
}

async function metaFetch(
  path: string,
  token: string,
  init?: { method?: string; body?: string },
): Promise<{ ok: boolean; error: string; data?: { messages?: Array<{ id?: string }>; data?: Array<{ status?: string }> } }> {
  try {
    const response = await fetch(`${GRAPH}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: init?.body,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; error_user_msg?: string };
      messages?: Array<{ id?: string }>;
      data?: Array<{ status?: string }>;
    };
    if (!response.ok) {
      return { ok: false, error: data.error?.error_user_msg || data.error?.message || 'A Meta recusou o envio.', data };
    }
    return { ok: true, error: '', data };
  } catch {
    return { ok: false, error: 'Não foi possível falar com a Meta.' };
  }
}

async function loadTemplate(sql: Sql, tenantId: string, code: string): Promise<TemplateRow | null> {
  const rows = await sql.query(
    `SELECT id, code, body, meta_name, meta_language, status, status_detail
     FROM whatsapp_templates WHERE tenant_id = $1 AND code = $2`,
    [tenantId, code],
  );
  return (rows[0] as TemplateRow | undefined) ?? null;
}

async function loadOrderContext(sql: Sql, tenantId: string, serviceOrderId: string): Promise<OrderContext | null> {
  const rows = await sql.query(
    `SELECT o.id, o.tenant_id, o.branch_id, o.customer_id, o.order_no, o.group_id, o.public_token,
            o.promised_delivery_date::text AS promised_delivery_date, o.promised_delivery_time,
            c.legal_name, c.phone, c.whatsapp_consent,
            (
              SELECT COALESCE(NULLIF(company.trade_name, ''), company.legal_name)
              FROM companies company
              WHERE company.tenant_id = o.tenant_id AND company.is_deleted = false
              ORDER BY company.created_at
              LIMIT 1
            ) AS company_name
     FROM service_orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.tenant_id = $2 AND o.is_deleted = false`,
    [serviceOrderId, tenantId],
  );
  return (rows[0] as OrderContext | undefined) ?? null;
}

function messageValues(context: OrderContext, origin: string): Record<string, string> {
  const date = formatPromise(context.promised_delivery_date, context.promised_delivery_time);
  const base = origin.trim().replace(/\/+$/, '');
  const link = context.public_token && base ? `${base}/os/${context.public_token}` : '';
  return {
    primeiro_nome: firstNameOf(context.legal_name),
    estabelecimento: context.company_name?.trim() || 'Ateliê',
    numero_os: context.order_no,
    previsao: date,
    link,
  };
}

function formatPromise(date: string | null, time: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!match) {
    return '—';
  }
  const formatted = `${match[3]}/${match[2]}/${match[1]}`;
  return time ? `${formatted} às ${time}` : formatted;
}

function exampleOf(key: string): string {
  if (key === 'primeiro_nome') return 'Maria';
  if (key === 'estabelecimento') return 'Ateliê';
  if (key === 'numero_os') return 'AAA000001';
  if (key === 'previsao') return '28/10/2026';
  return 'https://atelier.exemplo/os/acompanhar';
}
