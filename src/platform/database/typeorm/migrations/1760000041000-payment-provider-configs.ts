import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentProviderConfigs1760000041000 implements MigrationInterface {
  name = 'PaymentProviderConfigs1760000041000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_provider_configs (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        company_id uuid NOT NULL REFERENCES companies(id),
        provider varchar(30) NOT NULL,
        environment varchar(20) NOT NULL DEFAULT 'sandbox',
        credentials jsonb NOT NULL DEFAULT '{}',
        status varchar(30) NOT NULL DEFAULT 'active',
        is_deleted boolean NOT NULL DEFAULT false,
        deleted_at timestamptz NULL,
        deleted_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT chk_payment_provider_configs_provider CHECK (provider IN ('stone', 'cielo', 'pagbank')),
        CONSTRAINT chk_payment_provider_configs_environment CHECK (environment IN ('sandbox', 'production')),
        CONSTRAINT chk_payment_provider_configs_status CHECK (status IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_configs_live_active
      ON payment_provider_configs (tenant_id, company_id, provider)
      WHERE is_deleted = false AND status = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_payment_provider_configs_live_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_provider_configs`);
  }
}
