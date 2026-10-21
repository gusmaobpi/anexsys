import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { sendSmtpMessage, SmtpSecurity } from './smtp-mail';

const RESET_MESSAGE = 'Se o e-mail estiver cadastrado, enviaremos o link para definir a senha.';

export type EmailSettingsView = {
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  fromName: string;
  fromAddress: string;
  publicLinkOrigin: string;
  passwordConfigured: boolean;
  passwordHint: string | null;
};

type MailboxRow = {
  id: string;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  from_name: string;
  from_address: string;
  public_link_origin: string;
};

@Injectable()
export class EmailSettingsService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  passwordResetMessage(): string {
    return RESET_MESSAGE;
  }

  async getSettings(tenantId: string, actorUserId: string): Promise<EmailSettingsView> {
    await this.ensureRow(tenantId, actorUserId);
    const row = await this.loadRow(tenantId);
    return this.toView(row);
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    input: {
      host: string;
      port: number;
      security: string;
      username: string;
      password?: string;
      fromName: string;
      fromAddress: string;
      publicLinkOrigin: string;
    },
  ): Promise<EmailSettingsView> {
    const security = normalizeSecurity(input.security);
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new DomainValidationError('A porta precisa ficar entre 1 e 65535.');
    }
    const fromAddress = input.fromAddress.trim().toLowerCase();
    if (fromAddress && !/^[^\s@]+@[^\s@]+$/.test(fromAddress)) {
      throw new DomainValidationError('O endereço de envio precisa ser um e-mail.');
    }
    const origin = normalizeOrigin(input.publicLinkOrigin);
    await this.ensureRow(tenantId, actorUserId);
    const current = await this.loadRow(tenantId);
    const password = input.password && input.password.length > 0 ? input.password : current?.password ?? '';
    await this.dataSource.query(
      `
        UPDATE email_settings
        SET host = $2,
            port = $3,
            security = $4,
            username = $5,
            password = $6,
            from_name = $7,
            from_address = $8,
            public_link_origin = $9,
            updated_at = now(),
            updated_by = $10
        WHERE tenant_id = $1
      `,
      [
        tenantId,
        input.host.trim(),
        port,
        security,
        input.username.trim(),
        password,
        input.fromName.trim(),
        fromAddress,
        origin,
        actorUserId,
      ],
    );
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'email_settings',
      entityId: current?.id ?? tenantId,
      action: 'email.settings.updated',
      eventType: 'email.write',
      metadata: { host: input.host.trim(), port, security, fromAddress },
    });
    return this.getSettings(tenantId, actorUserId);
  }

  async testSend(tenantId: string, actorUserId: string): Promise<{ sent: true }> {
    const actor = await this.dataSource.query(
      `SELECT email, display_name FROM user_identities WHERE id = $1 AND tenant_id = $2 AND is_deleted = false LIMIT 1`,
      [actorUserId, tenantId],
    );
    const email = actor[0]?.email as string | undefined;
    if (!email) {
      throw new DomainValidationError('O usuário logado não tem e-mail para receber o teste.');
    }
    const mailbox = await this.requireMailbox(tenantId, false);
    try {
      await sendSmtpMessage({
        ...mailbox,
        to: email,
        subject: 'Teste de e-mail do ANEXSYS',
        text: 'A caixa de saída desta Conta está funcionando.',
      });
    } catch (error) {
      throw new DomainValidationError(error instanceof Error ? error.message : 'O e-mail de teste não foi enviado.');
    }
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'email_settings',
      entityId: tenantId,
      action: 'email.settings.tested',
      eventType: 'email.write',
      metadata: { to: email },
    });
    return { sent: true };
  }

  async canEmailLinks(tenantId: string): Promise<boolean> {
    try {
      await this.requireMailbox(tenantId, true);
      return true;
    } catch {
      return false;
    }
  }

  async trySendAccessLink(input: {
    tenantId: string;
    to: string;
    displayName: string;
    token: string;
    purpose: 'invite' | 'reset';
  }): Promise<{ emailed: boolean; reason: string | null }> {
    let mailbox: Awaited<ReturnType<EmailSettingsService['requireMailbox']>>;
    try {
      mailbox = await this.requireMailbox(input.tenantId, true);
    } catch (error) {
      return { emailed: false, reason: error instanceof Error ? error.message : 'O e-mail não foi enviado.' };
    }
    const link = `${mailbox.origin}/redefinir-senha?email=${encodeURIComponent(input.to)}&token=${encodeURIComponent(input.token)}`;
    const text = input.purpose === 'invite'
      ? `Olá ${firstName(input.displayName)},\n\nUse este link para definir sua senha no ANEXSYS. Ele vale por 72 horas e só pode ser usado uma vez.\n\n${link}`
      : `Olá ${firstName(input.displayName)},\n\nRecebemos um pedido para definir uma nova senha no ANEXSYS. O link vale por 72 horas e só pode ser usado uma vez.\n\n${link}\n\nSe você não pediu, ignore este e-mail.`;
    try {
      await sendSmtpMessage({
        ...mailbox,
        to: input.to,
        subject: input.purpose === 'invite' ? 'Acesso ao ANEXSYS' : 'Redefinir senha do ANEXSYS',
        text,
      });
      return { emailed: true, reason: null };
    } catch (error) {
      return { emailed: false, reason: error instanceof Error ? error.message : 'O e-mail não foi enviado.' };
    }
  }

  private async requireMailbox(tenantId: string, needsOrigin: boolean): Promise<{
    host: string;
    port: number;
    security: SmtpSecurity;
    username: string;
    password: string;
    fromName: string;
    fromAddress: string;
    origin: string;
  }> {
    const row = await this.loadRow(tenantId);
    if (!row?.host || !row.username || !row.password || !row.from_address) {
      throw new DomainValidationError('A caixa de e-mail ainda não está configurada.');
    }
    const origin = row.public_link_origin.trim();
    if (needsOrigin && !origin) {
      throw new DomainValidationError('A origem do link ainda não está configurada.');
    }
    return {
      host: row.host,
      port: Number(row.port),
      security: row.security,
      username: row.username,
      password: row.password,
      fromName: row.from_name || 'ANEXSYS',
      fromAddress: row.from_address,
      origin,
    };
  }

  private async ensureRow(tenantId: string, actorUserId: string): Promise<void> {
    await this.dataSource.query(
      `
        INSERT INTO email_settings (
          id, tenant_id, host, port, security, username, password, from_name, from_address, public_link_origin, created_by, updated_by
        )
        VALUES ($1, $2, '', 587, 'starttls', '', '', '', '', '', $3, $3)
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      [randomUUID(), tenantId, actorUserId],
    );
  }

  private async loadRow(tenantId: string): Promise<MailboxRow | null> {
    const rows = await this.dataSource.query(`SELECT * FROM email_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
    return (rows[0] as MailboxRow | undefined) ?? null;
  }

  private toView(row: MailboxRow | null): EmailSettingsView {
    const password = row?.password ?? '';
    return {
      host: row?.host ?? '',
      port: Number(row?.port ?? 587),
      security: row?.security ?? 'starttls',
      username: row?.username ?? '',
      fromName: row?.from_name ?? '',
      fromAddress: row?.from_address ?? '',
      publicLinkOrigin: row?.public_link_origin ?? '',
      passwordConfigured: password.length > 0,
      passwordHint: password.length >= 4 ? password.slice(-4) : null,
    };
  }
}

function normalizeSecurity(value: string): SmtpSecurity {
  if (value === 'none' || value === 'starttls' || value === 'ssl') {
    return value;
  }
  throw new DomainValidationError('A segurança precisa ser STARTTLS, SSL ou nenhuma.');
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (!/^https?:\/\/[^\s/]+$/i.test(trimmed)) {
    throw new DomainValidationError('A origem do link precisa começar com http:// ou https://, sem barra no final.');
  }
  return trimmed;
}

function firstName(displayName: string): string {
  const name = displayName.trim().split(/\s+/)[0];
  return name || 'olá';
}
