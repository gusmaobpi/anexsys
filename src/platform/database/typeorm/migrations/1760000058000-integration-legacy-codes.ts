import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationLegacyCodes1760000058000 implements MigrationInterface {
  name = 'IntegrationLegacyCodes1760000058000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS legacy_code varchar(80)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_legacy_code
      ON customers (tenant_id, legacy_code)
      WHERE legacy_code IS NOT NULL AND is_deleted = false
    `);
    await queryRunner.query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS legacy_order_no varchar(80)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_service_orders_legacy_order_no
      ON service_orders (tenant_id, legacy_order_no)
      WHERE legacy_order_no IS NOT NULL AND is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_service_orders_legacy_order_no`);
    await queryRunner.query(`ALTER TABLE service_orders DROP COLUMN IF EXISTS legacy_order_no`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_customers_legacy_code`);
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS legacy_code`);
  }
}
