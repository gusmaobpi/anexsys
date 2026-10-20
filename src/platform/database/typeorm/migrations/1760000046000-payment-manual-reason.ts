import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentManualReason1760000046000 implements MigrationInterface {
  name = 'PaymentManualReason1760000046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS manual_reason varchar(200) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP COLUMN IF EXISTS manual_reason
    `);
  }
}
