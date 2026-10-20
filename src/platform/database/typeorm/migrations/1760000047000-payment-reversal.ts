import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentReversal1760000047000 implements MigrationInterface {
  name = 'PaymentReversal1760000047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS reversal_reason varchar(200) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS reversed_by uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS reversed_by`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS reversed_at`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS reversal_reason`);
  }
}
