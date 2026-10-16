import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentRecordCardFields1760000044000 implements MigrationInterface {
  name = 'PaymentRecordCardFields1760000044000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS card_brand varchar(30) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS installments integer NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS nsu varchar(40) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS authorization_code varchar(60) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS acquirer_transaction_id varchar(80) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_status
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD CONSTRAINT chk_payment_records_status
      CHECK (status IN ('authorized', 'received', 'settled', 'reversed', 'failed', 'pending', 'canceled'))
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
      CHECK (status IN ('authorized', 'received', 'settled', 'reversed', 'failed', 'pending'))
    `);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS acquirer_transaction_id`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS authorization_code`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS nsu`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS installments`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS card_brand`);
  }
}
