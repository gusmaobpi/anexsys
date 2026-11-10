import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { normalizeSmsSender, normalizeWhatsappSender, normalizeZenviaToken } from './messaging-channels.rules';

export type MessagingChannelsView = {
  tokenConfigured: boolean;
  tokenHint: string | null;
  whatsappSender: string;
  smsSender: string;
};

type ChannelRow = {
  id: string;
  zenvia_api_token: string;
  whatsapp_sender: string;
  sms_sender: string;
};

@Injectable()
export class MessagingChannelsService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async getChannels(tenantId: string, actorUserId: string): Promise<MessagingChannelsView> {
    await this.ensureRow(tenantId, actorUserId);
    return this.toView(await this.loadRow(tenantId));
  }

  async updateChannels(
    tenantId: string,
    actorUserId: string,
    input: { apiToken?: string; whatsappSender: string; smsSender: string },
  ): Promise<MessagingChannelsView> {
    await this.ensureRow(tenantId, actorUserId);
    const current = await this.loadRow(tenantId);
    const token = normalizeZenviaToken(input.apiToken, current?.zenvia_api_token ?? '');
    const whatsappSender = normalizeWhatsappSender(input.whatsappSender);
    const smsSender = normalizeSmsSender(input.smsSender);
    await this.dataSource.query(
      `
        UPDATE messaging_channels
        SET zenvia_api_token = $2,
            whatsapp_sender = $3,
            sms_sender = $4,
            updated_at = now(),
            updated_by = $5
        WHERE tenant_id = $1
      `,
      [tenantId, token, whatsappSender, smsSender, actorUserId],
    );
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'messaging_channels',
      entityId: current?.id ?? tenantId,
      action: 'messaging.channels.updated',
      eventType: 'whatsapp.write',
      metadata: {
        tokenChanged: token !== (current?.zenvia_api_token ?? ''),
        whatsappSender,
        smsSender,
      },
    });
    return this.getChannels(tenantId, actorUserId);
  }

  private async ensureRow(tenantId: string, actorUserId: string): Promise<void> {
    await this.dataSource.query(
      `
        INSERT INTO messaging_channels (id, tenant_id, created_by, updated_by)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      [randomUUID(), tenantId, actorUserId],
    );
  }

  private async loadRow(tenantId: string): Promise<ChannelRow | null> {
    const rows = await this.dataSource.query(
      `SELECT id, zenvia_api_token, whatsapp_sender, sms_sender FROM messaging_channels WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    return (rows[0] as ChannelRow | undefined) ?? null;
  }

  private toView(row: ChannelRow | null): MessagingChannelsView {
    const token = row?.zenvia_api_token ?? '';
    return {
      tokenConfigured: token.length > 0,
      tokenHint: token.length >= 4 ? token.slice(-4) : null,
      whatsappSender: row?.whatsapp_sender ?? '',
      smsSender: row?.sms_sender ?? '',
    };
  }
}
