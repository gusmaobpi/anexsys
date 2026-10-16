import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentRecordPendingStatus1760000043000 implements MigrationInterface {
  name = 'PaymentRecordPendingStatus1760000043000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_status
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD CONSTRAINT chk_payment_records_status
      CHECK (status IN ('authorized', 'received', 'settled', 'reversed', 'failed', 'pending'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_status
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD CONSTRAINT chk_payment_records_status
      CHECK (status IN ('authorized', 'received', 'settled', 'reversed', 'failed'))
    `);
  }
}
