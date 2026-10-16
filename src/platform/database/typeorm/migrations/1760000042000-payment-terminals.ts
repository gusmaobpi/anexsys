import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentTerminals1760000042000 implements MigrationInterface {
  name = 'PaymentTerminals1760000042000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_terminals (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        branch_id uuid NOT NULL REFERENCES branches(id),
        provider varchar(30) NOT NULL,
        name varchar(120) NOT NULL,
        terminal_code varchar(80) NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        status varchar(30) NOT NULL DEFAULT 'active',
        is_deleted boolean NOT NULL DEFAULT false,
        deleted_at timestamptz NULL,
        deleted_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT chk_payment_terminals_provider CHECK (provider IN ('stone', 'cielo', 'pagbank')),
        CONSTRAINT chk_payment_terminals_status CHECK (status IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_terminals_live_default
      ON payment_terminals (tenant_id, branch_id)
      WHERE is_deleted = false AND is_default = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_payment_terminals_live_default`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_terminals`);
  }
}
