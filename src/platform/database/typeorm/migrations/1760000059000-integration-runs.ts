import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationRuns1760000059000 implements MigrationInterface {
  name = 'IntegrationRuns1760000059000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_runs (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        process_no integer NOT NULL,
        kind varchar(40) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'running',
        total_count integer NOT NULL DEFAULT 0,
        processed_count integer NOT NULL DEFAULT 0,
        created_count integer NOT NULL DEFAULT 0,
        skipped_count integer NOT NULL DEFAULT 0,
        error_count integer NOT NULL DEFAULT 0,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_integration_runs_process UNIQUE (tenant_id, process_no),
        CONSTRAINT chk_integration_runs_status CHECK (status IN ('running', 'completed'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_run_lines (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        run_id uuid NOT NULL REFERENCES integration_runs(id) ON DELETE CASCADE,
        line_no integer NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        error_code varchar(120),
        error_message text,
        hint text,
        payload jsonb NOT NULL,
        source_payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_integration_run_lines_status CHECK (status IN ('pending', 'created', 'skipped', 'error'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_integration_runs_tenant_kind ON integration_runs (tenant_id, kind, started_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_integration_run_lines_run ON integration_run_lines (run_id, status, line_no)`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON integration_runs TO anexsys_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON integration_run_lines TO anexsys_app;
          ALTER TABLE integration_runs ENABLE ROW LEVEL SECURITY;
          ALTER TABLE integration_runs FORCE ROW LEVEL SECURITY;
          ALTER TABLE integration_run_lines ENABLE ROW LEVEL SECURITY;
          ALTER TABLE integration_run_lines FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS tenant_isolation ON integration_runs;
          DROP POLICY IF EXISTS tenant_isolation ON integration_run_lines;
          CREATE POLICY tenant_isolation ON integration_runs
            USING (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            )
            WITH CHECK (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            );
          CREATE POLICY tenant_isolation ON integration_run_lines
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
    await queryRunner.query(`DROP TABLE IF EXISTS integration_run_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration_runs`);
  }
}
