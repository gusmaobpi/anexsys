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
  totalValue: string | number | null;
  originServiceOrderId: string | null;
  returnKind: string | null;
};

type DelayRow = {
  id: string;
  orderNo: string;
  status: string;
  promisedDate: string;
  promisedTime: string | null;
  difficultyGrade: number | null;
};

export type TechnicianPlanningItem = {
  userId: string;
  displayName: string;
  profile: string | null;
  dailyRate: number;
  piecesPerDayTarget: number;
  scheduledDaysToday: number;
  parentOrdersCount: number;
  reworkOrdersCount: number;
  piecesProduced: number;
  producedValue: number;
  netPlanningResult: number;
};

export type StatusBreakdownItem = {
  status: string;
  ordersCount: number;
  piecesCount: number;
  totalValue: number;
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
    const [finishRows, delayRows, pendingApprovals, technicianPlanning, statusBreakdown] = await Promise.all([
      this.finishRows(tenantId, branchId),
      this.delayRows(tenantId, branchId),
      this.pendingApprovals(tenantId, branchId),
      this.buildTechnicianPlanning(tenantId, branchId),
      this.buildStatusBreakdown(tenantId, branchId),
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
      technicianPlanning,
      statusBreakdown,
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
              so.total_value AS "totalValue",
              so.origin_service_order_id AS "originServiceOrderId",
              so.return_kind AS "returnKind",
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

  private async buildTechnicianPlanning(tenantId: string, branchId: string): Promise<TechnicianPlanningItem[]> {
    try {
      const [techRows, finishRows] = await Promise.all([
        this.dataSource.query(
          `SELECT t.user_id AS "userId",
                  u.display_name AS "displayName",
                  t.profile_code AS "profile",
                  COALESCE(t.daily_rate, 0) AS "dailyRate",
                  COALESCE(t.pieces_per_day, 0) AS "piecesPerDay",
                  CASE WHEN EXISTS (
                    SELECT 1
                      FROM floor_schedule_days d
                      JOIN floor_schedule_periods p ON p.id = d.period_id AND p.tenant_id = d.tenant_id
                     WHERE d.tenant_id = $1
                       AND p.branch_id = $2
                       AND d.technician_id = t.id
                       AND d.work_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
                  ) THEN 1 ELSE 0 END AS "scheduledToday"
             FROM floor_technicians t
             JOIN user_identities u ON u.id = t.user_id
            WHERE t.tenant_id = $1
              AND t.status = 'active'
            ORDER BY u.display_name ASC`,
          [tenantId, branchId],
        ) as Promise<
          Array<{
            userId: string;
            displayName: string;
            profile: string | null;
            dailyRate: string | number;
            piecesPerDay: string | number;
            scheduledToday: number;
          }>
        >,
        this.finishRows(tenantId, branchId),
      ]);

      const pieceCounts = await this.pieceCounts(tenantId, finishRows);
      const map = new Map<
        string,
        {
          userId: string;
          displayName: string;
          profile: string | null;
          dailyRate: number;
          piecesPerDayTarget: number;
          scheduledDaysToday: number;
          parentOrders: Set<string>;
          reworkOrders: Set<string>;
          piecesProduced: number;
          producedValueByOrder: Map<string, number>;
        }
      >();

      for (const tech of techRows) {
        map.set(tech.userId, {
          userId: tech.userId,
          displayName: tech.displayName,
          profile: tech.profile,
          dailyRate: Number(tech.dailyRate ?? 0),
          piecesPerDayTarget: Number(tech.piecesPerDay ?? 0),
          scheduledDaysToday: Number(tech.scheduledToday ?? 0),
          parentOrders: new Set<string>(),
          reworkOrders: new Set<string>(),
          piecesProduced: 0,
          producedValueByOrder: new Map<string, number>(),
        });
      }

      for (const finish of finishRows) {
        let entry = map.get(finish.userId);
        if (!entry) {
          entry = {
            userId: finish.userId,
            displayName: finish.displayName,
            profile: null,
            dailyRate: 0,
            piecesPerDayTarget: 0,
            scheduledDaysToday: 1,
            parentOrders: new Set<string>(),
            reworkOrders: new Set<string>(),
            piecesProduced: 0,
            producedValueByOrder: new Map<string, number>(),
          };
          map.set(finish.userId, entry);
        }
        const pieces = pieceCounts.get(this.pieceKey(finish)) ?? 0;
        entry.piecesProduced += pieces;
        const isReworkOrChild =
          finish.action === 'finish_rework' ||
          Boolean(finish.originServiceOrderId) ||
          Boolean(finish.returnKind);
        if (isReworkOrChild) {
          entry.reworkOrders.add(finish.serviceOrderId);
        } else {
          entry.parentOrders.add(finish.serviceOrderId);
          entry.producedValueByOrder.set(finish.serviceOrderId, Number(finish.totalValue ?? 0));
        }
      }

      return [...map.values()]
        .map((item) => {
          let producedValue = 0;
          for (const val of item.producedValueByOrder.values()) {
            if (Number.isFinite(val)) producedValue += val;
          }
          const plannedCost = item.scheduledDaysToday > 0 ? item.dailyRate : item.parentOrders.size > 0 ? item.dailyRate : 0;
          return {
            userId: item.userId,
            displayName: item.displayName,
            profile: item.profile,
            dailyRate: item.dailyRate,
            piecesPerDayTarget: item.piecesPerDayTarget,
            scheduledDaysToday: item.scheduledDaysToday,
            parentOrdersCount: item.parentOrders.size,
            reworkOrdersCount: item.reworkOrders.size,
            piecesProduced: item.piecesProduced,
            producedValue: Number(producedValue.toFixed(2)),
            netPlanningResult: Number((producedValue - plannedCost).toFixed(2)),
          };
        })
        .sort((a, b) => b.producedValue - a.producedValue || b.piecesProduced - a.piecesProduced);
    } catch {
      return [];
    }
  }

  private async buildStatusBreakdown(tenantId: string, branchId: string): Promise<StatusBreakdownItem[]> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT so.status AS status,
                COUNT(DISTINCT so.id)::int AS "ordersCount",
                COALESCE(SUM(COALESCE(items_agg.pieces, 0)), 0)::int AS "piecesCount",
                COALESCE(SUM(COALESCE(so.total_value, 0)), 0)::numeric(18,2) AS "totalValue"
           FROM service_orders so
           LEFT JOIN (
             SELECT service_order_id,
                    COALESCE(SUM(GREATEST(ROUND(quantity), 1)), 0)::int AS pieces
               FROM service_order_items
              WHERE is_deleted = false
                AND status <> 'cancelled'
              GROUP BY service_order_id
           ) items_agg ON items_agg.service_order_id = so.id
          WHERE so.tenant_id = $1
            AND so.branch_id = $2
            AND so.is_deleted = false
            AND so.status <> 'cancelled'
          GROUP BY so.status
          ORDER BY "ordersCount" DESC`,
        [tenantId, branchId],
      )) as Array<{
        status: string;
        ordersCount: number;
        piecesCount: number;
        totalValue: string | number;
      }>;
      return rows.map((r) => ({
        status: r.status,
        ordersCount: Number(r.ordersCount ?? 0),
        piecesCount: Number(r.piecesCount ?? 0),
        totalValue: Number(r.totalValue ?? 0),
      }));
    } catch {
      return [];
    }
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
