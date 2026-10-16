import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyMinuteRates1760000040000 implements MigrationInterface {
  name = 'CompanyMinuteRates1760000040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_minute_rates (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        company_id uuid NOT NULL REFERENCES companies(id),
        value_per_minute numeric(18, 2) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'active',
        is_deleted boolean NOT NULL DEFAULT false,
        deleted_at timestamptz NULL,
        deleted_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT chk_company_minute_rates_status CHECK (status IN ('active', 'inactive')),
        CONSTRAINT chk_company_minute_rates_value CHECK (value_per_minute >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_company_minute_rates_live_active
      ON company_minute_rates (tenant_id, company_id)
      WHERE is_deleted = false AND status = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_company_minute_rates_live_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS company_minute_rates`);
  }
}
