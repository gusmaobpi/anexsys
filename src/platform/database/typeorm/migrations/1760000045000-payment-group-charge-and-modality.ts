import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentGroupChargeAndModality1760000045000 implements MigrationInterface {
  name = 'PaymentGroupChargeAndModality1760000045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS billing_scope_id uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS informed_modality varchar(20) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS confirmed_modality varchar(20) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD COLUMN IF NOT EXISTS operator_product_code varchar(80) NULL
    `);
    await queryRunner.query(`
      UPDATE payment_records AS payments
      SET billing_scope_id = COALESCE(orders.group_id, payments.service_order_id)
      FROM service_orders AS orders
      WHERE orders.id = payments.service_order_id
        AND payments.billing_scope_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE payment_records
      SET billing_scope_id = service_order_id
      WHERE billing_scope_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ALTER COLUMN billing_scope_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_informed_modality
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD CONSTRAINT chk_payment_records_informed_modality
      CHECK (
        informed_modality IS NULL
        OR (
          payment_method = 'card'
          AND informed_modality IN ('credit', 'debit', 'pix', 'voucher')
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_confirmed_modality
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      ADD CONSTRAINT chk_payment_records_confirmed_modality
      CHECK (
        confirmed_modality IS NULL
        OR (
          payment_method = 'card'
          AND confirmed_modality IN ('credit', 'debit', 'pix', 'voucher')
        )
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM payment_records
          WHERE status = 'pending'
          GROUP BY billing_scope_id
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'payment_records already has more than one pending charge for the same billing_scope_id';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_records_one_pending_scope
      ON payment_records (billing_scope_id)
      WHERE status = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_payment_records_one_pending_scope`);
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_confirmed_modality
    `);
    await queryRunner.query(`
      ALTER TABLE payment_records
      DROP CONSTRAINT IF EXISTS chk_payment_records_informed_modality
    `);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS operator_product_code`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS confirmed_modality`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS informed_modality`);
    await queryRunner.query(`ALTER TABLE payment_records DROP COLUMN IF EXISTS billing_scope_id`);
  }
}
