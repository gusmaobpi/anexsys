import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import {
  clockToMinutes,
  unknownWhatsappVariable,
  WHATSAPP_OS_OPENED,
  WHATSAPP_READY,
} from './whatsapp.rules';
import {
  dispatchDueWhatsapp,
  ensureWhatsappAccount,
  refreshWhatsappTemplate,
  sendWhatsappTest,
  submitWhatsappTemplate,
} from './whatsapp.delivery';

export type WhatsappSettingsInput = {
  phoneDisplay?: string;
  wabaId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  environment?: string;
  maxAttempts?: number;
  retryIntervalMinutes?: number;
  sendWindowStart?: string | null;
  sendWindowEnd?: string | null;
  consentText?: string;
  publicLinkOrigin?: string;
};

export type WhatsappTemplateInput = {
  body?: string;
  metaName?: string;
};

@Injectable()
export class WhatsappService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async getSettings(tenantId: string, actorUserId: string) {
    const settings = await ensureWhatsappAccount(this.dataSource, tenantId, actorUserId);
    const templates = await this.dataSource.query(
      `SELECT code, body, meta_name, meta_language, status, status_detail
       FROM whatsapp_templates WHERE tenant_id = $1 ORDER BY code`,
      [tenantId],
    );
    const history = await this.dataSource.query(
      `SELECT phone_display, phone_number_id, replaced_at
       FROM whatsapp_number_history WHERE tenant_id = $1 ORDER BY replaced_at DESC LIMIT 12`,
      [tenantId],
    );
    return this.toSettingsView(settings, templates, history);
  }

  async consentText(tenantId: string, actorUserId: string): Promise<{ consentText: string }> {
    const settings = await ensureWhatsappAccount(this.dataSource, tenantId, actorUserId);
    return { consentText: settings.consent_text };
  }

  async updateSettings(tenantId: string, actorUserId: string, input: WhatsappSettingsInput) {
    const current = await ensureWhatsappAccount(this.dataSource, tenantId, actorUserId);
    const phoneDisplay = this.limited(input.phoneDisplay ?? current.phone_display, 40, 'O número');
    const wabaId = this.digits(input.wabaId ?? current.waba_id, 'A conta da Meta');
    const phoneNumberId = this.digits(input.phoneNumberId ?? current.phone_number_id, 'O identificador do telefone');
    const environment = input.environment ?? current.environment;
    if (environment !== 'test' && environment !== 'production') {
      throw new DomainValidationError('O ambiente é teste ou produção.');
    }
    const maxAttempts = input.maxAttempts ?? current.max_attempts;
    const retryIntervalMinutes = input.retryIntervalMinutes ?? current.retry_interval_minutes;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new DomainValidationError('As tentativas ficam entre 1 e 10.');
    }
    if (!Number.isInteger(retryIntervalMinutes) || retryIntervalMinutes < 1 || retryIntervalMinutes > 120) {
      throw new DomainValidationError('O intervalo fica entre 1 e 120 minutos.');
    }
    const sendWindowStart = this.windowPart(input.sendWindowStart === undefined ? current.send_window_start : input.sendWindowStart);
    const sendWindowEnd = this.windowPart(input.sendWindowEnd === undefined ? current.send_window_end : input.sendWindowEnd);
    if ((sendWindowStart === null) !== (sendWindowEnd === null)) {
      throw new DomainValidationError('Informe o início e o fim da janela, ou deixe os dois vazios para enviar na hora.');
    }
    if (sendWindowStart !== null && sendWindowEnd !== null) {
      const start = clockToMinutes(sendWindowStart);
      const end = clockToMinutes(sendWindowEnd);
      if (start === null || end === null || start >= end) {
        throw new DomainValidationError('A janela precisa terminar no mesmo dia, depois do horário de início.');
      }
    }
    const consentText = (input.consentText ?? current.consent_text).trim();
    if (!consentText || consentText.length > 500) {
      throw new DomainValidationError('O texto de autorização fica entre 1 e 500 caracteres.');
    }
    const publicLinkOrigin = this.origin(input.publicLinkOrigin ?? current.public_link_origin);
    const accessToken = input.accessToken?.trim() ? input.accessToken.trim() : current.access_token;
    if (accessToken.length > 2000) {
      throw new DomainValidationError('O token está longo demais.');
    }
    if (current.phone_number_id && phoneNumberId !== current.phone_number_id) {
      await this.dataSource.query(
        `INSERT INTO whatsapp_number_history (id, tenant_id, phone_display, phone_number_id, replaced_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), tenantId, current.phone_display, current.phone_number_id, actorUserId],
      );
    }
    await this.dataSource.query(
      `UPDATE whatsapp_settings
       SET phone_display = $2, waba_id = $3, phone_number_id = $4, access_token = $5, environment = $6,
           max_attempts = $7, retry_interval_minutes = $8, send_window_start = $9, send_window_end = $10,
           consent_text = $11, public_link_origin = $12, updated_at = now(), updated_by = $13
       WHERE tenant_id = $1
       RETURNING *`,
      [
        tenantId,
        phoneDisplay,
        wabaId,
        phoneNumberId,
        accessToken,
        environment,
        maxAttempts,
        retryIntervalMinutes,
        sendWindowStart,
        sendWindowEnd,
        consentText,
        publicLinkOrigin,
        actorUserId,
      ],
    );
    await this.auditService.record({
      tenantId,
      branchId: null,
      actorUserId,
      entityType: 'whatsapp_settings',
      entityId: current.id,
      action: 'whatsapp.settings.updated',
      eventType: 'whatsapp.write',
      previousValues: {
        phoneNumberId: current.phone_number_id,
        maxAttempts: current.max_attempts,
        retryIntervalMinutes: current.retry_interval_minutes,
        publicLinkOrigin: current.public_link_origin,
      },
      newValues: { phoneNumberId, maxAttempts, retryIntervalMinutes, publicLinkOrigin },
    });
    return this.getSettings(tenantId, actorUserId);
  }

  async updateTemplate(tenantId: string, actorUserId: string, code: string, input: WhatsappTemplateInput) {
    this.assertCode(code);
    await ensureWhatsappAccount(this.dataSource, tenantId, actorUserId);
    const currentRows = await this.dataSource.query(
      `SELECT id, body, meta_name, status FROM whatsapp_templates WHERE tenant_id = $1 AND code = $2`,
      [tenantId, code],
    );
    const current = currentRows[0] as { id: string; body: string; meta_name: string; status: string } | undefined;
    if (!current) {
      throw new DomainValidationError('Modelo de mensagem não encontrado.');
    }
    const body = (input.body ?? current.body).trim();
    const metaName = (input.metaName ?? current.meta_name).trim().toLowerCase();
    if (!body || body.length > 1000) {
      throw new DomainValidationError('O texto da mensagem fica entre 1 e 1000 caracteres.');
    }
    const unknown = unknownWhatsappVariable(body);
    if (unknown) {
      throw new DomainValidationError(`A variável ${unknown} não existe. Use as variáveis da tela.`);
    }
    if (!/^[a-z][a-z0-9_]{0,60}$/.test(metaName)) {
      throw new DomainValidationError('O nome do modelo na Meta usa letras minúsculas, números e _.');
    }
    const changed = body !== current.body || metaName !== current.meta_name;
    const status = changed ? 'draft' : current.status;
    await this.dataSource.query(
      `UPDATE whatsapp_templates
       SET body = $3, meta_name = $4, status = $5, status_detail = CASE WHEN $5 = 'draft' THEN NULL ELSE status_detail END,
           updated_at = now(), updated_by = $6
       WHERE tenant_id = $1 AND code = $2`,
      [tenantId, code, body, metaName, status, actorUserId],
    );
    await this.auditService.record({
      tenantId,
      branchId: null,
      actorUserId,
      entityType: 'whatsapp_template',
      entityId: current.id,
      action: 'whatsapp.template.updated',
      eventType: 'whatsapp.write',
      previousValues: { body: current.body, metaName: current.meta_name, status: current.status },
      newValues: { body, metaName, status },
    });
    return this.getSettings(tenantId, actorUserId);
  }

  async submitTemplate(tenantId: string, actorUserId: string, code: string) {
    this.assertCode(code);
    try {
      await submitWhatsappTemplate(this.dataSource, tenantId, code, actorUserId);
    } catch (error) {
      throw new DomainValidationError(error instanceof Error ? error.message : 'A Meta não recebeu o modelo.');
    }
    return this.getSettings(tenantId, actorUserId);
  }

  async refreshTemplate(tenantId: string, actorUserId: string, code: string) {
    this.assertCode(code);
    try {
      await refreshWhatsappTemplate(this.dataSource, tenantId, code, actorUserId);
    } catch (error) {
      throw new DomainValidationError(error instanceof Error ? error.message : 'A situação do modelo não pôde ser consultada.');
    }
    return this.getSettings(tenantId, actorUserId);
  }

  async testTemplate(tenantId: string, actorUserId: string, code: string, phone: string) {
    this.assertCode(code);
    try {
      return { message: await sendWhatsappTest(this.dataSource, tenantId, code, phone, actorUserId) };
    } catch (error) {
      throw new DomainValidationError(error instanceof Error ? error.message : 'O teste não pôde ser enviado.');
    }
  }

  async listMessages(tenantId: string, status?: string) {
    const rows = await this.dataSource.query(
      `SELECT m.id, m.kind, m.status, m.body_snapshot, m.attempt_count, m.last_error, m.created_at, m.sent_at,
              o.order_no, c.legal_name
       FROM whatsapp_messages m
       JOIN service_orders o ON o.id = m.service_order_id
       JOIN customers c ON c.id = m.customer_id
       WHERE m.tenant_id = $1 AND ($2::text IS NULL OR m.status = $2)
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [tenantId, status || null],
    );
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      body: row.body_snapshot,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      orderNo: row.order_no,
      customerName: row.legal_name,
    }));
  }

  async resend(tenantId: string, actorUserId: string, messageId: string) {
    const rows = await this.dataSource.query(
      `UPDATE whatsapp_messages
       SET status = 'queued', attempt_count = 0, last_error = NULL, next_attempt_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status IN ('failed', 'skipped', 'accepted')
       RETURNING id`,
      [messageId, tenantId],
    );
    if (!rows[0]) {
      throw new DomainValidationError('Este aviso não pode ser reenviado.');
    }
    await this.auditService.record({
      tenantId,
      branchId: null,
      actorUserId,
      entityType: 'whatsapp_message',
      entityId: messageId,
      action: 'whatsapp.message.resent',
      eventType: 'whatsapp.resend',
    });
    await dispatchDueWhatsapp(this.dataSource, 20);
    return this.listMessages(tenantId);
  }

  async dispatch(tenantId: string) {
    await dispatchDueWhatsapp(this.dataSource, 20);
    return this.listMessages(tenantId);
  }

  private toSettingsView(
    settings: {
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
    },
    templates: Array<Record<string, unknown>>,
    history: Array<Record<string, unknown>>,
  ) {
    const token = settings.access_token ?? '';
    return {
      phoneDisplay: settings.phone_display,
      wabaId: settings.waba_id,
      phoneNumberId: settings.phone_number_id,
      tokenConfigured: token.length > 0,
      tokenHint: token.length >= 4 ? token.slice(-4) : '',
      environment: settings.environment,
      maxAttempts: settings.max_attempts,
      retryIntervalMinutes: settings.retry_interval_minutes,
      sendWindowStart: settings.send_window_start ?? '',
      sendWindowEnd: settings.send_window_end ?? '',
      consentText: settings.consent_text,
      publicLinkOrigin: settings.public_link_origin,
      webhookVerifyToken: settings.webhook_verify_token,
      templates: templates.map((row) => ({
        code: row.code,
        body: row.body,
        metaName: row.meta_name,
        language: row.meta_language,
        status: row.status,
        statusDetail: row.status_detail,
      })),
      numberHistory: history.map((row) => ({
        phoneDisplay: row.phone_display,
        phoneNumberId: row.phone_number_id,
        replacedAt: row.replaced_at,
      })),
    };
  }

  private assertCode(code: string) {
    if (code !== WHATSAPP_OS_OPENED && code !== WHATSAPP_READY) {
      throw new DomainValidationError('Só existem as mensagens de OS aberta e de pronto para retirada.');
    }
  }

  private limited(value: string, max: number, label: string): string {
    const trimmed = value.trim();
    if (trimmed.length > max) {
      throw new DomainValidationError(`${label} fica com no máximo ${max} caracteres.`);
    }
    return trimmed;
  }

  private digits(value: string, label: string): string {
    const trimmed = value.trim();
    if (trimmed && !/^\d{1,40}$/.test(trimmed)) {
      throw new DomainValidationError(`${label} usa só números.`);
    }
    return trimmed;
  }

  private windowPart(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return null;
    }
    if (clockToMinutes(trimmed) === null) {
      throw new DomainValidationError('O horário da janela usa o formato 09:30.');
    }
    return trimmed;
  }

  private origin(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) {
      return '';
    }
    if (!/^https?:\/\/[^\s]+$/i.test(trimmed) || trimmed.length > 200) {
      throw new DomainValidationError('O endereço do link começa com http:// ou https://.');
    }
    return trimmed;
  }
}
