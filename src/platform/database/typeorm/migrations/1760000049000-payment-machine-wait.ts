import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentMachineWait1760000049000 implements MigrationInterface {
  name = 'PaymentMachineWait1760000049000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS machine_wait_minutes integer NOT NULL DEFAULT 3
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
      DROP CONSTRAINT IF EXISTS chk_tenants_machine_wait_minutes
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
      ADD CONSTRAINT chk_tenants_machine_wait_minutes
      CHECK (machine_wait_minutes BETWEEN 1 AND 30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_machine_wait_minutes`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS machine_wait_minutes`);
  }
}
