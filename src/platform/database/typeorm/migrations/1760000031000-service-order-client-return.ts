import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderClientReturn1760000031000 implements MigrationInterface {
  name = 'ServiceOrderClientReturn1760000031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS service_orders
      ADD COLUMN IF NOT EXISTS origin_service_order_id uuid
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS service_orders
      ADD COLUMN IF NOT EXISTS return_kind varchar(20)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_service_orders_origin
      ON service_orders (origin_service_order_id)
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      DROP CONSTRAINT IF EXISTS chk_service_orders_return_kind
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD CONSTRAINT chk_service_orders_return_kind
      CHECK (return_kind IS NULL OR return_kind IN ('reconserto', 'warranty', 'charged'))
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      DROP CONSTRAINT IF EXISTS chk_service_orders_status
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD CONSTRAINT chk_service_orders_status
      CHECK (status IN (
        'open',
        'approved',
        'cancelled',
        'in_production',
        'awaiting_proof',
        'awaiting_quality',
        'quality',
        'in_rework',
        'ready_for_pickup',
        'picked_up'
      ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_orders
      DROP CONSTRAINT IF EXISTS chk_service_orders_status
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD CONSTRAINT chk_service_orders_status
      CHECK (status IN (
        'open',
        'approved',
        'cancelled',
        'in_production',
        'awaiting_quality',
        'quality',
        'in_rework',
        'ready_for_pickup'
      ))
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      DROP CONSTRAINT IF EXISTS chk_service_orders_return_kind
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_service_orders_origin
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS service_orders
      DROP COLUMN IF EXISTS return_kind
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS service_orders
      DROP COLUMN IF EXISTS origin_service_order_id
    `);
  }
}
