import { MigrationInterface, QueryRunner } from 'typeorm';

export class DashboardParameters1760000057000 implements MigrationInterface {
  name = 'DashboardParameters1760000057000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delay_alert_lead_hours integer NOT NULL DEFAULT 2`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grade_1_minutes integer NOT NULL DEFAULT 30`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grade_2_minutes integer NOT NULL DEFAULT 60`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grade_3_minutes integer NOT NULL DEFAULT 90`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grade_4_minutes integer NOT NULL DEFAULT 180`);
    await queryRunner.query(`ALTER TABLE atelier_services ADD COLUMN IF NOT EXISTS difficulty_grade smallint`);
    await queryRunner.query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS difficulty_grade smallint`);
    await queryRunner.query(`ALTER TABLE atelier_services DROP CONSTRAINT IF EXISTS chk_atelier_services_difficulty_grade`);
    await queryRunner.query(`
      ALTER TABLE atelier_services
      ADD CONSTRAINT chk_atelier_services_difficulty_grade
      CHECK (difficulty_grade IS NULL OR difficulty_grade BETWEEN 1 AND 4)
    `);
    await queryRunner.query(`ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS chk_service_orders_difficulty_grade`);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD CONSTRAINT chk_service_orders_difficulty_grade
      CHECK (difficulty_grade IS NULL OR difficulty_grade BETWEEN 1 AND 4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS chk_service_orders_difficulty_grade`);
    await queryRunner.query(`ALTER TABLE atelier_services DROP CONSTRAINT IF EXISTS chk_atelier_services_difficulty_grade`);
    await queryRunner.query(`ALTER TABLE service_orders DROP COLUMN IF EXISTS difficulty_grade`);
    await queryRunner.query(`ALTER TABLE atelier_services DROP COLUMN IF EXISTS difficulty_grade`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS grade_4_minutes`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS grade_3_minutes`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS grade_2_minutes`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS grade_1_minutes`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS delay_alert_lead_hours`);
  }
}
