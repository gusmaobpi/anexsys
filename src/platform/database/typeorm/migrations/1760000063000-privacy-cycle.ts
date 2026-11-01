import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['privacy_settings', 'data_subject_requests', 'processing_activities', 'privacy_incidents'];

export class PrivacyCycle1760000063000 implements MigrationInterface {
  name = 'PrivacyCycle1760000063000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_settings (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL UNIQUE,
        privacy_notice text NOT NULL,
        acceptance_text text NOT NULL,
        operator_terms text NOT NULL,
        incident_plan text NOT NULL,
        link_margin_days integer NOT NULL DEFAULT 30,
        retention_inactive_years integer NOT NULL DEFAULT 5,
        address_retention_days integer NOT NULL DEFAULT 30,
        subject_response_days integer NOT NULL DEFAULT 15,
        dpo_name varchar(120) NOT NULL DEFAULT '',
        dpo_email varchar(200) NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT chk_privacy_settings_link_margin CHECK (link_margin_days BETWEEN 0 AND 3650),
        CONSTRAINT chk_privacy_settings_retention_years CHECK (retention_inactive_years BETWEEN 1 AND 20),
        CONSTRAINT chk_privacy_settings_address_days CHECK (address_retention_days BETWEEN 1 AND 3650),
        CONSTRAINT chk_privacy_settings_response_days CHECK (subject_response_days BETWEEN 1 AND 90)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_subject_requests (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        protocol_no integer NOT NULL,
        customer_id uuid,
        requester_name varchar(160) NOT NULL,
        request_type varchar(30) NOT NULL,
        description text NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'open',
        opened_on date NOT NULL,
        due_on date NOT NULL,
        response_text text NOT NULL DEFAULT '',
        responded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT uq_data_subject_requests_protocol UNIQUE (tenant_id, protocol_no),
        CONSTRAINT chk_data_subject_requests_type CHECK (request_type IN ('access', 'correction', 'anonymization', 'deletion', 'portability')),
        CONSTRAINT chk_data_subject_requests_status CHECK (status IN ('open', 'answered'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS processing_activities (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        code varchar(40) NOT NULL,
        title varchar(160) NOT NULL,
        data_categories text NOT NULL,
        purpose text NOT NULL,
        legal_basis text NOT NULL,
        storage text NOT NULL,
        notes text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT uq_processing_activities_code UNIQUE (tenant_id, code)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_incidents (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        protocol_no integer NOT NULL,
        title varchar(160) NOT NULL,
        description text NOT NULL,
        occurred_on date NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'open',
        notified_on date,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT uq_privacy_incidents_protocol UNIQUE (tenant_id, protocol_no),
        CONSTRAINT chk_privacy_incidents_status CHECK (status IN ('open', 'contained', 'notified'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_data_subject_requests_tenant ON data_subject_requests (tenant_id, opened_on DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_privacy_incidents_tenant ON privacy_incidents (tenant_id, occurred_on DESC)`);
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
          ('privacy.read', 'Consultar privacidade', 'Vê aviso, pedidos do titular, tratamento e incidentes'),
          ('privacy.write', 'Alterar privacidade', 'Edita textos, responde pedidos e registra incidentes')
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
          ('GERENTE', 'privacy.read'),
          ('GERENTE', 'privacy.write'),
          ('ATENDENTE', 'privacy.read'),
          ('ATENDENTE', 'privacy.write'),
          ('MASTER_ADMINISTRATOR', 'privacy.read'),
          ('MASTER_ADMINISTRATOR', 'privacy.write')
      ) AS needed(role_code, code) ON upper(r.code) = needed.role_code
      JOIN permissions p ON p.tenant_id = r.tenant_id AND p.code = needed.code
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions existing
        WHERE existing.role_id = r.id AND existing.permission_id = p.id
      )
    `);
    const grantList = TABLES.map((table) => `GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO anexsys_app;`).join('\n');
    const policyList = TABLES.map(
      (table) => `
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
      `,
    ).join('\n');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
          ${grantList}
          ${policyList}
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS privacy_incidents');
    await queryRunner.query('DROP TABLE IF EXISTS processing_activities');
    await queryRunner.query('DROP TABLE IF EXISTS data_subject_requests');
    await queryRunner.query('DROP TABLE IF EXISTS privacy_settings');
  }
}
