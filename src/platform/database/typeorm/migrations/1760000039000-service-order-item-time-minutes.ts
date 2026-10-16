import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderItemTimeMinutes1760000039000 implements MigrationInterface {
  name = 'ServiceOrderItemTimeMinutes1760000039000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_order_items
      ADD COLUMN IF NOT EXISTS time_minutes integer NULL
    `);
    await queryRunner.query(`
      ALTER TABLE service_order_items
      DROP CONSTRAINT IF EXISTS chk_service_order_items_time_minutes
    `);
    await queryRunner.query(`
      ALTER TABLE service_order_items
      ADD CONSTRAINT chk_service_order_items_time_minutes
      CHECK (time_minutes IS NULL OR time_minutes >= 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS chk_service_order_items_time_minutes`);
    await queryRunner.query(`ALTER TABLE service_order_items DROP COLUMN IF EXISTS time_minutes`);
  }
}
