import { MigrationInterface, QueryRunner } from 'typeorm';

export class FloorSchedule1760000050000 implements MigrationInterface {
  name = 'FloorSchedule1760000050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS floor_technicians (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        user_id uuid NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT uq_floor_technicians_tenant_user UNIQUE (tenant_id, user_id),
        CONSTRAINT chk_floor_technicians_status CHECK (status IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS floor_schedule_days (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        technician_id uuid NOT NULL REFERENCES floor_technicians(id),
        work_date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT uq_floor_schedule_days_branch_tech_date UNIQUE (branch_id, technician_id, work_date)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS floor_checkin_codes (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        purpose varchar(20) NOT NULL,
        code_value varchar(80) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT uq_floor_checkin_codes_value UNIQUE (code_value),
        CONSTRAINT uq_floor_checkin_codes_branch_purpose UNIQUE (branch_id, purpose),
        CONSTRAINT chk_floor_checkin_codes_purpose CHECK (purpose IN ('production', 'quality'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS floor_sessions (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        purpose varchar(20) NOT NULL,
        technician_id uuid NULL REFERENCES floor_technicians(id),
        user_id uuid NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        opened_at timestamptz NOT NULL DEFAULT now(),
        closed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT chk_floor_sessions_purpose CHECK (purpose IN ('production', 'quality')),
        CONSTRAINT chk_floor_sessions_status CHECK (status IN ('active', 'closed'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS floor_diary_entries (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        user_id uuid NOT NULL,
        service_order_id uuid NOT NULL,
        order_no varchar(50) NOT NULL,
        action varchar(40) NOT NULL,
        happened_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD COLUMN IF NOT EXISTS floor_holder_user_id uuid NULL
    `);
    await queryRunner.query(`
      INSERT INTO permissions (id, tenant_id, code, display_name, description, created_by, updated_by)
      SELECT gen_random_uuid(), sample.tenant_id, 'floor_schedule.write', 'Grade de planejamento',
             'Marca a escala da filial e imprime o check-in', sample.created_by, sample.created_by
      FROM permissions sample
      WHERE sample.code = 'service_orders.write'
        AND NOT EXISTS (
          SELECT 1 FROM permissions existing
          WHERE existing.tenant_id = sample.tenant_id AND existing.code = 'floor_schedule.write'
        )
    `);
    await queryRunner.query(`
      INSERT INTO permissions (id, tenant_id, code, display_name, description, created_by, updated_by)
      SELECT gen_random_uuid(), sample.tenant_id, needed.code, needed.code, needed.code, sample.created_by, sample.created_by
      FROM (
        SELECT DISTINCT ON (tenant_id) tenant_id, created_by
        FROM permissions
        ORDER BY tenant_id, created_at
      ) sample
      CROSS JOIN (
        VALUES
          ('branches.read'), ('branches.write'),
          ('companies.read'), ('companies.write'),
          ('customers.read'), ('customers.write'),
          ('finance.read'), ('finance.write'),
          ('floor_schedule.write'),
          ('measurements.read'), ('measurements.write'),
          ('permissions.read'),
          ('production_orders.read'), ('production_orders.write'),
          ('quality.read'), ('quality.write'),
          ('rework.read'), ('rework.write'),
          ('roles.read'), ('roles.write'),
          ('service_orders.read'), ('service_orders.write'),
          ('tenants.read'), ('tenants.write'),
          ('users.read'), ('users.write')
      ) AS needed(code)
      WHERE NOT EXISTS (
        SELECT 1 FROM permissions existing
        WHERE existing.tenant_id = sample.tenant_id AND existing.code = needed.code
      )
    `);
    await queryRunner.query(`
      INSERT INTO roles (id, tenant_id, code, display_name, description, status, is_system_managed, created_by, updated_by)
      SELECT gen_random_uuid(), sample.tenant_id, needed.code, needed.display_name, needed.description, 'active', true, sample.created_by, sample.created_by
      FROM (
        SELECT DISTINCT ON (tenant_id) tenant_id, created_by
        FROM permissions
        ORDER BY tenant_id, created_at
      ) sample
      CROSS JOIN (
        VALUES
          ('RECEPCAO', 'Recepção', 'Recebe o cliente e consulta OS.'),
          ('ATENDENTE', 'Atendente / medidor', 'Abre OS, cadastra cliente e registra medidas.'),
          ('PRODUCAO', 'Produção', 'Executa a Ordem de Produção.'),
          ('QUALIDADE', 'Qualidade', 'Revisa e reprova peças.'),
          ('GERENTE', 'Gerente', 'Administra a Conta, Empresas, Filiais e usuários.')
      ) AS needed(code, display_name, description)
      WHERE NOT EXISTS (
        SELECT 1 FROM roles existing
        WHERE existing.tenant_id = sample.tenant_id AND upper(existing.code) = needed.code
      )
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_by, updated_by)
      SELECT gen_random_uuid(), r.tenant_id, r.id, p.id, r.created_by, r.created_by
      FROM roles r
      JOIN permissions p ON p.tenant_id = r.tenant_id AND p.code = 'floor_schedule.write'
      WHERE upper(r.code) IN ('GERENTE', 'MASTER_ADMINISTRATOR')
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_by, updated_by)
      SELECT gen_random_uuid(), r.tenant_id, r.id, p.id, r.created_by, r.created_by
      FROM roles r
      JOIN permissions p ON p.tenant_id = r.tenant_id
      JOIN (
        VALUES
          ('RECEPCAO', 'customers.read'),
          ('RECEPCAO', 'service_orders.read'),
          ('RECEPCAO', 'branches.read'),
          ('ATENDENTE', 'customers.read'),
          ('ATENDENTE', 'customers.write'),
          ('ATENDENTE', 'measurements.read'),
          ('ATENDENTE', 'measurements.write'),
          ('ATENDENTE', 'service_orders.read'),
          ('ATENDENTE', 'service_orders.write'),
          ('ATENDENTE', 'branches.read'),
          ('PRODUCAO', 'production_orders.read'),
          ('PRODUCAO', 'production_orders.write'),
          ('PRODUCAO', 'service_orders.read'),
          ('QUALIDADE', 'quality.read'),
          ('QUALIDADE', 'quality.write'),
          ('QUALIDADE', 'rework.read'),
          ('QUALIDADE', 'rework.write'),
          ('QUALIDADE', 'production_orders.read'),
          ('QUALIDADE', 'service_orders.read'),
          ('GERENTE', 'tenants.read'),
          ('GERENTE', 'tenants.write'),
          ('GERENTE', 'companies.read'),
          ('GERENTE', 'companies.write'),
          ('GERENTE', 'branches.read'),
          ('GERENTE', 'branches.write'),
          ('GERENTE', 'users.read'),
          ('GERENTE', 'users.write'),
          ('GERENTE', 'roles.read'),
          ('GERENTE', 'roles.write'),
          ('GERENTE', 'permissions.read'),
          ('GERENTE', 'customers.read'),
          ('GERENTE', 'customers.write'),
          ('GERENTE', 'measurements.read'),
          ('GERENTE', 'measurements.write'),
          ('GERENTE', 'service_orders.read'),
          ('GERENTE', 'service_orders.write'),
          ('GERENTE', 'production_orders.read'),
          ('GERENTE', 'production_orders.write'),
          ('GERENTE', 'quality.read'),
          ('GERENTE', 'quality.write'),
          ('GERENTE', 'floor_schedule.write'),
          ('GERENTE', 'finance.read'),
          ('GERENTE', 'finance.write')
      ) AS needed(role_code, permission_code)
        ON upper(r.code) = needed.role_code AND p.code = needed.permission_code
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
      )
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_by, updated_by)
      SELECT gen_random_uuid(), r.tenant_id, r.id, p.id, r.created_by, r.created_by
      FROM roles r
      JOIN permissions p
        ON p.tenant_id = r.tenant_id
       AND p.code IN ('production_orders.read', 'production_orders.write')
      WHERE upper(r.code) IN ('TECNICO', 'PRODUCAO')
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_by, updated_by)
      SELECT gen_random_uuid(), r.tenant_id, r.id, p.id, r.created_by, r.created_by
      FROM roles r
      JOIN permissions p
        ON p.tenant_id = r.tenant_id
       AND p.code IN ('quality.read', 'quality.write', 'production_orders.read')
      WHERE upper(r.code) = 'QUALIDADE'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE service_orders DROP COLUMN IF EXISTS floor_holder_user_id');
    await queryRunner.query('DROP TABLE IF EXISTS floor_diary_entries');
    await queryRunner.query('DROP TABLE IF EXISTS floor_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS floor_checkin_codes');
    await queryRunner.query('DROP TABLE IF EXISTS floor_schedule_days');
    await queryRunner.query('DROP TABLE IF EXISTS floor_technicians');
  }
}
