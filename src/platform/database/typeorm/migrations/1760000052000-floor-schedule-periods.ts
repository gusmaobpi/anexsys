import { MigrationInterface, QueryRunner } from 'typeorm';

export class FloorSchedulePeriods1760000052000 implements MigrationInterface {
  name = 'FloorSchedulePeriods1760000052000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS floor_schedule_periods (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        period_from date NOT NULL,
        period_to date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT uq_floor_schedule_periods_range UNIQUE (tenant_id, branch_id, period_from, period_to),
        CONSTRAINT chk_floor_schedule_periods_range CHECK (period_to >= period_from)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE floor_schedule_days
      ADD COLUMN IF NOT EXISTS period_id uuid NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE floor_schedule_days
          ADD CONSTRAINT fk_floor_schedule_days_period
          FOREIGN KEY (period_id) REFERENCES floor_schedule_periods(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_floor_schedule_days_period ON floor_schedule_days (period_id)
    `);
    await queryRunner.query(`
      WITH unmarked AS (
        SELECT DISTINCT tenant_id, branch_id, work_date
        FROM floor_schedule_days
        WHERE period_id IS NULL
      ),
      grouped AS (
        SELECT tenant_id, branch_id, work_date,
               work_date - (ROW_NUMBER() OVER (PARTITION BY tenant_id, branch_id ORDER BY work_date))::integer AS island
        FROM unmarked
      ),
      islands AS (
        SELECT tenant_id, branch_id, MIN(work_date) AS period_from, MAX(work_date) AS period_to
        FROM grouped
        GROUP BY tenant_id, branch_id, island
      )
      INSERT INTO floor_schedule_periods (id, tenant_id, branch_id, period_from, period_to, created_by, updated_by)
      SELECT gen_random_uuid(), islands.tenant_id, islands.branch_id, islands.period_from, islands.period_to,
             actor.created_by, actor.created_by
      FROM islands
      JOIN LATERAL (
        SELECT created_by
        FROM floor_schedule_days day
        WHERE day.tenant_id = islands.tenant_id
          AND day.branch_id = islands.branch_id
          AND day.work_date BETWEEN islands.period_from AND islands.period_to
        LIMIT 1
      ) actor ON true
      WHERE NOT EXISTS (
        SELECT 1
        FROM floor_schedule_periods existing
        WHERE existing.tenant_id = islands.tenant_id
          AND existing.branch_id = islands.branch_id
          AND existing.period_from = islands.period_from
          AND existing.period_to = islands.period_to
      )
    `);
    await queryRunner.query(`
      UPDATE floor_schedule_days day
      SET period_id = period.id
      FROM floor_schedule_periods period
      WHERE day.period_id IS NULL
        AND day.tenant_id = period.tenant_id
        AND day.branch_id = period.branch_id
        AND day.work_date BETWEEN period.period_from AND period.period_to
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON floor_schedule_periods TO anexsys_app;
          ALTER TABLE floor_schedule_periods ENABLE ROW LEVEL SECURITY;
          ALTER TABLE floor_schedule_periods FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS tenant_isolation ON floor_schedule_periods;
          CREATE POLICY tenant_isolation ON floor_schedule_periods
            USING (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            )
            WITH CHECK (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            );
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE floor_schedule_days DROP CONSTRAINT IF EXISTS fk_floor_schedule_days_period');
    await queryRunner.query('DROP INDEX IF EXISTS ix_floor_schedule_days_period');
    await queryRunner.query('ALTER TABLE floor_schedule_days DROP COLUMN IF EXISTS period_id');
    await queryRunner.query('DROP TABLE IF EXISTS floor_schedule_periods');
  }
}
