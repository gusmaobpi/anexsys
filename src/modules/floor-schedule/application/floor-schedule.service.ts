import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { ProductionOrderService } from 'src/modules/production-orders/application/production-order/production-order.service';
import { QualityService } from 'src/modules/quality/application/quality/quality.service';
import { floorActionLabel, nextFloorAction } from 'src/modules/service-orders/application/service-order/service-order-floor';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import {
  eachIsoDate,
  FLOOR_PROFILE_ROLE_CODES,
  type FloorProfile,
  floorPresence,
  saoPauloToday,
  schedulePeriodError,
} from './floor-schedule.rules';

type CheckinRow = { id: string; branchId: string; purpose: 'production' | 'quality'; codeValue: string };
type PublicAnchor = CheckinRow & { tenantId: string };
type TechnicianRow = {
  id: string;
  userId: string;
  status: string;
  displayName: string;
  profile: FloorProfile | null;
  dailyRate: number;
  piecesPerDay: number;
};
type SessionRow = {
  id: string;
  branchId: string;
  purpose: 'production' | 'quality';
  technicianId: string | null;
  userId: string;
  status: string;
};

@Injectable()
export class FloorScheduleService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(ProductionOrderService)
    private readonly productionOrderService: ProductionOrderService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(QualityService)
    private readonly qualityService: QualityService,
  ) {}

  async listCandidates(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT id, display_name AS "displayName", status
       FROM user_identities
       WHERE tenant_id = $1 AND status = 'active'
       ORDER BY display_name ASC`,
      [tenantId],
    );
    return rows as Array<{ id: string; displayName: string; status: string }>;
  }

  async listTechnicians(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT t.id, t.user_id AS "userId", t.status, t.profile_code AS "profile",
              t.daily_rate AS "dailyRate", t.pieces_per_day AS "piecesPerDay",
              u.display_name AS "displayName"
       FROM floor_technicians t
       JOIN user_identities u ON u.id = t.user_id
       WHERE t.tenant_id = $1
       ORDER BY u.display_name ASC`,
      [tenantId],
    );
    return (rows as Array<Omit<TechnicianRow, 'dailyRate' | 'piecesPerDay'> & { dailyRate: string; piecesPerDay: string }>).map((row) => ({
      ...row,
      dailyRate: Number(row.dailyRate ?? 0),
      piecesPerDay: Number(row.piecesPerDay ?? 0),
    }));
  }

  async saveCollaborator(
    tenantId: string,
    input: { userId: string; profile: FloorProfile; dailyRate: number; piecesPerDay: number; status: 'active' | 'inactive' },
    actorUserId: string,
  ) {
    if (input.dailyRate < 0 || input.dailyRate > 999999.99 || !Number.isFinite(input.dailyRate)) {
      throw new DomainValidationError('Informe o valor da diária.');
    }
    if (!Number.isInteger(input.piecesPerDay) || input.piecesPerDay < 0 || input.piecesPerDay > 999) {
      throw new DomainValidationError('Informe a média de peças por dia.');
    }
    const user = await this.identityService.getById(input.userId);
    if (user.tenantId !== tenantId || user.status !== 'active') {
      throw new DomainValidationError('Este usuário não pertence à conta.');
    }
    if (input.userId === actorUserId && input.profile !== 'gerente') {
      throw new DomainValidationError('O seu usuário permanece gerente.');
    }
    const dailyRate = input.dailyRate.toFixed(2);
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.query(
        `SELECT id FROM floor_technicians WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, input.userId],
      );
      if (existing[0]) {
        await manager.query(
          `UPDATE floor_technicians
           SET profile_code = $3, daily_rate = $4, pieces_per_day = $5, status = $6, updated_by = $7, updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [existing[0].id, tenantId, input.profile, dailyRate, input.piecesPerDay, input.status, actorUserId],
        );
      } else {
        await manager.query(
          `INSERT INTO floor_technicians
             (id, tenant_id, user_id, status, profile_code, daily_rate, pieces_per_day, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [randomUUID(), tenantId, input.userId, input.status, input.profile, dailyRate, input.piecesPerDay, actorUserId],
        );
      }
      await this.linkProfile(manager, tenantId, input.userId, input.profile, actorUserId);
    });
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'floor_technician',
      entityId: input.userId,
      action: 'floor.collaborator.saved',
      eventType: 'production.schedule',
      metadata: { profile: input.profile, dailyRate, piecesPerDay: input.piecesPerDay },
    });
    return this.listTechnicians(tenantId);
  }

  async outlook(tenantId: string, branchId: string, from: string, to: string) {
    const error = schedulePeriodError(from, to);
    if (error) {
      throw new DomainValidationError(error);
    }
    const values = await this.dataSource.query(
      `SELECT promised_delivery_date::text AS "workDate",
              COALESCE(SUM(total_value), 0) AS "orderValue"
       FROM service_orders
       WHERE tenant_id = $1 AND branch_id = $2 AND is_deleted = false AND status <> 'cancelled'
         AND promised_delivery_date BETWEEN $3 AND $4
       GROUP BY promised_delivery_date`,
      [tenantId, branchId, from, to],
    );
    const pieces = await this.dataSource.query(
      `SELECT so.promised_delivery_date::text AS "workDate", COUNT(i.id)::int AS "pieces"
       FROM service_orders so
       JOIN service_order_items i ON i.service_order_id = so.id AND i.is_deleted = false
       WHERE so.tenant_id = $1 AND so.branch_id = $2 AND so.is_deleted = false AND so.status <> 'cancelled'
         AND so.promised_delivery_date BETWEEN $3 AND $4
       GROUP BY so.promised_delivery_date`,
      [tenantId, branchId, from, to],
    );
    const pieceByDay = new Map((pieces as Array<{ workDate: string; pieces: number }>).map((row) => [row.workDate.slice(0, 10), Number(row.pieces)]));
    return {
      from,
      to,
      days: (values as Array<{ workDate: string; orderValue: string }>).map((row) => {
        const workDate = row.workDate.slice(0, 10);
        return { workDate, orderValue: Number(row.orderValue), pieces: pieceByDay.get(workDate) ?? 0 };
      }),
    };
  }

  async addTechnician(tenantId: string, userId: string, actorUserId: string) {
    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new DomainValidationError('Este usuário não pertence à conta.');
    }
    const existing = await this.dataSource.query(
      `SELECT id, status FROM floor_technicians WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    if (existing[0]) {
      await this.dataSource.query(
        `UPDATE floor_technicians SET status = 'active', updated_by = $2, updated_at = now() WHERE id = $1`,
        [existing[0].id, actorUserId],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO floor_technicians (id, tenant_id, user_id, status, created_by, updated_by)
         VALUES ($1, $2, $3, 'active', $4, $4)`,
        [randomUUID(), tenantId, userId, actorUserId],
      );
    }
    return this.listTechnicians(tenantId);
  }

  async setTechnicianStatus(tenantId: string, technicianId: string, status: 'active' | 'inactive', actorUserId: string) {
    await this.dataSource.query(
      `UPDATE floor_technicians SET status = $3, updated_by = $4, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, technicianId, status, actorUserId],
    );
    return this.listTechnicians(tenantId);
  }

  async getSchedule(tenantId: string, branchId: string, from: string, to: string) {
    const error = schedulePeriodError(from, to);
    if (error) {
      throw new DomainValidationError(error);
    }
    const rows = await this.dataSource.query(
      `SELECT technician_id AS "technicianId", work_date::text AS "workDate"
       FROM floor_schedule_days
       WHERE tenant_id = $1 AND branch_id = $2 AND work_date BETWEEN $3 AND $4
       ORDER BY work_date ASC`,
      [tenantId, branchId, from, to],
    );
    return { from, to, days: rows as Array<{ technicianId: string; workDate: string }> };
  }

  async saveSchedule(
    tenantId: string,
    branchId: string,
    from: string,
    to: string,
    marks: Array<{ technicianId: string; dates: string[] }>,
    actorUserId: string,
  ) {
    const error = schedulePeriodError(from, to);
    if (error) {
      throw new DomainValidationError(error);
    }
    const allowed = new Set(eachIsoDate(from, to));
    const technicians = await this.listTechnicians(tenantId);
    const rows: Array<{ technicianId: string; workDate: string }> = [];
    for (const mark of marks) {
      const technician = technicians.find((item) => item.id === mark.technicianId);
      if (!technician || technician.status !== 'active' || technician.profile !== 'tecnico') {
        throw new DomainValidationError('Só técnico ativo entra na grade.');
      }
      for (const date of mark.dates) {
        if (!allowed.has(date)) {
          throw new DomainValidationError('Há um dia fora do período escolhido.');
        }
        rows.push({ technicianId: mark.technicianId, workDate: date });
      }
    }
    await this.dataSource.query(
      `DELETE FROM floor_schedule_days WHERE tenant_id = $1 AND branch_id = $2 AND work_date BETWEEN $3 AND $4`,
      [tenantId, branchId, from, to],
    );
    for (const row of rows) {
      await this.dataSource.query(
        `INSERT INTO floor_schedule_days (id, tenant_id, branch_id, technician_id, work_date, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [randomUUID(), tenantId, branchId, row.technicianId, row.workDate, actorUserId],
      );
    }
    await this.auditService.record({
      tenantId,
      branchId,
      actorUserId,
      entityType: 'floor_schedule',
      entityId: branchId,
      action: 'floor.schedule.saved',
      eventType: 'production.schedule',
      metadata: { from, to, marks: rows.length },
    });
    return this.getSchedule(tenantId, branchId, from, to);
  }

  async ensureCheckinCodes(tenantId: string, branchId: string, actorUserId: string) {
    for (const purpose of ['production', 'quality'] as const) {
      const found = await this.dataSource.query(
        `SELECT id FROM floor_checkin_codes WHERE tenant_id = $1 AND branch_id = $2 AND purpose = $3`,
        [tenantId, branchId, purpose],
      );
      if (!found[0]) {
        await this.dataSource.query(
          `INSERT INTO floor_checkin_codes (id, tenant_id, branch_id, purpose, code_value, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [randomUUID(), tenantId, branchId, purpose, randomUUID(), actorUserId],
        );
      }
    }
    const rows = await this.dataSource.query(
      `SELECT id, branch_id AS "branchId", purpose, code_value AS "codeValue"
       FROM floor_checkin_codes
       WHERE tenant_id = $1 AND branch_id = $2
       ORDER BY purpose ASC`,
      [tenantId, branchId],
    );
    return rows as CheckinRow[];
  }

  async today(tenantId: string, branchId: string, now = new Date()) {
    const day = saoPauloToday(now);
    const scheduled = await this.dataSource.query(
      `SELECT t.id AS "technicianId", t.user_id AS "userId", u.display_name AS "displayName"
       FROM floor_schedule_days d
       JOIN floor_technicians t ON t.id = d.technician_id
       JOIN user_identities u ON u.id = t.user_id
       WHERE d.tenant_id = $1 AND d.branch_id = $2 AND d.work_date = $3
       ORDER BY u.display_name ASC`,
      [tenantId, branchId, day],
    );
    const sessions = await this.dataSource.query(
      `SELECT user_id AS "userId"
       FROM floor_sessions
       WHERE tenant_id = $1 AND branch_id = $2 AND purpose = 'production' AND status = 'active'`,
      [tenantId, branchId],
    );
    const picks = await this.dataSource.query(
      `SELECT user_id AS "userId", min(happened_at) AS "pickedAt", order_no AS "orderNo"
       FROM floor_diary_entries
       WHERE tenant_id = $1 AND branch_id = $2
         AND action IN ('pick_up', 'pick_up_rework')
         AND (happened_at AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
       GROUP BY user_id, order_no`,
      [tenantId, branchId, day],
    );
    const openUsers = new Set((sessions as Array<{ userId: string }>).map((row) => row.userId));
    const pickByUser = new Map<string, { pickedAt: string; orderNo: string }>();
    for (const row of picks as Array<{ userId: string; pickedAt: string; orderNo: string }>) {
      if (!pickByUser.has(row.userId)) {
        pickByUser.set(row.userId, row);
      }
    }
    const people = (scheduled as Array<{ technicianId: string; userId: string; displayName: string }>).map((person) => {
      const pick = pickByUser.get(person.userId);
      const presence = floorPresence({
        scheduled: true,
        sessionOpen: openUsers.has(person.userId),
        pickedToday: Boolean(pick),
      });
      return {
        ...person,
        presence,
        pickedAt: pick?.pickedAt ?? null,
        orderNo: pick?.orderNo ?? null,
      };
    });
    const diary = await this.dataSource.query(
      `SELECT e.user_id AS "userId", u.display_name AS "displayName", e.order_no AS "orderNo",
              e.action, e.happened_at AS "happenedAt"
       FROM floor_diary_entries e
       JOIN user_identities u ON u.id = e.user_id
       WHERE e.tenant_id = $1 AND e.branch_id = $2
         AND (e.happened_at AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
       ORDER BY e.happened_at ASC`,
      [tenantId, branchId, day],
    );
    return { day, people, diary };
  }

  async openCheckin(tenantId: string, code: string, permissions: string[], accessibleBranchIds: string[]) {
    const anchor = await this.findCode(tenantId, code);
    this.assertAnchorBranch(anchor, accessibleBranchIds);
    const day = saoPauloToday();
    if (anchor.purpose === 'quality') {
      if (!permissions.includes('quality.write') && !permissions.includes('quality.read')) {
        throw new DomainValidationError('Este QR é da qualidade.');
      }
      return { purpose: anchor.purpose, branchId: anchor.branchId, day, names: [] as TechnicianRow[] };
    }
    const names = await this.dataSource.query(
      `SELECT t.id, t.user_id AS "userId", t.status, u.display_name AS "displayName"
       FROM floor_schedule_days d
       JOIN floor_technicians t ON t.id = d.technician_id AND t.status = 'active'
       JOIN user_identities u ON u.id = t.user_id
       WHERE d.tenant_id = $1 AND d.branch_id = $2 AND d.work_date = $3
       ORDER BY u.display_name ASC`,
      [tenantId, anchor.branchId, day],
    );
    return { purpose: 'production' as const, branchId: anchor.branchId, day, names: names as TechnicianRow[] };
  }

  async openSession(
    tenantId: string,
    code: string,
    actorUserId: string,
    permissions: string[],
    accessibleBranchIds: string[],
    technicianId?: string,
  ) {
    const anchor = await this.findCode(tenantId, code);
    this.assertAnchorBranch(anchor, accessibleBranchIds);
    if (anchor.purpose === 'quality') {
      if (!permissions.includes('quality.write')) {
        throw new DomainValidationError('Você não revisa a qualidade.');
      }
      return this.resumeSession(tenantId, anchor, actorUserId, null, actorUserId);
    }
    if (!technicianId) {
      throw new DomainValidationError('Escolha o seu nome.');
    }
    const day = saoPauloToday();
    const marked = await this.dataSource.query(
      `SELECT t.id, t.user_id AS "userId"
       FROM floor_schedule_days d
       JOIN floor_technicians t ON t.id = d.technician_id AND t.status = 'active'
       WHERE d.tenant_id = $1 AND d.branch_id = $2 AND d.work_date = $3 AND t.id = $4`,
      [tenantId, anchor.branchId, day, technicianId],
    );
    if (!marked[0]) {
      throw new DomainValidationError('Este nome não está confirmado na escala de hoje.');
    }
    return this.resumeSession(tenantId, anchor, marked[0].userId, marked[0].id, actorUserId);
  }

  async openPublicCheckin(code: string) {
    const anchor = await this.findCodeByValue(code);
    if (anchor.purpose === 'quality') {
      const names = await this.dataSource.query(
        `SELECT t.id, u.display_name AS "displayName"
         FROM floor_technicians t
         JOIN user_identities u ON u.id = t.user_id
         WHERE t.tenant_id = $1 AND t.status = 'active' AND t.profile_code = 'qualidade'
           AND u.status = 'active' AND u.is_deleted = false
         ORDER BY u.display_name ASC`,
        [anchor.tenantId],
      );
      return { purpose: 'quality' as const, names: names as Array<{ id: string; displayName: string }> };
    }
    const names = await this.dataSource.query(
      `SELECT t.id, u.display_name AS "displayName"
       FROM floor_schedule_days d
       JOIN floor_technicians t ON t.id = d.technician_id AND t.status = 'active'
       JOIN user_identities u ON u.id = t.user_id
       WHERE d.tenant_id = $1 AND d.branch_id = $2 AND d.work_date = $3
       ORDER BY u.display_name ASC`,
      [anchor.tenantId, anchor.branchId, saoPauloToday()],
    );
    return { purpose: 'production' as const, names: names as Array<{ id: string; displayName: string }> };
  }

  async openPublicSession(code: string, technicianId: string) {
    const anchor = await this.findCodeByValue(code);
    if (!technicianId) {
      throw new DomainValidationError('Escolha o seu nome.');
    }
    if (anchor.purpose === 'quality') {
      const person = await this.dataSource.query(
        `SELECT t.id, t.user_id AS "userId"
         FROM floor_technicians t
         JOIN user_identities u ON u.id = t.user_id
         WHERE t.tenant_id = $1 AND t.id = $2 AND t.status = 'active' AND t.profile_code = 'qualidade'
           AND u.status = 'active' AND u.is_deleted = false`,
        [anchor.tenantId, technicianId],
      );
      if (!person[0]) {
        throw new DomainValidationError('Este nome não revisa a qualidade.');
      }
      return this.resumeSession(anchor.tenantId, anchor, person[0].userId, person[0].id, person[0].userId);
    }
    const marked = await this.dataSource.query(
      `SELECT t.id, t.user_id AS "userId"
       FROM floor_schedule_days d
       JOIN floor_technicians t ON t.id = d.technician_id AND t.status = 'active'
       WHERE d.tenant_id = $1 AND d.branch_id = $2 AND d.work_date = $3 AND t.id = $4`,
      [anchor.tenantId, anchor.branchId, saoPauloToday(), technicianId],
    );
    if (!marked[0]) {
      throw new DomainValidationError('Este nome não está confirmado na escala de hoje.');
    }
    return this.resumeSession(anchor.tenantId, anchor, marked[0].userId, marked[0].id, marked[0].userId);
  }

  async closePublicSession(code: string, sessionId: string) {
    const { anchor, session } = await this.bindPublic(code, sessionId);
    return this.closeSession(anchor.tenantId, session.id, session.userId);
  }

  async readPublicOrder(code: string, sessionId: string, codeValue: string) {
    const { anchor, session } = await this.bindPublic(code, sessionId);
    if (session.status !== 'active') {
      throw new DomainValidationError('A sessão está encerrada.');
    }
    const read = await this.readOrder(anchor.tenantId, session.id, codeValue, [anchor.branchId]);
    if (read.purpose !== 'quality') {
      return { ...read, review: null };
    }
    const review = await this.qualityService.getReview(anchor.tenantId, read.serviceOrderId, [anchor.branchId]);
    return { ...read, actionLabel: null, review };
  }

  async advancePublic(code: string, sessionId: string, serviceOrderId: string) {
    const { anchor } = await this.bindPublic(code, sessionId);
    const order = await this.serviceOrderService.getById(serviceOrderId, anchor.tenantId);
    if (order.branchId !== anchor.branchId) {
      throw new DomainValidationError('Esta OP é de outra filial.');
    }
    return this.advance(anchor.tenantId, sessionId, serviceOrderId);
  }

  async decidePublic(
    code: string,
    sessionId: string,
    serviceOrderId: string,
    serviceOrderItemId: string,
    decision: 'approved' | 'rejected',
    reason?: string | null,
  ) {
    const { anchor, session } = await this.requireQualitySession(code, sessionId);
    const order = await this.serviceOrderService.getById(serviceOrderId, anchor.tenantId);
    if (order.branchId !== anchor.branchId) {
      throw new DomainValidationError('Esta OP é de outra filial.');
    }
    return this.qualityService.decideItem(
      anchor.tenantId,
      serviceOrderId,
      serviceOrderItemId,
      session.userId,
      [anchor.branchId],
      decision,
      reason,
    );
  }

  async startPublicReturn(code: string, sessionId: string, serviceOrderId: string) {
    const { anchor, session } = await this.requireQualitySession(code, sessionId);
    const order = await this.serviceOrderService.getById(serviceOrderId, anchor.tenantId);
    if (order.branchId !== anchor.branchId) {
      throw new DomainValidationError('Esta OP é de outra filial.');
    }
    return this.qualityService.startReturn(anchor.tenantId, serviceOrderId, session.userId, [anchor.branchId]);
  }

  async closeSession(tenantId: string, sessionId: string, actorUserId: string) {
    const session = await this.requireSession(tenantId, sessionId);
    await this.dataSource.query(
      `UPDATE floor_sessions
       SET status = 'closed', closed_at = now(), updated_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'active'`,
      [session.id, actorUserId],
    );
    return { id: session.id, status: 'closed' };
  }

  async readOrder(tenantId: string, sessionId: string, codeValue: string, accessibleBranchIds: string[]) {
    const session = await this.requireOpenSession(tenantId, sessionId);
    const card = await this.operationalCard(tenantId, codeValue, accessibleBranchIds);
    if (session.purpose === 'quality') {
      if (card.status !== 'awaiting_quality' && card.status !== 'quality') {
        throw new DomainValidationError('Esta OP não está aguardando controle de qualidade.');
      }
      return { purpose: 'quality' as const, serviceOrderId: card.serviceOrderId, card, openCamera: false };
    }
    this.assertCanHandle(card, session.userId);
    const action = nextFloorAction(card.status, card.bagClosed);
    if (!action || action === 'open_review') {
      throw new DomainValidationError('Esta OP não está disponível para pegar ou terminar.');
    }
    return {
      purpose: 'production' as const,
      serviceOrderId: card.serviceOrderId,
      card,
      action,
      actionLabel: action ? floorActionLabel(action) : null,
      openCamera: false,
    };
  }

  async advance(tenantId: string, sessionId: string, serviceOrderId: string) {
    const session = await this.requireSession(tenantId, sessionId);
    if (session.purpose !== 'production') {
      throw new DomainValidationError('A qualidade revisa. Ela não pega sacola.');
    }
    const order = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    if (order.floorHolderUserId && order.floorHolderUserId !== session.userId) {
      throw new DomainValidationError('Esta OP já está com outro técnico.');
    }
    const before = nextFloorAction(order.status, order.bagClosed);
    if (!before || before === 'open_review') {
      throw new DomainValidationError('Esta OP não está disponível para pegar ou terminar.');
    }
    const finished = before === 'finish_production' || before === 'finish_rework';
    if (!finished && session.status !== 'active') {
      throw new DomainValidationError('A sessão está encerrada.');
    }
    const details = await this.serviceOrderService.advanceFloor(tenantId, serviceOrderId, session.userId);
    return { order: details.serviceOrder, openCamera: finished && session.status === 'active' };
  }

  private assertCanHandle(card: { floorHolderUserId: string | null; serviceOrderId: string }, userId: string) {
    if (card.floorHolderUserId && card.floorHolderUserId !== userId) {
      throw new DomainValidationError('Esta OP já está com outro técnico.');
    }
  }

  private async operationalCard(tenantId: string, codeValue: string, accessibleBranchIds: string[]) {
    const qr = await this.productionOrderService.getActiveQrCodeByValue(tenantId, codeValue.trim());
    if (!qr) {
      throw new DomainValidationError('QR da ordem de produção não encontrado.');
    }
    const view = await this.productionOrderService.getPrintView(tenantId, qr.productionOrderId);
    const order = await this.serviceOrderService.getById(view.serviceOrder.id, tenantId);
    this.serviceOrderService.assertBranchAccess(order, accessibleBranchIds);
    return {
      serviceOrderId: order.id,
      orderNo: order.orderNo,
      openedAt: order.openedAt,
      promisedDeliveryDate: order.promisedDeliveryDate,
      status: order.status,
      bagClosed: order.bagClosed,
      floorHolderUserId: order.floorHolderUserId,
      items: view.items.map((item, index) => ({
        sequence: index + 1,
        product: item.itemType,
        service: item.description,
        detail: item.complement,
        brand: item.brand,
        model: item.model,
        serialNo: item.serialNo,
        rejectionReason: item.rejectionReason,
        proofNote: item.proofNote,
      })),
    };
  }

  private async resumeSession(
    tenantId: string,
    anchor: CheckinRow,
    userId: string,
    technicianId: string | null,
    actorUserId: string,
  ) {
    const open = await this.dataSource.query(
      `SELECT id, branch_id AS "branchId", purpose, technician_id AS "technicianId", user_id AS "userId", status
       FROM floor_sessions
       WHERE tenant_id = $1 AND branch_id = $2 AND purpose = $3 AND user_id = $4 AND status = 'active'
       ORDER BY opened_at DESC
       LIMIT 1`,
      [tenantId, anchor.branchId, anchor.purpose, userId],
    );
    if (open[0]) {
      return this.sessionPayload(open[0] as SessionRow);
    }
    const id = randomUUID();
    await this.dataSource.query(
      `INSERT INTO floor_sessions (id, tenant_id, branch_id, purpose, technician_id, user_id, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7)`,
      [id, tenantId, anchor.branchId, anchor.purpose, technicianId, userId, actorUserId],
    );
    return this.sessionPayload({
      id,
      branchId: anchor.branchId,
      purpose: anchor.purpose,
      technicianId,
      userId,
      status: 'active',
    });
  }

  private async sessionPayload(session: SessionRow) {
    const current = await this.dataSource.query(
      `SELECT id, order_no AS "orderNo", status, bag_closed AS "bagClosed"
       FROM service_orders
       WHERE tenant_id = (SELECT tenant_id FROM floor_sessions WHERE id = $1)
         AND branch_id = $2
         AND floor_holder_user_id = $3
         AND is_deleted = false
         AND status IN ('in_production', 'in_rework')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [session.id, session.branchId, session.userId],
    );
    return { ...session, currentOrder: current[0] ?? null };
  }

  private assertAnchorBranch(anchor: CheckinRow, accessibleBranchIds: string[]) {
    if (!accessibleBranchIds.includes(anchor.branchId)) {
      throw new DomainValidationError('Este QR é de outra filial.');
    }
  }

  private async requireQualitySession(code: string, sessionId: string) {
    const bound = await this.bindPublic(code, sessionId);
    if (bound.session.purpose !== 'quality' || bound.session.status !== 'active') {
      throw new DomainValidationError('A qualidade revisa nesta sessão.');
    }
    return bound;
  }

  private async bindPublic(code: string, sessionId: string) {
    const anchor = await this.findCodeByValue(code);
    const session = await this.requireSession(anchor.tenantId, sessionId);
    if (session.branchId !== anchor.branchId || session.purpose !== anchor.purpose) {
      throw new DomainValidationError('Sessão não encontrada.');
    }
    return { anchor, session };
  }

  private async findCodeByValue(code: string): Promise<PublicAnchor> {
    const rows = await this.dataSource.query(
      `SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", purpose, code_value AS "codeValue"
       FROM floor_checkin_codes
       WHERE code_value = $1`,
      [code.trim()],
    );
    if (!rows[0]) {
      throw new DomainValidationError('QR de check-in não encontrado.');
    }
    return rows[0] as PublicAnchor;
  }

  private async findCode(tenantId: string, code: string): Promise<CheckinRow> {
    const rows = await this.dataSource.query(
      `SELECT id, branch_id AS "branchId", purpose, code_value AS "codeValue"
       FROM floor_checkin_codes
       WHERE tenant_id = $1 AND code_value = $2`,
      [tenantId, code.trim()],
    );
    if (!rows[0]) {
      throw new DomainValidationError('QR de check-in não encontrado.');
    }
    return rows[0] as CheckinRow;
  }

  private async requireSession(tenantId: string, sessionId: string): Promise<SessionRow> {
    const rows = await this.dataSource.query(
      `SELECT id, branch_id AS "branchId", purpose, technician_id AS "technicianId", user_id AS "userId", status
       FROM floor_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, sessionId],
    );
    if (!rows[0]) {
      throw new DomainValidationError('Sessão não encontrada.');
    }
    return rows[0] as SessionRow;
  }

  private async requireOpenSession(tenantId: string, sessionId: string) {
    const session = await this.requireSession(tenantId, sessionId);
    if (session.status !== 'active') {
      throw new DomainValidationError('A sessão está encerrada.');
    }
    return session;
  }

  private async linkProfile(
    manager: { query: DataSource['query'] },
    tenantId: string,
    userId: string,
    profile: FloorProfile,
    actorUserId: string,
  ) {
    const codes = FLOOR_PROFILE_ROLE_CODES[profile];
    const roles = await manager.query(
      `SELECT id, upper(code) AS code FROM roles WHERE tenant_id = $1 AND upper(code) = ANY($2::text[])`,
      [tenantId, codes],
    );
    const role = codes
      .map((code) => (roles as Array<{ id: string; code: string }>).find((item) => item.code === code))
      .find((item) => item !== undefined);
    if (!role) {
      throw new DomainValidationError('Este perfil não está cadastrado na conta.');
    }
    const prior = await manager.query(
      `SELECT grants_all_branches AS "grantsAllBranches", assigned_branch_id AS "assignedBranchId"
       FROM user_role_assignments
       WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
       ORDER BY assigned_at DESC
       LIMIT 1`,
      [tenantId, userId],
    );
    await manager.query(
      `UPDATE user_role_assignments assignment
       SET revoked_at = now(), updated_by = $4, updated_at = now()
       FROM roles role
       WHERE assignment.role_id = role.id
         AND assignment.tenant_id = $1
         AND assignment.user_id = $2
         AND assignment.revoked_at IS NULL
         AND upper(role.code) = ANY($3::text[])
         AND role.id <> $5`,
      [tenantId, userId, ['TECNICO', 'PRODUCAO', 'QUALIDADE', 'GERENTE', 'ATENDENTE'], actorUserId, role.id],
    );
    const active = await manager.query(
      `SELECT id FROM user_role_assignments
       WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3 AND revoked_at IS NULL`,
      [tenantId, userId, role.id],
    );
    if (active[0]) {
      return;
    }
    const scope = prior[0] as { grantsAllBranches: boolean; assignedBranchId: string | null } | undefined;
    await manager.query(
      `INSERT INTO user_role_assignments
         (id, tenant_id, user_id, role_id, assigned_branch_id, grants_all_branches, assigned_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $7)`,
      [randomUUID(), tenantId, userId, role.id, scope?.assignedBranchId ?? null, scope?.grantsAllBranches ?? true, actorUserId],
    );
  }
}
