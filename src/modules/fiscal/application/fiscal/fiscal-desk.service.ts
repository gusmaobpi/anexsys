import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createSecureContext } from 'tls';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { fiscalPdf } from './fiscal-pdf';
import { certificateAlertDays, fiscalBlockers, paidStatus } from './fiscal.rules';
import { openFiscalSecret, sealFiscalSecret } from './fiscal-secret';

type EnvironmentKind = 'homologation' | 'production';

type OrderSnap = {
  id: string;
  orderNo: string;
  status: string;
  openedAt: string;
  total: number;
  paid: number;
  customerId: string;
  customerName: string;
  document: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  branchId: string;
  companyId: string;
  companyName: string;
  branchName: string;
  services: Array<{ name: string; fiscalCode: string | null; amount: number }>;
};

@Injectable()
export class FiscalDeskService implements OnModuleInit {
  private readonly active = new Set<string>();

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    void this.resume().catch(() => undefined);
  }

  async settings(tenantId: string, branchId: string) {
    const rows = await this.dataSource.query(
      `SELECT c.id AS "companyId", c.legal_name AS "legalName", c.trade_name AS "tradeName", c.cnpj,
              c.municipal_registration AS "municipalRegistration", c.state_registration AS "stateRegistration",
              c.city, c.state, b.display_name AS "branchName",
              s.tax_regime AS "taxRegime", s.main_cnae AS "mainCnae", s.default_service_code AS "defaultServiceCode",
              s.default_iss_rate AS "defaultIssRate", s.fiscal_email AS "fiscalEmail", s.fiscal_responsible AS "fiscalResponsible"
         FROM branches b
         JOIN companies c ON c.id = b.company_id
         LEFT JOIN fiscal_settings s ON s.branch_id = b.id AND s.tenant_id = b.tenant_id
        WHERE b.tenant_id = $1 AND b.id = $2 AND b.is_deleted = false`,
      [tenantId, branchId],
    );
    if (!rows[0]) throw new DomainValidationError('Filial não encontrada.');
    return rows[0];
  }

  async saveSettings(tenantId: string, actorUserId: string, input: {
    branchId: string; legalName: string; tradeName?: string; cnpj?: string; municipalRegistration?: string;
    stateRegistration?: string; city?: string; state?: string; taxRegime?: string; mainCnae?: string;
    defaultServiceCode?: string; defaultIssRate?: string; fiscalEmail?: string; fiscalResponsible?: string;
  }) {
    const current = await this.settings(tenantId, input.branchId);
    await this.dataSource.query(
      `UPDATE companies
          SET legal_name = $3, trade_name = NULLIF($4, ''), cnpj = NULLIF($5, ''),
              municipal_registration = NULLIF($6, ''), state_registration = NULLIF($7, ''),
              city = NULLIF($8, ''), state = NULLIF($9, ''), updated_by = $10, updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, current.companyId, input.legalName.trim(), input.tradeName ?? '', digits(input.cnpj).slice(0, 14), input.municipalRegistration ?? '', input.stateRegistration ?? '', input.city ?? '', (input.state ?? '').toUpperCase().slice(0, 10), actorUserId],
    );
    await this.dataSource.query(
      `INSERT INTO fiscal_settings (
         id, tenant_id, company_id, branch_id, tax_regime, main_cnae, default_service_code, default_iss_rate,
         fiscal_email, fiscal_responsible, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
         tax_regime = EXCLUDED.tax_regime, main_cnae = EXCLUDED.main_cnae,
         default_service_code = EXCLUDED.default_service_code, default_iss_rate = EXCLUDED.default_iss_rate,
         fiscal_email = EXCLUDED.fiscal_email, fiscal_responsible = EXCLUDED.fiscal_responsible,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [randomUUID(), tenantId, current.companyId, input.branchId, input.taxRegime ?? '', input.mainCnae ?? '', input.defaultServiceCode ?? '', Number(input.defaultIssRate || 0), input.fiscalEmail ?? '', input.fiscalResponsible ?? '', actorUserId],
    );
    await this.audit(tenantId, input.branchId, actorUserId, 'fiscal_settings', input.branchId, 'fiscal.settings.updated', { companyId: current.companyId });
    return this.settings(tenantId, input.branchId);
  }

  async branches(tenantId: string) {
    return this.dataSource.query(
      `SELECT b.id, b.display_name AS "displayName", b.company_id AS "companyId", c.legal_name AS "companyName"
         FROM branches b JOIN companies c ON c.id = b.company_id
        WHERE b.tenant_id = $1 AND b.is_deleted = false
        ORDER BY c.legal_name, b.display_name`,
      [tenantId],
    );
  }

  async certificates(tenantId: string, branchId?: string) {
    const rows = (await this.dataSource.query(
      `SELECT id, company_id AS "companyId", branch_id AS "branchId", name, issued_at AS "issuedAt",
              expires_at AS "expiresAt", status
         FROM fiscal_certificates
        WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2)
        ORDER BY expires_at ASC`,
      [tenantId, branchId ?? null],
    )) as Array<{ id: string; expiresAt: string; status: string }>;
    const now = new Date();
    return rows.map((row) => ({
      ...row,
      alertDays: certificateAlertDays(new Date(row.expiresAt), now),
    }));
  }

  async saveCertificate(tenantId: string, actorUserId: string, input: { branchId: string; name: string; pfxBase64: string; password: string; issuedAt?: string; expiresAt: string }) {
    const opened = this.openCertificate(input.pfxBase64, input.password);
    if (!opened.ok) throw new DomainValidationError(opened.message);
    const branch = await this.settings(tenantId, input.branchId);
    const id = randomUUID();
    await this.dataSource.query(
      `UPDATE fiscal_certificates SET status = 'replaced', updated_by = $3, updated_at = now()
        WHERE tenant_id = $1 AND branch_id = $2 AND status = 'active'`,
      [tenantId, input.branchId, actorUserId],
    );
    await this.dataSource.query(
      `INSERT INTO fiscal_certificates (
         id, tenant_id, company_id, branch_id, name, pfx_cipher, password_cipher, issued_at, expires_at, status, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$10)`,
      [id, tenantId, branch.companyId, input.branchId, input.name.trim(), sealFiscalSecret(input.pfxBase64), sealFiscalSecret(input.password), input.issuedAt || null, input.expiresAt, actorUserId],
    );
    await this.audit(tenantId, input.branchId, actorUserId, 'fiscal_certificate', id, 'fiscal.certificate.saved', { name: input.name });
    return { id, valid: true };
  }

  async validateCertificate(tenantId: string, id: string) {
    const row = await this.certificateRow(tenantId, id);
    const opened = this.openCertificate(openFiscalSecret(row.pfx_cipher), openFiscalSecret(row.password_cipher));
    return { id, valid: opened.ok, message: opened.message };
  }

  async testCertificate(tenantId: string, actorUserId: string, id: string) {
    const checked = await this.validateCertificate(tenantId, id);
    const row = await this.certificateRow(tenantId, id);
    await this.dataSource.query(
      `UPDATE fiscal_environments SET last_test_at = now(), certificate_id = $3, updated_by = $4, updated_at = now()
        WHERE tenant_id = $1 AND branch_id = $2 AND is_selected = true`,
      [tenantId, row.branch_id, id, actorUserId],
    );
    await this.audit(tenantId, row.branch_id, actorUserId, 'fiscal_certificate', id, 'fiscal.certificate.tested', { valid: checked.valid });
    return checked;
  }

  async environments(tenantId: string, branchId: string) {
    return this.dataSource.query(
      `SELECT id, kind, is_selected AS "isSelected", certificate_id AS "certificateId",
              last_test_at AS "lastTestAt", last_issue_at AS "lastIssueAt"
         FROM fiscal_environments WHERE tenant_id = $1 AND branch_id = $2 ORDER BY kind`,
      [tenantId, branchId],
    );
  }

  async selectEnvironment(tenantId: string, actorUserId: string, branchId: string, kind: EnvironmentKind, certificateId: string | null) {
    const branch = await this.settings(tenantId, branchId);
    await this.dataSource.query(
      `INSERT INTO fiscal_environments (id, tenant_id, company_id, branch_id, kind, is_selected, certificate_id, updated_by)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7)
       ON CONFLICT (tenant_id, branch_id, kind) DO UPDATE SET
         is_selected = true, certificate_id = EXCLUDED.certificate_id, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [randomUUID(), tenantId, branch.companyId, branchId, kind, certificateId, actorUserId],
    );
    await this.dataSource.query(
      `UPDATE fiscal_environments SET is_selected = false, updated_at = now()
        WHERE tenant_id = $1 AND branch_id = $2 AND kind <> $3`,
      [tenantId, branchId, kind],
    );
    await this.audit(tenantId, branchId, actorUserId, 'fiscal_environment', branchId, 'fiscal.environment.selected', { kind, certificateId });
    return this.environments(tenantId, branchId);
  }

  async orderMarks(tenantId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const orders = await this.loadOrders(tenantId, ids);
    const context = await this.contextByBranch(tenantId, [...new Set(orders.map((order) => order.branchId))]);
    return orders.map((order) => {
      const ctx = context.get(order.branchId);
      const blockers = fiscalBlockers(this.check(order, ctx));
      return {
        id: order.id,
        documentNo: ctx?.issued.get(order.id)?.documentNo ?? null,
        fiscalStatus: ctx?.issued.get(order.id)?.status ?? null,
        issuedAt: ctx?.issued.get(order.id)?.issuedAt ?? null,
        blockedReason: blockers[0] ?? null,
      };
    });
  }

  async preview(tenantId: string, serviceOrderId: string) {
    const [order] = await this.loadOrders(tenantId, [serviceOrderId]);
    if (!order) throw new DomainValidationError('OS não encontrada.');
    const ctx = (await this.contextByBranch(tenantId, [order.branchId])).get(order.branchId);
    return { order, environment: ctx?.environment ?? null, blockers: fiscalBlockers(this.check(order, ctx)) };
  }

  async enqueue(tenantId: string, actorUserId: string, branchId: string, orderIds: string[], mode: 'per_order' | 'consolidated') {
    if (orderIds.length === 0) throw new DomainValidationError('Selecione ao menos uma OS.');
    const id = randomUUID();
    await this.dataSource.query(
      `INSERT INTO fiscal_batches (id, tenant_id, branch_id, mode, status, total_count, created_by)
       VALUES ($1,$2,$3,$4,'running',$5,$6)`,
      [id, tenantId, branchId, mode, orderIds.length, actorUserId],
    );
    const orders = await this.loadOrders(tenantId, orderIds);
    const byId = new Map(orders.map((order) => [order.id, order]));
    for (const orderId of orderIds) {
      await this.dataSource.query(
        `INSERT INTO fiscal_batch_lines (id, tenant_id, batch_id, service_order_id, customer_id, status)
         VALUES ($1,$2,$3,$4,$5,'pending')`,
        [randomUUID(), tenantId, id, orderId, byId.get(orderId)?.customerId ?? null],
      );
    }
    this.kick(id, tenantId, actorUserId);
    return this.batch(tenantId, id);
  }

  async batch(tenantId: string, id: string) {
    const rows = await this.dataSource.query(
      `SELECT id, status, mode, total_count AS "total", processed_count AS "processed",
              issued_count AS "issued", error_count AS "errors"
         FROM fiscal_batches WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!rows[0]) throw new DomainValidationError('Lote fiscal não encontrado.');
    const lines = await this.dataSource.query(
      `SELECT l.service_order_id AS "serviceOrderId", so.order_no AS "orderNo", l.status, l.message
         FROM fiscal_batch_lines l JOIN service_orders so ON so.id = l.service_order_id
        WHERE l.tenant_id = $1 AND l.batch_id = $2 ORDER BY so.order_no`,
      [tenantId, id],
    );
    return { ...rows[0], lines };
  }

  async history(tenantId: string, branchId?: string) {
    return this.dataSource.query(
      `SELECT d.id, d.document_no AS "documentNo", d.status, d.issued_at AS "issuedAt", d.gross_amount AS "amount",
              d.environment, d.protocol, c.legal_name AS "customerName", co.legal_name AS "companyName",
              b.display_name AS "branchName", so.order_no AS "orderNo", u.display_name AS "userName"
         FROM fiscal_documents d
         LEFT JOIN customers c ON c.id = d.customer_id
         LEFT JOIN companies co ON co.id = d.company_id
         LEFT JOIN branches b ON b.id = d.branch_id
         LEFT JOIN service_orders so ON so.id = d.service_order_id
         LEFT JOIN user_identities u ON u.id = d.created_by
        WHERE d.tenant_id = $1 AND ($2::uuid IS NULL OR d.branch_id = $2) AND d.document_type = 'nfse'
        ORDER BY COALESCE(d.issued_at, d.created_at) DESC
        LIMIT 500`,
      [tenantId, branchId ?? null],
    );
  }

  async download(tenantId: string, id: string, kind: 'xml' | 'pdf') {
    const rows = await this.dataSource.query(
      `SELECT document_no AS "documentNo", xml_content AS xml, pdf_content AS pdf, protocol
         FROM fiscal_documents WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    const row = rows[0] as { documentNo: string; xml: string | null; pdf: Buffer | null; protocol: string | null } | undefined;
    if (!row) throw new DomainValidationError('Nota não encontrada.');
    if (kind === 'xml') {
      return { fileName: `${row.documentNo}.xml`, mime: 'application/xml', contentBase64: Buffer.from(row.xml || '').toString('base64') };
    }
    const pdf = row.pdf ? Buffer.from(row.pdf) : fiscalPdf([`NFS-e ${row.documentNo}`, row.protocol ?? '']);
    return { fileName: `${row.documentNo}.pdf`, mime: 'application/pdf', contentBase64: pdf.toString('base64') };
  }

  async cancel(tenantId: string, actorUserId: string, id: string, reason: string) {
    const text = reason.trim();
    if (text.length < 15) throw new DomainValidationError('A justificativa precisa ter ao menos 15 caracteres.');
    const rows = await this.dataSource.query(
      `SELECT id, status, branch_id AS "branchId", document_no AS "documentNo", environment
         FROM fiscal_documents WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    const row = rows[0] as { status: string; branchId: string; documentNo: string; environment: string } | undefined;
    if (!row) throw new DomainValidationError('Nota não encontrada.');
    if (row.status !== 'issued') throw new DomainValidationError('Só uma nota emitida pode ser cancelada.');
    const protocol = `CAN-${Date.now()}`;
    await this.dataSource.query(
      `UPDATE fiscal_documents
          SET status = 'cancelled', cancellation_reason = $3, protocol = $4, updated_by = $5, updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, text, protocol, actorUserId],
    );
    await this.audit(tenantId, row.branchId, actorUserId, 'fiscal_document', id, 'fiscal_document.cancelled', {
      reason: text, protocol, environment: row.environment, documentNo: row.documentNo,
    });
    return { id, protocol, status: 'cancelled' };
  }

  async pending(tenantId: string) {
    return this.dataSource.query(
      `SELECT l.id, so.order_no AS "orderNo", cu.legal_name AS "customerName", co.legal_name AS "companyName",
              b.display_name AS "branchName", l.message, l.status, bch.started_at AS "happenedAt",
              l.service_order_id AS "serviceOrderId"
         FROM fiscal_batch_lines l
         JOIN fiscal_batches bch ON bch.id = l.batch_id
         JOIN service_orders so ON so.id = l.service_order_id
         JOIN branches b ON b.id = so.branch_id
         JOIN companies co ON co.id = b.company_id
         LEFT JOIN customers cu ON cu.id = so.customer_id
        WHERE l.tenant_id = $1 AND l.status = 'error'
        ORDER BY bch.started_at DESC
        LIMIT 500`,
      [tenantId],
    );
  }

  async reprocess(tenantId: string, actorUserId: string, lineId: string) {
    const rows = await this.dataSource.query(
      `SELECT l.service_order_id AS "serviceOrderId", so.branch_id AS "branchId"
         FROM fiscal_batch_lines l JOIN service_orders so ON so.id = l.service_order_id
        WHERE l.tenant_id = $1 AND l.id = $2`,
      [tenantId, lineId],
    );
    if (!rows[0]) throw new DomainValidationError('Pendência não encontrada.');
    return this.enqueue(tenantId, actorUserId, rows[0].branchId, [rows[0].serviceOrderId], 'per_order');
  }

  async eligible(tenantId: string, branchId: string) {
    const rows = (await this.dataSource.query(
      `SELECT id FROM service_orders
        WHERE tenant_id = $1 AND branch_id = $2 AND is_deleted = false
          AND status IN ('ready_for_pickup', 'picked_up')
        ORDER BY order_no DESC LIMIT 1000`,
      [tenantId, branchId],
    )) as Array<{ id: string }>;
    const orders = await this.loadOrders(tenantId, rows.map((row) => row.id));
    const ctx = (await this.contextByBranch(tenantId, [branchId])).get(branchId);
    return orders
      .filter((order) => !ctx?.issued.has(order.id))
      .map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        customerId: order.customerId,
        city: order.city,
        state: order.state,
        amount: order.total,
        paymentStatus: paidStatus(order.total, order.paid),
        status: order.status,
        openedAt: order.openedAt,
        services: order.services.map((service) => service.name).join(', '),
        blockedReason: fiscalBlockers(this.check(order, ctx))[0] ?? null,
      }));
  }

  async audit(tenantId: string, branchId: string | null, actorUserId: string, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
    await this.auditService.record({
      tenantId, branchId, actorUserId, entityType, entityId, action, eventType: 'fiscal.write', metadata,
    });
  }

  async auditTrail(tenantId: string) {
    return this.dataSource.query(
      `SELECT e.occurred_at AS "occurredAt", e.action, e.entity_type AS "entityType",
              u.display_name AS "userName", e.branch_id AS "branchId", e.metadata
         FROM audit_events e
         LEFT JOIN user_identities u ON u.id = e.actor_user_id
        WHERE e.tenant_id = $1 AND (e.event_type LIKE 'fiscal.%' OR e.entity_type LIKE 'fiscal%')
        ORDER BY e.occurred_at DESC LIMIT 300`,
      [tenantId],
    );
  }

  private kick(batchId: string, tenantId: string, actorUserId: string) {
    if (this.active.has(batchId)) return;
    this.active.add(batchId);
    setImmediate(() => {
      void TenantContext.run({ tenantId, bypass: false }, () => this.process(batchId, tenantId, actorUserId))
        .catch(() => undefined)
        .finally(() => this.active.delete(batchId));
    });
  }

  private async resume() {
    const rows = (await this.dataSource.query(
      `SELECT id, tenant_id AS "tenantId", created_by AS "actorUserId" FROM fiscal_batches WHERE status = 'running'`,
    )) as Array<{ id: string; tenantId: string; actorUserId: string }>;
    for (const row of rows) this.kick(row.id, row.tenantId, row.actorUserId);
  }

  private async process(batchId: string, tenantId: string, actorUserId: string) {
    const header = (await this.dataSource.query(
      `SELECT mode, branch_id AS "branchId" FROM fiscal_batches WHERE id = $1 AND tenant_id = $2`,
      [batchId, tenantId],
    )) as Array<{ mode: 'per_order' | 'consolidated'; branchId: string }>;
    const lines = (await this.dataSource.query(
      `SELECT id, service_order_id AS "serviceOrderId", customer_id AS "customerId"
         FROM fiscal_batch_lines WHERE batch_id = $1 AND status = 'pending'`,
      [batchId],
    )) as Array<{ id: string; serviceOrderId: string; customerId: string | null }>;
    const groups = header[0]?.mode === 'consolidated'
      ? this.groupByCustomer(lines)
      : lines.map((line) => [line]);
    for (const group of groups) {
      try {
        await this.issueGroup(tenantId, actorUserId, header[0].branchId, group);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro de transmissão.';
        for (const line of group) await this.finishLine(line.id, 'error', message, null);
      }
      await this.refreshBatch(batchId);
    }
    await this.dataSource.query(
      `UPDATE fiscal_batches SET status = 'completed', finished_at = now() WHERE id = $1`,
      [batchId],
    );
  }

  private async issueGroup(tenantId: string, actorUserId: string, branchId: string, lines: Array<{ id: string; serviceOrderId: string }>) {
    const orders = await this.loadOrders(tenantId, lines.map((line) => line.serviceOrderId));
    const byId = new Map(orders.map((order) => [order.id, order]));
    const ctx = (await this.contextByBranch(tenantId, [branchId])).get(branchId);
    const ready: OrderSnap[] = [];
    for (const line of lines) {
      const order = byId.get(line.serviceOrderId);
      const blockers = order ? fiscalBlockers(this.check(order, ctx)) : ['OS não encontrada.'];
      if (!order || blockers.length > 0) {
        await this.finishLine(line.id, 'error', blockers[0] ?? 'OS não encontrada.', null);
        continue;
      }
      if (ctx?.environment === 'production') {
        await this.finishLine(line.id, 'error', 'A produção aguarda o emissor. Nenhum número de nota foi gerado.', null);
        continue;
      }
      ready.push(order);
    }
    if (ready.length === 0 || !ctx) return;
    const documentId = await this.storeDocument(tenantId, actorUserId, ctx, ready);
    for (const line of lines) {
      if (ready.some((order) => order.id === line.serviceOrderId)) {
        await this.finishLine(line.id, 'issued', 'NFS-e de homologação registrada.', documentId);
      }
    }
  }

  private async storeDocument(tenantId: string, actorUserId: string, ctx: BranchContext, orders: OrderSnap[]) {
    const amount = orders.reduce((sum, order) => sum + order.total, 0);
    const number = await this.nextNumber(tenantId, orders[0].branchId);
    const protocol = `HOM-${Date.now()}`;
    const xml = this.xml(number, orders, ctx);
    const pdf = fiscalPdf([
      `NFS-e homologacao ${number}`,
      orders.map((order) => order.orderNo).join(', '),
      `Valor ${amount.toFixed(2)}`,
      `Protocolo ${protocol}`,
    ]);
    const id = randomUUID();
    const first = orders[0];
    await this.dataSource.query(
      `INSERT INTO fiscal_documents (
         id, tenant_id, branch_id, service_order_id, document_type, document_no, issued_at, status, gross_amount,
         created_by, updated_by, company_id, customer_id, environment, certificate_id, protocol, xml_content, pdf_content, provider_message
       ) VALUES ($1,$2,$3,$4,'nfse',$5,now(),'issued',$6,$7,$7,$8,$9,'homologation',$10,$11,$12,$13,$14)`,
      [id, tenantId, first.branchId, first.id, number, amount.toFixed(2), actorUserId, first.companyId, first.customerId, ctx.certificateId, protocol, xml, pdf, 'Documento de homologação. Não é uma NFS-e autorizada pela prefeitura.'],
    );
    for (const order of orders) {
      await this.dataSource.query(
        `INSERT INTO fiscal_document_orders (tenant_id, document_id, service_order_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [tenantId, id, order.id],
      );
    }
    await this.dataSource.query(
      `UPDATE fiscal_environments SET last_issue_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND branch_id = $2 AND is_selected = true`,
      [tenantId, first.branchId],
    );
    await this.audit(tenantId, first.branchId, actorUserId, 'fiscal_document', id, 'fiscal_document.issued', {
      documentNo: number, protocol, environment: 'homologation', certificateId: ctx.certificateId, orders: orders.map((order) => order.orderNo),
    });
    return id;
  }

  private xml(number: string, orders: OrderSnap[], ctx: BranchContext) {
    const items = orders.flatMap((order) => order.services.map((service) =>
      `<Servico><OS>${escapeXml(order.orderNo)}</OS><Codigo>${escapeXml(service.fiscalCode || ctx.defaultServiceCode)}</Codigo><Descricao>${escapeXml(service.name)}</Descricao><Valor>${service.amount.toFixed(2)}</Valor></Servico>`,
    )).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><NFSe homologacao="true"><Numero>${number}</Numero><Ambiente>homologacao</Ambiente>${items}</NFSe>`;
  }

  private async nextNumber(tenantId: string, branchId: string) {
    const rows = (await this.dataSource.query(
      `SELECT document_no AS "documentNo" FROM fiscal_documents
        WHERE tenant_id = $1 AND branch_id = $2 AND document_type = 'nfse' AND document_no LIKE 'H%'
        ORDER BY document_no DESC LIMIT 1`,
      [tenantId, branchId],
    )) as Array<{ documentNo?: string }>;
    const current = Number((rows[0]?.documentNo ?? 'H00000000').replace(/\D/g, '')) || 0;
    return `H${String(current + 1).padStart(8, '0')}`;
  }

  private async finishLine(id: string, status: 'issued' | 'error', message: string, documentId: string | null) {
    await this.dataSource.query(
      `UPDATE fiscal_batch_lines SET status = $2, message = $3, document_id = $4 WHERE id = $1 AND status = 'pending'`,
      [id, status, message, documentId],
    );
  }

  private async refreshBatch(batchId: string) {
    await this.dataSource.query(
      `UPDATE fiscal_batches b SET
         processed_count = (SELECT count(*) FROM fiscal_batch_lines l WHERE l.batch_id = b.id AND l.status <> 'pending'),
         issued_count = (SELECT count(*) FROM fiscal_batch_lines l WHERE l.batch_id = b.id AND l.status = 'issued'),
         error_count = (SELECT count(*) FROM fiscal_batch_lines l WHERE l.batch_id = b.id AND l.status = 'error')
       WHERE b.id = $1`,
      [batchId],
    );
  }

  private groupByCustomer(lines: Array<{ id: string; serviceOrderId: string; customerId: string | null }>) {
    const groups = new Map<string, typeof lines>();
    for (const line of lines) {
      const key = line.customerId ?? line.serviceOrderId;
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    return [...groups.values()];
  }

  private check(order: OrderSnap, ctx: BranchContext | undefined) {
    const missing = order.services.filter((service) => !service.fiscalCode && !ctx?.defaultServiceCode).map((service) => service.name);
    return {
      status: order.status,
      paymentStatus: paidStatus(order.total, order.paid),
      alreadyIssued: Boolean(ctx?.issued.has(order.id)),
      customerDocument: order.document,
      customerStreet: order.street,
      customerCity: order.city,
      customerState: order.state,
      missingServiceCodes: missing,
      certificateReady: Boolean(ctx?.certificateReady),
      settingsReady: Boolean(ctx?.settingsReady),
      environment: ctx?.environment ?? null,
    };
  }

  private async contextByBranch(tenantId: string, branchIds: string[]) {
    const map = new Map<string, BranchContext>();
    for (const branchId of branchIds) {
      const settings = (await this.dataSource.query(
        `SELECT default_service_code AS "defaultServiceCode" FROM fiscal_settings WHERE tenant_id = $1 AND branch_id = $2`,
        [tenantId, branchId],
      )) as Array<{ defaultServiceCode: string }>;
      const environment = (await this.dataSource.query(
        `SELECT kind, certificate_id AS "certificateId" FROM fiscal_environments
          WHERE tenant_id = $1 AND branch_id = $2 AND is_selected = true`,
        [tenantId, branchId],
      )) as Array<{ kind: EnvironmentKind; certificateId: string | null }>;
      const certificate = environment[0]?.certificateId
        ? (await this.dataSource.query(
            `SELECT status, expires_at AS "expiresAt" FROM fiscal_certificates WHERE tenant_id = $1 AND id = $2`,
            [tenantId, environment[0].certificateId],
          )) as Array<{ status: string; expiresAt: string }>
        : [];
      const issuedRows = (await this.dataSource.query(
        `SELECT d.service_order_id AS "serviceOrderId", d.document_no AS "documentNo", d.status, d.issued_at AS "issuedAt"
           FROM fiscal_documents d
          WHERE d.tenant_id = $1 AND d.branch_id = $2 AND d.status = 'issued'
          UNION
         SELECT o.service_order_id, d.document_no, d.status, d.issued_at
           FROM fiscal_document_orders o
           JOIN fiscal_documents d ON d.id = o.document_id
          WHERE o.tenant_id = $1 AND d.branch_id = $2 AND d.status = 'issued'`,
        [tenantId, branchId],
      )) as Array<{ serviceOrderId: string; documentNo: string; status: string; issuedAt: string }>;
      const issued = new Map(issuedRows.map((row) => [row.serviceOrderId, row]));
      const cert = certificate[0];
      map.set(branchId, {
        settingsReady: Boolean(settings[0]),
        defaultServiceCode: settings[0]?.defaultServiceCode ?? '',
        environment: environment[0]?.kind ?? null,
        certificateId: environment[0]?.certificateId ?? null,
        certificateReady: Boolean(cert && cert.status === 'active' && new Date(cert.expiresAt).getTime() >= Date.now()),
        issued,
      });
    }
    return map;
  }

  private async loadOrders(tenantId: string, ids: string[]): Promise<OrderSnap[]> {
    if (ids.length === 0) return [];
    const orders = (await this.dataSource.query(
      `SELECT so.id, so.order_no AS "orderNo", so.status, so.opened_at AS "openedAt", COALESCE(so.total_value, 0) AS total,
              so.customer_id AS "customerId", cu.legal_name AS "customerName", cu.cpf_cnpj AS document,
              cu.address_line_1 AS street, cu.city, cu.state, so.branch_id AS "branchId",
              b.company_id AS "companyId", co.legal_name AS "companyName", b.display_name AS "branchName"
         FROM service_orders so
         JOIN customers cu ON cu.id = so.customer_id
         JOIN branches b ON b.id = so.branch_id
         JOIN companies co ON co.id = b.company_id
        WHERE so.tenant_id = $1 AND so.id = ANY($2::uuid[]) AND so.is_deleted = false`,
      [tenantId, ids],
    )) as Array<Omit<OrderSnap, 'paid' | 'services' | 'total'> & { total: string }>;
    const paidRows = (await this.dataSource.query(
      `SELECT service_order_id AS id, COALESCE(SUM(CASE
          WHEN status IN ('failed', 'reversed', 'pending', 'canceled') THEN 0
          WHEN payment_direction = 'outbound' THEN -payment_amount ELSE payment_amount END), 0) AS paid
         FROM payment_records WHERE service_order_id = ANY($1::uuid[]) GROUP BY service_order_id`,
      [ids],
    )) as Array<{ id: string; paid: string }>;
    const paid = new Map(paidRows.map((row) => [row.id, Number(row.paid)]));
    const services = (await this.dataSource.query(
      `SELECT i.service_order_id AS "serviceOrderId", COALESCE(s.display_name, i.description) AS name,
              s.fiscal_code AS "fiscalCode", COALESCE(i.quantity, 1) * COALESCE(i.unit_price, 0) AS amount
         FROM service_order_items i
         LEFT JOIN atelier_services s ON s.id = i.service_id
        WHERE i.service_order_id = ANY($1::uuid[]) AND i.is_deleted = false`,
      [ids],
    )) as Array<{ serviceOrderId: string; name: string; fiscalCode: string | null; amount: string }>;
    return orders.map((order) => ({
      ...order,
      total: Number(order.total),
      paid: paid.get(order.id) ?? 0,
      services: services.filter((service) => service.serviceOrderId === order.id).map((service) => ({
        name: service.name, fiscalCode: service.fiscalCode, amount: Number(service.amount),
      })),
    }));
  }

  private openCertificate(pfxBase64: string, password: string): { ok: boolean; message: string } {
    try {
      createSecureContext({ pfx: Buffer.from(pfxBase64, 'base64'), passphrase: password });
      return { ok: true, message: 'Certificado aceito. O emissor nacional ainda não está ligado; o teste confirma o arquivo e a senha.' };
    } catch {
      return { ok: false, message: 'Certificado inválido.' };
    }
  }

  private async certificateRow(tenantId: string, id: string) {
    const rows = (await this.dataSource.query(
      `SELECT branch_id, pfx_cipher, password_cipher FROM fiscal_certificates WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    )) as Array<{ branch_id: string; pfx_cipher: string; password_cipher: string }>;
    if (!rows[0]) throw new DomainValidationError('Certificado não encontrado.');
    return rows[0];
  }
}

type BranchContext = {
  settingsReady: boolean;
  defaultServiceCode: string;
  environment: EnvironmentKind | null;
  certificateId: string | null;
  certificateReady: boolean;
  issued: Map<string, { documentNo: string; status: string; issuedAt: string }>;
};

function digits(value: string | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] ?? char));
}
