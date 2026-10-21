import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import {
  deadlineInstant,
  delayKind,
  gradeMinutes,
  summarizeProduction,
  type ProductionFinish,
} from './dashboard-rules';

type FinishRow = {
  userId: string;
  displayName: string;
  serviceOrderId: string;
  orderNo: string;
  action: string;
  versionId: string | null;
  difficultyGrade: number | null;
};

type DelayRow = {
  id: string;
  orderNo: string;
  status: string;
  promisedDate: string;
  promisedTime: string | null;
  difficultyGrade: number | null;
};

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
  ) {}

  async home(tenantId: string, branchId: string) {
    const tenant = await this.tenantService.getById(tenantId);
    const minutes = [
      tenant.grade1Minutes ?? 30,
      tenant.grade2Minutes ?? 60,
      tenant.grade3Minutes ?? 90,
      tenant.grade4Minutes ?? 180,
    ];
    const leadHours = tenant.delayAlertLeadHours ?? 2;
    const [finishRows, delayRows, pendingApprovals] = await Promise.all([
      this.finishRows(tenantId, branchId),
      this.delayRows(tenantId, branchId),
      this.pendingApprovals(tenantId, branchId),
    ]);
    const pieceCounts = await this.pieceCounts(tenantId, finishRows);
    const events: ProductionFinish[] = finishRows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      serviceOrderId: row.serviceOrderId,
      orderNo: row.orderNo,
      difficultyGrade: row.difficultyGrade === null ? null : Number(row.difficultyGrade),
      pieces: pieceCounts.get(this.pieceKey(row)) ?? 0,
    }));
    const now = new Date();
    const delays = delayRows
      .map((row) => {
        const grade = row.difficultyGrade === null ? null : Number(row.difficultyGrade);
        const deadline = deadlineInstant(String(row.promisedDate).slice(0, 10), row.promisedTime);
        const kind = delayKind(row.status, deadline, now, leadHours);
        if (!kind) {
          return null;
        }
        return {
          id: row.id,
          orderNo: row.orderNo,
          status: row.status,
          promisedAt: deadline.toISOString(),
          kind,
          difficultyGrade: grade,
          estimatedMinutes: gradeMinutes(minutes, grade),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((left, right) => left.promisedAt.localeCompare(right.promisedAt));

    return {
      leadHours,
      grades: minutes.map((value, index) => ({ grade: index + 1, minutes: value })),
      produced: summarizeProduction(events),
      delays,
      pendingApprovals,
    };
  }

  private pieceKey(row: FinishRow) {
    return row.action === 'finish_rework' && row.versionId ? `rework:${row.versionId}` : `order:${row.serviceOrderId}`;
  }

  private async finishRows(tenantId: string, branchId: string): Promise<FinishRow[]> {
    return this.dataSource.query(
      `SELECT e.user_id AS "userId",
              u.display_name AS "displayName",
              e.service_order_id AS "serviceOrderId",
              so.order_no AS "orderNo",
              e.action,
              e.production_order_version_id AS "versionId",
              COALESCE(so.difficulty_grade, (
                SELECT MAX(svc.difficulty_grade)
                  FROM service_order_items i
                  JOIN atelier_services svc ON svc.id = i.service_id
                 WHERE i.service_order_id = so.id
                   AND i.is_deleted = false
              )) AS "difficultyGrade"
         FROM floor_diary_entries e
         JOIN user_identities u ON u.id = e.user_id
         JOIN service_orders so ON so.id = e.service_order_id
        WHERE e.tenant_id = $1
          AND e.branch_id = $2
          AND e.action IN ('finish_production', 'finish_rework')
          AND (e.happened_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [tenantId, branchId],
    );
  }

  private async pieceCounts(tenantId: string, rows: FinishRow[]) {
    const counts = new Map<string, number>();
    const orderIds = [...new Set(rows.map((row) => row.serviceOrderId))];
    const versionIds = [...new Set(rows.filter((row) => row.action === 'finish_rework' && row.versionId).map((row) => row.versionId as string))];
    if (orderIds.length > 0) {
      const pieces = await this.dataSource.query(
        `SELECT service_order_id AS "serviceOrderId", count(*)::int AS pieces
           FROM service_order_items
          WHERE tenant_id = $1 AND is_deleted = false AND service_order_id = ANY($2::uuid[])
          GROUP BY service_order_id`,
        [tenantId, orderIds],
      );
      for (const row of pieces as Array<{ serviceOrderId: string; pieces: number }>) {
        counts.set(`order:${row.serviceOrderId}`, Number(row.pieces));
      }
    }
    if (versionIds.length > 0) {
      const versions = await this.dataSource.query(
        `SELECT id, affected_service_order_item_ids AS items
           FROM production_order_versions
          WHERE id = ANY($1::uuid[])`,
        [versionIds],
      );
      for (const row of versions as Array<{ id: string; items: string[] | null }>) {
        const pieces = Array.isArray(row.items) ? row.items.filter(Boolean).length : 0;
        const fallback = rows.find((item) => item.versionId === row.id);
        counts.set(`rework:${row.id}`, pieces > 0 ? pieces : fallback ? counts.get(`order:${fallback.serviceOrderId}`) ?? 0 : 0);
      }
    }
    return counts;
  }

  private async delayRows(tenantId: string, branchId: string): Promise<DelayRow[]> {
    return this.dataSource.query(
      `SELECT so.id,
              so.order_no AS "orderNo",
              so.status,
              so.promised_delivery_date AS "promisedDate",
              so.promised_delivery_time AS "promisedTime",
              COALESCE(so.difficulty_grade, (
                SELECT MAX(svc.difficulty_grade)
                  FROM service_order_items i
                  JOIN atelier_services svc ON svc.id = i.service_id
                 WHERE i.service_order_id = so.id
                   AND i.is_deleted = false
              )) AS "difficultyGrade"
         FROM service_orders so
        WHERE so.tenant_id = $1
          AND so.branch_id = $2
          AND so.is_deleted = false
          AND so.status NOT IN ('ready_for_pickup', 'picked_up', 'cancelled')`,
      [tenantId, branchId],
    );
  }

  private async pendingApprovals(tenantId: string, branchId: string) {
    return this.dataSource.query(
      `SELECT so.id,
              so.order_no AS "orderNo",
              so.status,
              so.opened_at AS "openedAt"
         FROM service_orders so
        WHERE so.tenant_id = $1
          AND so.branch_id = $2
          AND so.is_deleted = false
          AND so.status <> 'cancelled'
          AND NOT EXISTS (
            SELECT 1
              FROM service_order_approvals a
             WHERE a.service_order_id = so.id
               AND a.is_deleted = false
               AND a.method IN ('counter', 'paper', 'link')
          )
        ORDER BY so.opened_at ASC
        LIMIT 80`,
      [tenantId, branchId],
    );
  }
}
