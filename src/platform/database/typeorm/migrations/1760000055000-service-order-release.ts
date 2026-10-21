import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderRelease1760000055000 implements MigrationInterface {
  name = 'ServiceOrderRelease1760000055000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_orders
        ADD COLUMN IF NOT EXISTS origin_floor_names text,
        ADD COLUMN IF NOT EXISTS delivery_released_at timestamptz,
        ADD COLUMN IF NOT EXISTS delivery_released_by uuid,
        ADD COLUMN IF NOT EXISTS delivery_release_reason varchar(200),
        ADD COLUMN IF NOT EXISTS charge_waived_at timestamptz,
        ADD COLUMN IF NOT EXISTS charge_waived_by uuid,
        ADD COLUMN IF NOT EXISTS charge_waived_reason varchar(200);
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
        ALTER COLUMN warranty_execution_period_days SET DEFAULT 90,
        ALTER COLUMN block_delivery_with_outstanding_balance SET DEFAULT true;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'service_orders.release') THEN
          UPDATE tenants
             SET block_delivery_with_outstanding_balance = true
           WHERE block_delivery_with_outstanding_balance = false;
        END IF;
      END
      $$
    `);
    await queryRunner.query(`
      INSERT INTO permissions (id, tenant_id, code, display_name, description, created_by, updated_by)
      SELECT gen_random_uuid(), sample.tenant_id, needed.code, needed.display_name, needed.description,
             sample.created_by, sample.created_by
      FROM (
        SELECT DISTINCT ON (tenant_id) tenant_id, created_by
        FROM permissions
        ORDER BY tenant_id, created_at
      ) sample
      CROSS JOIN (
        VALUES
          ('service_orders.release', 'Liberar exceção de OS', 'Libera entrega com saldo e OS sem valor fora do prazo')
      ) AS needed(code, display_name, description)
      WHERE NOT EXISTS (
        SELECT 1 FROM permissions existing
        WHERE existing.tenant_id = sample.tenant_id AND existing.code = needed.code
      )
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_by, updated_by)
      SELECT gen_random_uuid(), r.tenant_id, r.id, p.id, r.created_by, r.created_by
      FROM roles r
      JOIN (
        VALUES
          ('GERENTE', 'service_orders.release'),
          ('MASTER_ADMINISTRATOR', 'service_orders.release')
      ) AS needed(role_code, code) ON upper(r.code) = needed.role_code
      JOIN permissions p ON p.tenant_id = r.tenant_id AND p.code = needed.code
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions existing
        WHERE existing.role_id = r.id AND existing.permission_id = p.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
       USING roles r, permissions p
       WHERE rp.role_id = r.id
         AND rp.permission_id = p.id
         AND p.code = 'service_orders.release'
         AND upper(r.code) IN ('GERENTE', 'MASTER_ADMINISTRATOR');
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE code = 'service_orders.release';`);
    await queryRunner.query(`
      ALTER TABLE service_orders
        DROP COLUMN IF EXISTS origin_floor_names,
        DROP COLUMN IF EXISTS delivery_released_at,
        DROP COLUMN IF EXISTS delivery_released_by,
        DROP COLUMN IF EXISTS delivery_release_reason,
        DROP COLUMN IF EXISTS charge_waived_at,
        DROP COLUMN IF EXISTS charge_waived_by,
        DROP COLUMN IF EXISTS charge_waived_reason;
    `);
  }
}
