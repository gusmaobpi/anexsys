import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['whatsapp_settings', 'whatsapp_templates', 'whatsapp_number_history', 'whatsapp_messages'];

export class Whatsapp1760000053000 implements MigrationInterface {
  name = 'Whatsapp1760000053000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_settings (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL UNIQUE,
        phone_display varchar(40) NOT NULL DEFAULT '',
        waba_id varchar(40) NOT NULL DEFAULT '',
        phone_number_id varchar(40) NOT NULL DEFAULT '',
        access_token text NOT NULL DEFAULT '',
        environment varchar(20) NOT NULL DEFAULT 'test',
        max_attempts integer NOT NULL DEFAULT 3,
        retry_interval_minutes integer NOT NULL DEFAULT 15,
        send_window_start varchar(5) NULL,
        send_window_end varchar(5) NULL,
        consent_text text NOT NULL,
        public_link_origin varchar(200) NOT NULL DEFAULT '',
        webhook_verify_token varchar(80) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT chk_whatsapp_settings_environment CHECK (environment IN ('test', 'production')),
        CONSTRAINT chk_whatsapp_settings_attempts CHECK (max_attempts BETWEEN 1 AND 10),
        CONSTRAINT chk_whatsapp_settings_retry CHECK (retry_interval_minutes BETWEEN 1 AND 120)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        code varchar(40) NOT NULL,
        body text NOT NULL,
        meta_name varchar(80) NOT NULL,
        meta_language varchar(10) NOT NULL DEFAULT 'pt_BR',
        status varchar(20) NOT NULL DEFAULT 'draft',
        status_detail text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT uq_whatsapp_templates_code UNIQUE (tenant_id, code),
        CONSTRAINT chk_whatsapp_templates_code CHECK (code IN ('os_opened', 'ready_for_pickup')),
        CONSTRAINT chk_whatsapp_templates_status CHECK (status IN ('draft', 'pending', 'approved', 'rejected'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_number_history (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        phone_display varchar(40) NOT NULL,
        phone_number_id varchar(40) NOT NULL,
        replaced_at timestamptz NOT NULL DEFAULT now(),
        replaced_by uuid NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        service_order_id uuid NOT NULL,
        group_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        kind varchar(40) NOT NULL,
        status varchar(20) NOT NULL,
        body_snapshot text NOT NULL DEFAULT '',
        to_phone varchar(20) NOT NULL DEFAULT '',
        attempt_count integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error text NULL,
        meta_message_id varchar(160) NULL,
        sent_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_whatsapp_messages_kind CHECK (kind IN ('os_opened', 'ready_for_pickup')),
        CONSTRAINT chk_whatsapp_messages_status CHECK (status IN ('queued', 'sending', 'accepted', 'sent', 'failed', 'skipped'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_opened
      ON whatsapp_messages (tenant_id, group_id)
      WHERE kind = 'os_opened'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_ready
      ON whatsapp_messages (tenant_id, service_order_id)
      WHERE kind = 'ready_for_pickup'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_whatsapp_messages_due
      ON whatsapp_messages (status, next_attempt_at)
    `);
    await queryRunner.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS whatsapp_consent boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS whatsapp_consent_text text NULL
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
          ('whatsapp.read', 'Avisos ao cliente', 'Vê a fila e as falhas do WhatsApp'),
          ('whatsapp.write', 'Configurar WhatsApp', 'Altera número, modelos e horário de envio'),
          ('whatsapp.resend', 'Reenviar aviso', 'Coloca de novo na fila um aviso que falhou')
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
          ('ATENDENTE', 'whatsapp.read'),
          ('ATENDENTE', 'whatsapp.resend'),
          ('GERENTE', 'whatsapp.read'),
          ('GERENTE', 'whatsapp.write'),
          ('GERENTE', 'whatsapp.resend'),
          ('MASTER_ADMINISTRATOR', 'whatsapp.read'),
          ('MASTER_ADMINISTRATOR', 'whatsapp.write'),
          ('MASTER_ADMINISTRATOR', 'whatsapp.resend')
      ) AS needed(role_code, code) ON upper(r.code) = needed.role_code
      JOIN permissions p ON p.tenant_id = r.tenant_id AND p.code = needed.code
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions existing
        WHERE existing.role_id = r.id AND existing.permission_id = p.id
      )
    `);
    for (const table of TABLES) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO anexsys_app;
            ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
            ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS tenant_isolation ON ${table};
            CREATE POLICY tenant_isolation ON ${table}
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS whatsapp_messages');
    await queryRunner.query('DROP TABLE IF EXISTS whatsapp_number_history');
    await queryRunner.query('DROP TABLE IF EXISTS whatsapp_templates');
    await queryRunner.query('DROP TABLE IF EXISTS whatsapp_settings');
    await queryRunner.query('ALTER TABLE customers DROP COLUMN IF EXISTS whatsapp_consent_text');
    await queryRunner.query('ALTER TABLE customers DROP COLUMN IF EXISTS whatsapp_consent_at');
    await queryRunner.query('ALTER TABLE customers DROP COLUMN IF EXISTS whatsapp_consent');
  }
}
