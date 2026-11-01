import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { publicOsStatusLabel } from 'src/modules/service-orders/application/service-order/service-order-public';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import {
  ADDRESS_RETENTION_DAYS_DEFAULT,
  LINK_MARGIN_DAYS_DEFAULT,
  PRIVACY_ACCEPTANCE_DEFAULT,
  PRIVACY_INCIDENT_PLAN_DEFAULT,
  PRIVACY_NOTICE_DEFAULT,
  PRIVACY_OPERATOR_DEFAULT,
  PROCESSING_ACTIVITIES,
  RETENTION_INACTIVE_YEARS_DEFAULT,
  SUBJECT_REQUEST_TYPES,
  SUBJECT_RESPONSE_DAYS_DEFAULT,
  addCalendarDays,
  subjectRequestTypeLabel,
  todayInBrasilia,
  type SubjectRequestType,
} from './privacy.rules';

const SETTINGS_AUDIT = 'privacy.settings.updated';

type SettingsRow = {
  id: string;
  privacy_notice: string;
  acceptance_text: string;
  operator_terms: string;
  incident_plan: string;
  link_margin_days: number;
  retention_inactive_years: number;
  address_retention_days: number;
  subject_response_days: number;
  dpo_name: string;
  dpo_email: string;
};

export type ProcessingActivityView = {
  id: string;
  code: string;
  title: string;
  dataCategories: string;
  purpose: string;
  legalBasis: string;
  storage: string;
  notes: string;
};

export type PrivacySettingsView = {
  privacyNotice: string;
  acceptanceText: string;
  operatorTerms: string;
  incidentPlan: string;
  linkMarginDays: number;
  retentionInactiveYears: number;
  addressRetentionDays: number;
  subjectResponseDays: number;
  dpoName: string;
  dpoEmail: string;
  history: Array<{ occurredAt: string; actorName: string; summary: string }>;
};

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async getSettings(tenantId: string, actorUserId: string): Promise<PrivacySettingsView> {
    await this.ensureSettings(tenantId, actorUserId);
    await this.ensureActivities(tenantId, actorUserId);
    return this.toSettingsView(tenantId, await this.requireSettings(tenantId));
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    input: {
      privacyNotice: string;
      acceptanceText: string;
      operatorTerms: string;
      incidentPlan: string;
      linkMarginDays: number;
      retentionInactiveYears: number;
      addressRetentionDays: number;
      subjectResponseDays: number;
      dpoName: string;
      dpoEmail: string;
    },
  ): Promise<PrivacySettingsView> {
    const next = this.normalizeSettings(input);
    await this.ensureSettings(tenantId, actorUserId);
    const current = await this.requireSettings(tenantId);
    const previous = this.snapshot(current);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      await this.dataSource.query(
        `
          UPDATE privacy_settings
          SET privacy_notice = $2,
              acceptance_text = $3,
              operator_terms = $4,
              incident_plan = $5,
              link_margin_days = $6,
              retention_inactive_years = $7,
              address_retention_days = $8,
              subject_response_days = $9,
              dpo_name = $10,
              dpo_email = $11,
              updated_at = now(),
              updated_by = $12
          WHERE tenant_id = $1
        `,
        [
          tenantId,
          next.privacyNotice,
          next.acceptanceText,
          next.operatorTerms,
          next.incidentPlan,
          next.linkMarginDays,
          next.retentionInactiveYears,
          next.addressRetentionDays,
          next.subjectResponseDays,
          next.dpoName,
          next.dpoEmail,
          actorUserId,
        ],
      );
      await this.auditService.record({
        tenantId,
        actorUserId,
        entityType: 'privacy_settings',
        entityId: current.id,
        action: SETTINGS_AUDIT,
        eventType: 'privacy.write',
        previousValues: previous,
        newValues: next,
      });
    }
    return this.toSettingsView(tenantId, await this.requireSettings(tenantId));
  }

  async listRequests(tenantId: string) {
    const rows = await this.dataSource.query(
      `
        SELECT id, protocol_no, customer_id, requester_name, request_type, description, status,
               opened_on, due_on, response_text, responded_at
        FROM data_subject_requests
        WHERE tenant_id = $1
        ORDER BY protocol_no DESC
      `,
      [tenantId],
    );
    return rows.map(mapRequest);
  }

  async createRequest(
    tenantId: string,
    actorUserId: string,
    input: { requesterName: string; customerId?: string | null; requestType: string; description: string },
  ) {
    const requesterName = requireText(input.requesterName, 3, 160, 'Informe o nome de quem pediu.');
    const description = requireText(input.description, 3, 4000, 'Descreva o pedido do titular.');
    const requestType = this.requireRequestType(input.requestType);
    const customerId = await this.optionalCustomer(tenantId, input.customerId);
    const settings = await this.ensureSettings(tenantId, actorUserId);
    const openedOn = todayInBrasilia();
    const dueOn = addCalendarDays(openedOn, settings.subject_response_days);
    const id = randomUUID();
    await this.dataSource.query(
      `
        INSERT INTO data_subject_requests (
          id, tenant_id, protocol_no, customer_id, requester_name, request_type, description,
          status, opened_on, due_on, response_text, created_by, updated_by
        ) VALUES (
          $1, $2,
          (SELECT COALESCE(MAX(protocol_no), 0) + 1 FROM data_subject_requests WHERE tenant_id = $2),
          $3, $4, $5, $6, 'open', $7, $8, '', $9, $9
        )
      `,
      [id, tenantId, customerId, requesterName, requestType, description, openedOn, dueOn, actorUserId],
    );
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'data_subject_request',
      entityId: id,
      action: 'privacy.request.opened',
      eventType: 'privacy.write',
      newValues: { requesterName, requestType, dueOn },
    });
    return this.requireRequest(tenantId, id);
  }

  async updateRequest(tenantId: string, actorUserId: string, requestId: string, responseText: string) {
    const current = await this.requireRequestRow(tenantId, requestId);
    const response = requireText(responseText, 3, 8000, 'Escreva a resposta dada ao titular.');
    await this.dataSource.query(
      `
        UPDATE data_subject_requests
        SET response_text = $3, status = 'answered', responded_at = now(), updated_at = now(), updated_by = $4
        WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, requestId, response, actorUserId],
    );
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'data_subject_request',
      entityId: requestId,
      action: 'privacy.request.answered',
      eventType: 'privacy.write',
      previousValues: { responseText: current.response_text, status: current.status },
      newValues: { responseText: response, status: 'answered' },
    });
    return this.requireRequest(tenantId, requestId);
  }

  async accessSummary(tenantId: string, requestId: string) {
    const request = await this.requireRequestRow(tenantId, requestId);
    if (request.request_type !== 'access') {
      throw new DomainValidationError('O resumo de acesso vale para pedido do tipo Acesso.');
    }
    if (!request.customer_id) {
      throw new DomainValidationError('Vincule o cliente do cadastro para montar o resumo de acesso.');
    }
    const customers = await this.dataSource.query(
      `
        SELECT legal_name, phone, email, cpf_cnpj, address_line_1, address_number, district, city, state, postal_code, whatsapp_consent
        FROM customers
        WHERE tenant_id = $1 AND id = $2 AND is_deleted = false
      `,
      [tenantId, request.customer_id],
    );
    const customer = customers[0];
    if (!customer) {
      throw new EntityNotFoundError('O cliente deste pedido não foi encontrado.');
    }
    const orders = await this.dataSource.query(
      `
        SELECT order_no, status, opened_at
        FROM service_orders
        WHERE tenant_id = $1 AND customer_id = $2 AND is_deleted = false
        ORDER BY opened_at DESC
        LIMIT 30
      `,
      [tenantId, request.customer_id],
    );
    const address = [customer.address_line_1, customer.address_number, customer.district, customer.city, customer.state, customer.postal_code]
      .filter(Boolean)
      .join(', ');
    const lines = [
      `Resumo para ${customer.legal_name}.`,
      `WhatsApp: ${customer.phone || 'não informado'}.`,
      `E-mail: ${customer.email || 'não informado'}.`,
      `Documento: ${customer.cpf_cnpj || 'não informado'}.`,
      `Endereço: ${address || 'não informado'}.`,
      `Aviso por WhatsApp: ${customer.whatsapp_consent ? 'autorizado' : 'sem autorização registrada'}.`,
      orders.length
        ? `Ordens: ${orders
            .map((order: { order_no: string; status: string }) => `${order.order_no} (${publicOsStatusLabel(order.status)})`)
            .join('; ')}.`
        : 'Nenhuma ordem de serviço encontrada.',
    ];
    return { summary: lines.join('\n') };
  }

  async listActivities(tenantId: string, actorUserId: string): Promise<ProcessingActivityView[]> {
    await this.ensureActivities(tenantId, actorUserId);
    const rows: Array<Record<string, string>> = await this.dataSource.query(
      `
        SELECT id, code, title, data_categories, purpose, legal_basis, storage, notes
        FROM processing_activities
        WHERE tenant_id = $1
        ORDER BY title
      `,
      [tenantId],
    );
    return rows.map((row: Record<string, string>) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      dataCategories: row.data_categories,
      purpose: row.purpose,
      legalBasis: row.legal_basis,
      storage: row.storage,
      notes: row.notes ?? '',
    }));
  }

  async updateActivityNotes(tenantId: string, actorUserId: string, activityId: string, notes: string) {
    const text = (notes ?? '').trim();
    if (text.length > 2000) {
      throw new DomainValidationError('A observação pode ter no máximo 2000 caracteres.');
    }
    const rows = await this.dataSource.query(
      `SELECT id FROM processing_activities WHERE tenant_id = $1 AND id = $2`,
      [tenantId, activityId],
    );
    if (!rows.length) {
      throw new EntityNotFoundError('O registro de tratamento não foi encontrado.');
    }
    await this.dataSource.query(
      `UPDATE processing_activities SET notes = $3, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND id = $2`,
      [tenantId, activityId, text, actorUserId],
    );
    const list = await this.listActivities(tenantId, actorUserId);
    return list.find((item) => item.id === activityId) ?? null;
  }

  async listIncidents(tenantId: string) {
    const rows = await this.dataSource.query(
      `
        SELECT id, protocol_no, title, description, occurred_on, status, notified_on
        FROM privacy_incidents
        WHERE tenant_id = $1
        ORDER BY protocol_no DESC
      `,
      [tenantId],
    );
    return rows.map(mapIncident);
  }

  async createIncident(
    tenantId: string,
    actorUserId: string,
    input: { title: string; description: string; occurredOn: string },
  ) {
    const title = requireText(input.title, 3, 160, 'Informe um título para o incidente.');
    const description = requireText(input.description, 3, 4000, 'Descreva o que aconteceu.');
    const occurredOn = requireDate(input.occurredOn);
    const id = randomUUID();
    await this.dataSource.query(
      `
        INSERT INTO privacy_incidents (id, tenant_id, protocol_no, title, description, occurred_on, status, created_by, updated_by)
        VALUES (
          $1, $2,
          (SELECT COALESCE(MAX(protocol_no), 0) + 1 FROM privacy_incidents WHERE tenant_id = $2),
          $3, $4, $5, 'open', $6, $6
        )
      `,
      [id, tenantId, title, description, occurredOn, actorUserId],
    );
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'privacy_incident',
      entityId: id,
      action: 'privacy.incident.opened',
      eventType: 'privacy.write',
      newValues: { title, occurredOn },
    });
    return this.requireIncident(tenantId, id);
  }

  async updateIncident(tenantId: string, actorUserId: string, incidentId: string, status: string) {
    const current = await this.requireIncident(tenantId, incidentId);
    const next = this.requireIncidentStatus(status);
    const notifiedOn = next === 'notified' ? todayInBrasilia() : null;
    await this.dataSource.query(
      `
        UPDATE privacy_incidents
        SET status = $3, notified_on = $4, updated_at = now(), updated_by = $5
        WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, incidentId, next, notifiedOn, actorUserId],
    );
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'privacy_incident',
      entityId: incidentId,
      action: 'privacy.incident.updated',
      eventType: 'privacy.write',
      previousValues: { status: current.status },
      newValues: { status: next },
    });
    return this.requireIncident(tenantId, incidentId);
  }

  private async ensureSettings(tenantId: string, actorUserId: string): Promise<SettingsRow> {
    const existing = await this.loadSettings(tenantId);
    if (existing) return existing;
    await this.dataSource.query(
      `
        INSERT INTO privacy_settings (
          id, tenant_id, privacy_notice, acceptance_text, operator_terms, incident_plan,
          link_margin_days, retention_inactive_years, address_retention_days, subject_response_days,
          dpo_name, dpo_email, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', '', $11, $11)
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      [
        randomUUID(),
        tenantId,
        PRIVACY_NOTICE_DEFAULT,
        PRIVACY_ACCEPTANCE_DEFAULT,
        PRIVACY_OPERATOR_DEFAULT,
        PRIVACY_INCIDENT_PLAN_DEFAULT,
        LINK_MARGIN_DAYS_DEFAULT,
        RETENTION_INACTIVE_YEARS_DEFAULT,
        ADDRESS_RETENTION_DAYS_DEFAULT,
        SUBJECT_RESPONSE_DAYS_DEFAULT,
        actorUserId,
      ],
    );
    return this.requireSettings(tenantId);
  }

  private async ensureActivities(tenantId: string, actorUserId: string) {
    for (const activity of PROCESSING_ACTIVITIES) {
      await this.dataSource.query(
        `
          INSERT INTO processing_activities (
            id, tenant_id, code, title, data_categories, purpose, legal_basis, storage, notes, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9, $9)
          ON CONFLICT (tenant_id, code) DO NOTHING
        `,
        [
          randomUUID(),
          tenantId,
          activity.code,
          activity.title,
          activity.dataCategories,
          activity.purpose,
          activity.legalBasis,
          activity.storage,
          actorUserId,
        ],
      );
    }
  }

  private async loadSettings(tenantId: string): Promise<SettingsRow | null> {
    const rows = await this.dataSource.query(`SELECT * FROM privacy_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
    return rows[0] ?? null;
  }

  private async requireSettings(tenantId: string): Promise<SettingsRow> {
    const row = await this.loadSettings(tenantId);
    if (!row) throw new EntityNotFoundError('A configuração de privacidade não foi encontrada.');
    return row;
  }

  private async toSettingsView(tenantId: string, row: SettingsRow): Promise<PrivacySettingsView> {
    const events = await this.auditService.listByAction(tenantId, SETTINGS_AUDIT, 12);
    const users: Array<{ id: string; display_name: string }> = await this.dataSource.query(
      `SELECT id, display_name FROM user_identities WHERE tenant_id = $1 AND is_deleted = false`,
      [tenantId],
    );
    const names = new Map<string, string>(users.map((user) => [user.id, user.display_name]));
    return {
      privacyNotice: row.privacy_notice,
      acceptanceText: row.acceptance_text,
      operatorTerms: row.operator_terms,
      incidentPlan: row.incident_plan,
      linkMarginDays: row.link_margin_days,
      retentionInactiveYears: row.retention_inactive_years,
      addressRetentionDays: row.address_retention_days,
      subjectResponseDays: row.subject_response_days,
      dpoName: row.dpo_name ?? '',
      dpoEmail: row.dpo_email ?? '',
      history: events.map((event) => ({
        occurredAt: event.occurredAt.toISOString(),
        actorName: event.actorUserId ? names.get(event.actorUserId) ?? 'Usuário removido' : 'Usuário removido',
        summary: settingsChangeSummary(event.previousValues, event.newValues),
      })),
    };
  }

  private normalizeSettings(input: PrivacySettingsView | Omit<PrivacySettingsView, 'history'>) {
    const dpoEmail = input.dpoEmail.trim().toLowerCase();
    if (dpoEmail && !/^[^\s@]+@[^\s@]+$/.test(dpoEmail)) {
      throw new DomainValidationError('O e-mail do contato de privacidade precisa ser válido.');
    }
    return {
      privacyNotice: requireText(input.privacyNotice, 20, 4000, 'O aviso de privacidade precisa explicar o que é guardado e como pedir acesso.'),
      acceptanceText: requireText(input.acceptanceText, 20, 2000, 'O termo de aceite precisa descrever o que o cliente confirma.'),
      operatorTerms: requireText(input.operatorTerms, 20, 4000, 'O texto do operador precisa dizer quem controla e quem opera os dados.'),
      incidentPlan: requireText(input.incidentPlan, 20, 4000, 'O plano de incidente precisa dizer o que fazer se houver vazamento.'),
      linkMarginDays: requireInteger(input.linkMarginDays, 0, 3650, 'A margem do link fica entre 0 e 3650 dias.'),
      retentionInactiveYears: requireInteger(input.retentionInactiveYears, 1, 20, 'A guarda de inativos fica entre 1 e 20 anos.'),
      addressRetentionDays: requireInteger(input.addressRetentionDays, 1, 3650, 'A guarda do endereço de entrega fica entre 1 e 3650 dias.'),
      subjectResponseDays: requireInteger(input.subjectResponseDays, 1, 90, 'O prazo de resposta ao titular fica entre 1 e 90 dias.'),
      dpoName: input.dpoName.trim().slice(0, 120),
      dpoEmail,
    };
  }

  private snapshot(row: SettingsRow) {
    return {
      privacyNotice: row.privacy_notice,
      acceptanceText: row.acceptance_text,
      operatorTerms: row.operator_terms,
      incidentPlan: row.incident_plan,
      linkMarginDays: row.link_margin_days,
      retentionInactiveYears: row.retention_inactive_years,
      addressRetentionDays: row.address_retention_days,
      subjectResponseDays: row.subject_response_days,
      dpoName: row.dpo_name ?? '',
      dpoEmail: row.dpo_email ?? '',
    };
  }

  private requireRequestType(value: string): SubjectRequestType {
    if (!SUBJECT_REQUEST_TYPES.includes(value as SubjectRequestType)) {
      throw new DomainValidationError('Escolha o tipo do pedido: acesso, correção, anonimização, exclusão ou portabilidade.');
    }
    return value as SubjectRequestType;
  }

  private requireIncidentStatus(value: string) {
    if (value !== 'open' && value !== 'contained' && value !== 'notified') {
      throw new DomainValidationError('A situação do incidente precisa ser aberto, contido ou comunicado.');
    }
    return value;
  }

  private async optionalCustomer(tenantId: string, customerId?: string | null) {
    const id = customerId?.trim() || null;
    if (!id) return null;
    const rows = await this.dataSource.query(
      `SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 AND is_deleted = false`,
      [tenantId, id],
    );
    if (!rows.length) throw new DomainValidationError('O cliente vinculado não pertence a esta Conta.');
    return id;
  }

  private async requireRequestRow(tenantId: string, requestId: string) {
    const rows = await this.dataSource.query(`SELECT * FROM data_subject_requests WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      requestId,
    ]);
    if (!rows.length) throw new EntityNotFoundError('O pedido do titular não foi encontrado.');
    return rows[0];
  }

  private async requireRequest(tenantId: string, requestId: string) {
    return mapRequest(await this.requireRequestRow(tenantId, requestId));
  }

  private async requireIncident(tenantId: string, incidentId: string) {
    const rows = await this.dataSource.query(`SELECT * FROM privacy_incidents WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      incidentId,
    ]);
    if (!rows.length) throw new EntityNotFoundError('O incidente não foi encontrado.');
    return mapIncident(rows[0]);
  }
}

function mapRequest(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    protocolNo: Number(row.protocol_no),
    customerId: (row.customer_id as string | null) ?? null,
    requesterName: String(row.requester_name),
    requestType: String(row.request_type),
    requestTypeLabel: subjectRequestTypeLabel(String(row.request_type)),
    description: String(row.description),
    status: String(row.status),
    statusLabel: row.status === 'answered' ? 'Respondido' : 'Aberto',
    openedOn: String(row.opened_on).slice(0, 10),
    dueOn: String(row.due_on).slice(0, 10),
    responseText: String(row.response_text ?? ''),
    respondedAt: row.responded_at ? new Date(row.responded_at as string).toISOString() : null,
  };
}

function mapIncident(row: Record<string, unknown>) {
  const status = String(row.status);
  return {
    id: String(row.id),
    protocolNo: Number(row.protocol_no),
    title: String(row.title),
    description: String(row.description),
    occurredOn: String(row.occurred_on).slice(0, 10),
    status,
    statusLabel: status === 'notified' ? 'Comunicado' : status === 'contained' ? 'Contido' : 'Aberto',
    notifiedOn: row.notified_on ? String(row.notified_on).slice(0, 10) : null,
  };
}

function requireText(value: string, min: number, max: number, message: string) {
  const text = (value ?? '').trim();
  if (text.length < min || text.length > max) throw new DomainValidationError(message);
  return text;
}

function requireInteger(value: number, min: number, max: number, message: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new DomainValidationError(message);
  return value;
}

function requireDate(value: string) {
  const iso = (value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new DomainValidationError('Informe a data em que o incidente aconteceu.');
  return iso;
}

function settingsChangeSummary(previous: Record<string, unknown> | null, next: Record<string, unknown> | null) {
  const labels: Record<string, string> = {
    privacyNotice: 'aviso de privacidade',
    acceptanceText: 'termo de aceite',
    operatorTerms: 'texto do operador',
    incidentPlan: 'plano de incidente',
    linkMarginDays: 'margem do link',
    retentionInactiveYears: 'guarda de inativos',
    addressRetentionDays: 'guarda do endereço',
    subjectResponseDays: 'prazo de resposta',
    dpoName: 'nome do contato',
    dpoEmail: 'e-mail do contato',
  };
  const changed = Object.keys(labels).filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key]));
  if (changed.length === 0) return 'Gravação sem mudança';
  return changed.map((key) => labels[key]).join(', ');
}
