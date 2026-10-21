import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailSettings1760000054000 implements MigrationInterface {
  name = 'EmailSettings1760000054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_settings (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL UNIQUE,
        host varchar(200) NOT NULL DEFAULT '',
        port integer NOT NULL DEFAULT 587,
        security varchar(20) NOT NULL DEFAULT 'starttls',
        username varchar(200) NOT NULL DEFAULT '',
        password text NOT NULL DEFAULT '',
        from_name varchar(120) NOT NULL DEFAULT '',
        from_address varchar(200) NOT NULL DEFAULT '',
        public_link_origin varchar(200) NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT chk_email_settings_security CHECK (security IN ('none', 'starttls', 'ssl')),
        CONSTRAINT chk_email_settings_port CHECK (port BETWEEN 1 AND 65535)
      )
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
          ('email.write', 'Configurar e-mail', 'Altera a caixa de saída da Conta')
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
          ('GERENTE', 'email.write'),
          ('MASTER_ADMINISTRATOR', 'email.write')
      ) AS needed(role_code, code) ON upper(r.code) = needed.role_code
      JOIN permissions p ON p.tenant_id = r.tenant_id AND p.code = needed.code
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions existing
        WHERE existing.role_id = r.id AND existing.permission_id = p.id
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON email_settings TO anexsys_app;
          ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
          ALTER TABLE email_settings FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS tenant_isolation ON email_settings;
          CREATE POLICY tenant_isolation ON email_settings
            USING (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            )
            WITH CHECK (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            );
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS email_settings');
  }
}
