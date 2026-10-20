import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderFloorStatus1760000030000 implements MigrationInterface {
  name = 'ServiceOrderFloorStatus1760000030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      CHECK (status IN ('open', 'approved', 'cancelled', 'quality', 'ready_for_pickup'))
    `);
  }
}
